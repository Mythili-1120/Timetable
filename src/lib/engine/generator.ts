import { CollegeSettings, TeachingAssignment, Subject, Staff, TimetableSlot } from '../../types';

export interface GenerationInput {
  classId: string;
  classLabel: string;
  departmentId: string;
  academicYear: string;
  assignments: TeachingAssignment[];
  subjectsMap: Map<string, Subject>;
  staffMap: Map<string, Staff>;
  collegeSettings: CollegeSettings;
  globalBusySlots: Map<string, TimetableSlot>; // key: `${memberId}_${dayIdx}_${periodIdx}`
}

export interface GenerationResult {
  success: boolean;
  grid: (TimetableSlot | null)[][];
  totalAllocated: number;
  totalRequired: number;
  diagnostics?: string[];
  conflictingStaff?: string[];
  variantIndex?: number;
  qualityScore?: number;
  similarityScore?: number;
}

export interface SlotSwapValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Enterprise Global Constraint Satisfaction Problem (CSP) Solver & Multi-Candidate Diversity Engine.
 * Supports Single-Subject, Multi-Subject, Continuous Labs, and Multi-Tier Balanced Scheduling.
 * Enforces global conflict prevention keyed strictly by `memberId + dayIdx + periodIdx`.
 */
export class TimetableEngine {
  /**
   * Generates a single candidate timetable variant with controlled search order.
   */
  static generateCandidate(
    input: GenerationInput,
    variantIndex = 0,
    previousGrid?: (TimetableSlot | null)[][]
  ): GenerationResult {
    const {
      classId,
      classLabel,
      departmentId,
      assignments,
      subjectsMap,
      staffMap,
      collegeSettings,
      globalBusySlots
    } = input;

    const daysCount = collegeSettings.workingDays?.length || 6;
    const periods = collegeSettings.periods || [];
    const teachingPeriods = periods.filter(p => !p.isBreak);
    const periodsPerDay = teachingPeriods.length || 7;

    // Initialize Days x Periods empty grid
    const grid: (TimetableSlot | null)[][] = Array.from({ length: daysCount }, () =>
      Array(periodsPerDay).fill(null)
    );

    // Validate and collect active assignments
    let totalRequired = 0;
    const validAssignments: TeachingAssignment[] = [];
    const diagnostics: string[] = [];

    for (const asgn of assignments) {
      if (asgn.status === 'INACTIVE') continue;
      const subj = subjectsMap.get(asgn.subjectId);
      const staff = staffMap.get(asgn.memberId);

      if (!subj) {
        diagnostics.push(`Subject ID [${asgn.subjectId}] not found in subject catalog.`);
        continue;
      }
      if (!staff || staff.status === 'INACTIVE') {
        diagnostics.push(`Staff Member ID [${asgn.memberId}] is inactive or does not exist.`);
        continue;
      }

      totalRequired += asgn.weeklyHours;
      validAssignments.push(asgn);
    }

    if (validAssignments.length === 0) {
      return {
        success: false,
        grid,
        totalAllocated: 0,
        totalRequired: 0,
        diagnostics: ['No valid teaching assignments available to generate timetable.'],
        variantIndex,
        qualityScore: 0,
        similarityScore: 0
      };
    }

    const weeklyCapacity = daysCount * periodsPerDay;
    if (totalRequired > weeklyCapacity) {
      return {
        success: false,
        grid,
        totalAllocated: 0,
        totalRequired,
        diagnostics: [
          `Total required curriculum hours (${totalRequired} hrs) exceed weekly timetable capacity (${weeklyCapacity} periods).`
        ],
        variantIndex,
        qualityScore: 0,
        similarityScore: 0
      };
    }

    // Separate Lab and Theory assignments
    const labAssignments = validAssignments.filter(a => a.type === 'Lab');
    const theoryAssignments = validAssignments.filter(a => a.type === 'Theory');

    // -------------------------------------------------------------------------
    // 1. PLACE LAB ASSIGNMENTS FIRST (Continuous Multi-Period Blocks with Permutation)
    // -------------------------------------------------------------------------
    for (let labIdx = 0; labIdx < labAssignments.length; labIdx++) {
      const lab = labAssignments[labIdx];
      const subj = subjectsMap.get(lab.subjectId)!;
      const staff = staffMap.get(lab.memberId)!;
      const blockSize = subj.labBlockHours || lab.weeklyHours || (lab.weeklyHours >= 4 ? 4 : lab.weeklyHours >= 3 ? 3 : 2);

      let placed = false;
      // Controlled variation: vary start period preferences between morning and afternoon blocks
      const baseStarts =
        blockSize <= 2 ? [0, 1, 3, 5] : blockSize <= 3 ? [0, 3, 4] : [0, 3];
      const validLabStarts =
        variantIndex % 2 === 1 ? [...baseStarts].reverse() : baseStarts;

      // Permute day search order using variant offset to avoid always clustering on Day 0
      const dayShift = (variantIndex * 2 + labIdx) % daysCount;

      for (let d = 0; d < daysCount && !placed; d++) {
        const day = (d + dayShift) % daysCount;

        for (const startPeriod of validLabStarts) {
          if (startPeriod + blockSize > periodsPerDay) continue;

          // Check if slots are free in this class grid and no global staff clash
          let canFit = true;
          for (let p = 0; p < blockSize; p++) {
            const periodIdx = startPeriod + p;
            if (grid[day][periodIdx] !== null) {
              canFit = false;
              break;
            }
            const clashKey = `${lab.memberId}_${day}_${periodIdx}`;
            if (globalBusySlots.has(clashKey)) {
              canFit = false;
              break;
            }
          }

          if (canFit) {
            for (let p = 0; p < blockSize; p++) {
              const periodIdx = startPeriod + p;
              grid[day][periodIdx] = {
                dayIdx: day,
                periodIdx,
                memberId: lab.memberId,
                staffName: staff.displayName || staff.staffName,
                subjectId: lab.subjectId,
                subjectCode: subj.code,
                subjectName: subj.name,
                type: 'Lab',
                departmentId,
                classId,
                classLabel
              };
            }
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        return {
          success: false,
          grid,
          totalAllocated: 0,
          totalRequired,
          diagnostics: [
            `Failed to schedule continuous Lab block (${blockSize} hours) for [${subj.code} - ${subj.name}]. Faculty [${staff.displayName} (${lab.memberId})] has global timetable clashes or available slot shortage.`
          ],
          conflictingStaff: [lab.memberId],
          variantIndex,
          qualityScore: 0,
          similarityScore: 0
        };
      }
    }

    // -------------------------------------------------------------------------
    // 2. PLACE THEORY ASSIGNMENTS (Balanced Scheduling with Multi-Tier Relaxation)
    // -------------------------------------------------------------------------
    // Build theory queue: one entry per single required teaching hour
    const theoryQueue: { asgn: TeachingAssignment; subj: Subject; staff: Staff; hourIndex: number }[] = [];
    for (const t of theoryAssignments) {
      const subj = subjectsMap.get(t.subjectId)!;
      const staff = staffMap.get(t.memberId)!;
      for (let h = 0; h < t.weeklyHours; h++) {
        theoryQueue.push({ asgn: t, subj, staff, hourIndex: h });
      }
    }

    // Sort queue: baseline is most constrained faculty first
    theoryQueue.sort((a, b) => {
      let aClashes = 0, bClashes = 0;
      globalBusySlots.forEach((_, key) => {
        if (key.startsWith(`${a.asgn.memberId}_`)) aClashes++;
        if (key.startsWith(`${b.asgn.memberId}_`)) bClashes++;
      });
      if (bClashes !== aClashes) return bClashes - aClashes;
      return b.asgn.weeklyHours - a.asgn.weeklyHours;
    });

    // Controlled diversity: if variantIndex > 0, permute assignments with equal constraint counts
    if (variantIndex > 0 && theoryQueue.length > 1) {
      // Deterministic rotation based on variantIndex
      const rotationOffset = (variantIndex * 3) % theoryQueue.length;
      const rotated = [
        ...theoryQueue.slice(rotationOffset),
        ...theoryQueue.slice(0, rotationOffset)
      ];
      theoryQueue.splice(0, theoryQueue.length, ...rotated);
    }

    // Helper: Staggered candidate periods for balanced rotation across days
    function getCandidatePeriods(day: number, stagger: boolean): number[] {
      if (!stagger) {
        return Array.from({ length: periodsPerDay }, (_, i) => i);
      }
      // Rotates starting period by (day * 2 + variantIndex * 3) % periodsPerDay to prevent repetitive slots
      const offset = (day * 2 + variantIndex * 3) % periodsPerDay;
      return Array.from({ length: periodsPerDay }, (_, i) => (offset + i) % periodsPerDay);
    }

    // Backtracking solver parameterized by relaxation tier
    function solveTier(
      idx: number,
      tier: 1 | 2 | 3,
      workingGrid: (TimetableSlot | null)[][]
    ): boolean {
      if (idx >= theoryQueue.length) return true;

      const { asgn, subj, staff } = theoryQueue[idx];
      const targetMaxPerDay =
        tier === 1
          ? Math.max(1, Math.ceil(asgn.weeklyHours / daysCount))
          : tier === 2
          ? Math.min(3, Math.max(1, Math.ceil(asgn.weeklyHours / daysCount)) + 1)
          : 4;

      const enforceNoConsecutive = tier <= 2;
      const staggerPeriods = tier === 1;

      // Try each working day with variant offset
      for (let d = 0; d < daysCount; d++) {
        const day = (d + (variantIndex % daysCount)) % daysCount;

        // Daily capacity limit for this subject
        const currentCountOnDay = workingGrid[day].reduce(
          (acc, cell) => (cell && cell.subjectId === asgn.subjectId ? acc + 1 : acc),
          0
        );
        if (currentCountOnDay >= targetMaxPerDay) continue;

        const candidatePeriods = getCandidatePeriods(day, staggerPeriods);

        for (const p of candidatePeriods) {
          if (workingGrid[day][p] !== null) continue;

          // Prevent consecutive duplicate theory period
          if (enforceNoConsecutive) {
            if (p > 0 && workingGrid[day][p - 1]?.subjectId === asgn.subjectId) continue;
            if (p < periodsPerDay - 1 && workingGrid[day][p + 1]?.subjectId === asgn.subjectId) continue;
          }

          // Check global faculty collision across the institution
          const clashKey = `${asgn.memberId}_${day}_${p}`;
          if (globalBusySlots.has(clashKey)) continue;

          // Tentative placement
          workingGrid[day][p] = {
            dayIdx: day,
            periodIdx: p,
            memberId: asgn.memberId,
            staffName: staff.displayName || staff.staffName,
            subjectId: asgn.subjectId,
            subjectCode: subj.code,
            subjectName: subj.name,
            type: 'Theory',
            departmentId,
            classId,
            classLabel
          };

          if (solveTier(idx + 1, tier, workingGrid)) return true;

          // Backtrack
          workingGrid[day][p] = null;
        }
      }

      return false;
    }

    // Clone initial grid with labs placed
    const cloneGrid = (source: (TimetableSlot | null)[][]): (TimetableSlot | null)[][] =>
      source.map(row => [...row]);

    // Multi-tier attempt: Tier 1 (Strict Balance) -> Tier 2 (Soft Relaxation) -> Tier 3 (Full Backtrack)
    let solved = false;
    let finalGrid = cloneGrid(grid);

    if (theoryQueue.length === 0) {
      solved = true;
    } else {
      for (const tier of [1, 2, 3] as const) {
        const attemptGrid = cloneGrid(grid);
        if (solveTier(0, tier, attemptGrid)) {
          finalGrid = attemptGrid;
          solved = true;
          break;
        }
      }
    }

    // Count total successfully allocated slots
    let totalAllocated = 0;
    for (let d = 0; d < daysCount; d++) {
      for (let p = 0; p < periodsPerDay; p++) {
        if (finalGrid[d][p] !== null) totalAllocated++;
      }
    }

    if (!solved || totalAllocated < totalRequired) {
      return {
        success: false,
        grid: finalGrid,
        totalAllocated,
        totalRequired,
        diagnostics: [
          `Constraint satisfaction failed: Could not allocate all ${totalRequired} curriculum hours without faculty collisions. Only ${totalAllocated} hours could be placed collision-free.`
        ],
        variantIndex,
        qualityScore: 0,
        similarityScore: 0
      };
    }

    // Calculate Quality Score (0-100)
    // 1. Balance of load across days
    const dailyCounts = finalGrid.map(row => row.filter(Boolean).length);
    const meanDaily = totalAllocated / daysCount;
    const variance = dailyCounts.reduce((acc, c) => acc + Math.pow(c - meanDaily, 2), 0) / daysCount;
    const balancePenalty = Math.min(25, variance * 5);

    // 2. Morning vs Afternoon distribution balance
    let morningSlots = 0;
    let afternoonSlots = 0;
    for (let d = 0; d < daysCount; d++) {
      for (let p = 0; p < periodsPerDay; p++) {
        if (finalGrid[d][p]) {
          if (p < 3) morningSlots++;
          else afternoonSlots++;
        }
      }
    }
    const sessionRatio = Math.abs(morningSlots - afternoonSlots) / Math.max(1, totalAllocated);
    const sessionPenalty = Math.min(15, sessionRatio * 30);

    const qualityScore = Math.max(50, Math.round(100 - balancePenalty - sessionPenalty));

    // Calculate Similarity to Previous Grid (0-100)
    let similarityScore = 0;
    if (previousGrid && previousGrid.length === daysCount) {
      let matchingSlots = 0;
      for (let d = 0; d < daysCount; d++) {
        for (let p = 0; p < periodsPerDay; p++) {
          const currentCell = finalGrid[d][p];
          const prevCell = previousGrid[d] ? previousGrid[d][p] : null;
          if (currentCell && prevCell && currentCell.subjectId === prevCell.subjectId) {
            matchingSlots++;
          }
        }
      }
      similarityScore = Math.round((matchingSlots / Math.max(1, totalAllocated)) * 100);
    }

    return {
      success: true,
      grid: finalGrid,
      totalAllocated,
      totalRequired,
      diagnostics: [],
      variantIndex,
      qualityScore,
      similarityScore
    };
  }

  /**
   * Generates multiple diverse valid candidate variants (target: up to 10 distinct schedules).
   * Ranks candidates by timetable quality and penalizes excessive similarity to previous drafts.
   */
  static generateDiverseCandidates(
    input: GenerationInput,
    targetCandidatesCount = 10,
    previousGrid?: (TimetableSlot | null)[][]
  ): {
    candidates: GenerationResult[];
    bestCandidate: GenerationResult;
  } {
    const validCandidates: GenerationResult[] = [];
    const seenGridSignatures = new Set<string>();

    const maxAttempts = Math.min(20, targetCandidatesCount * 2);

    for (let variant = 0; variant < maxAttempts && validCandidates.length < targetCandidatesCount; variant++) {
      const result = this.generateCandidate(input, variant, previousGrid);

      if (result.success) {
        // Construct canonical structural signature to ensure genuine diversity
        const signature = result.grid
          .map(row => row.map(c => (c ? `${c.subjectId}_${c.memberId}` : '-')).join(','))
          .join(';');

        if (!seenGridSignatures.has(signature)) {
          seenGridSignatures.add(signature);
          validCandidates.push(result);
        }
      }
    }

    // Rank candidates by composite score: Quality Score penalized by similarity to previous layout
    validCandidates.sort((a, b) => {
      const scoreA = (a.qualityScore || 80) - (a.similarityScore || 0) * 0.4;
      const scoreB = (b.qualityScore || 80) - (b.similarityScore || 0) * 0.4;
      return scoreB - scoreA;
    });

    const bestCandidate =
      validCandidates.length > 0
        ? validCandidates[0]
        : this.generateCandidate(input, 0, previousGrid);

    return {
      candidates: validCandidates,
      bestCandidate
    };
  }

  /**
   * Standard single-run generation entry point (Backward-compatible).
   */
  static generate(input: GenerationInput): GenerationResult {
    return this.generateCandidate(input, 0);
  }
}

/**
 * Authoritative Slot Swap & Move Validation.
 * Validates real-time manual slot adjustments against global faculty busy slots, daily limits, and lab continuity.
 */
export function validateSlotSwap(
  grid: (TimetableSlot | null)[][],
  sourceDay: number,
  sourcePeriod: number,
  targetDay: number,
  targetPeriod: number,
  globalBusySlots: Map<string, TimetableSlot>,
  classId: string,
  daysCount = 6,
  periodsPerDay = 7
): SlotSwapValidation {
  if (
    sourceDay < 0 || sourceDay >= daysCount ||
    sourcePeriod < 0 || sourcePeriod >= periodsPerDay ||
    targetDay < 0 || targetDay >= daysCount ||
    targetPeriod < 0 || targetPeriod >= periodsPerDay
  ) {
    return { valid: false, reason: 'Slot coordinates out of bounds.' };
  }

  if (sourceDay === targetDay && sourcePeriod === targetPeriod) {
    return { valid: false, reason: 'Source and target slots are identical.' };
  }

  const slotA = grid[sourceDay][sourcePeriod];
  const slotB = grid[targetDay][targetPeriod];

  if (!slotA && !slotB) {
    return { valid: false, reason: 'Both selected slots are empty.' };
  }

  // Prevent breaking continuous multi-period Lab blocks
  if (slotA?.type === 'Lab') {
    return {
      valid: false,
      reason: `Cannot move individual slot of laboratory [${slotA.subjectCode}]. Laboratory blocks must remain continuous.`
    };
  }
  if (slotB?.type === 'Lab') {
    return {
      valid: false,
      reason: `Cannot displace laboratory slot [${slotB.subjectCode}]. Laboratory blocks must remain continuous.`
    };
  }

  // Verify Global Faculty Collisions for Slot A moving to (targetDay, targetPeriod)
  if (slotA) {
    const clashKey = `${slotA.memberId}_${targetDay}_${targetPeriod}`;
    const busy = globalBusySlots.get(clashKey);
    if (busy && busy.classId !== classId) {
      return {
        valid: false,
        reason: `Faculty ${slotA.staffName} (${slotA.memberId}) has a conflicting timetable slot in [${busy.classLabel}] on Day ${targetDay + 1}, Period ${targetPeriod + 1}.`
      };
    }
  }

  // Verify Global Faculty Collisions for Slot B moving to (sourceDay, sourcePeriod)
  if (slotB) {
    const clashKey = `${slotB.memberId}_${sourceDay}_${sourcePeriod}`;
    const busy = globalBusySlots.get(clashKey);
    if (busy && busy.classId !== classId) {
      return {
        valid: false,
        reason: `Faculty ${slotB.staffName} (${slotB.memberId}) has a conflicting timetable slot in [${busy.classLabel}] on Day ${sourceDay + 1}, Period ${sourcePeriod + 1}.`
      };
    }
  }

  // Verify Daily Subject Limit for Subject A when moving between days
  if (slotA && sourceDay !== targetDay) {
    const targetDayCount = grid[targetDay].reduce(
      (acc, cell, p) => (p !== targetPeriod && cell?.subjectId === slotA.subjectId ? acc + 1 : acc),
      0
    );
    if (targetDayCount >= 3) {
      return {
        valid: false,
        reason: `Subject [${slotA.subjectCode}] already has ${targetDayCount} periods on Day ${targetDay + 1}. Maximum 3 periods per day permitted.`
      };
    }
  }

  // Verify Daily Subject Limit for Subject B when moving between days
  if (slotB && sourceDay !== targetDay) {
    const sourceDayCount = grid[sourceDay].reduce(
      (acc, cell, p) => (p !== sourcePeriod && cell?.subjectId === slotB.subjectId ? acc + 1 : acc),
      0
    );
    if (sourceDayCount >= 3) {
      return {
        valid: false,
        reason: `Subject [${slotB.subjectCode}] already has ${sourceDayCount} periods on Day ${sourceDay + 1}. Maximum 3 periods per day permitted.`
      };
    }
  }

  return { valid: true };
}
