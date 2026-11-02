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

export interface DiverseGenerationOptions {
  maxSearchAttempts?: number; // Target: explore up to 100 candidate attempts (default 100)
  maxTimeMs?: number; // Bounded compute time limit in milliseconds (default 3000ms)
  currentGrid?: (TimetableSlot | null)[][];
  previousFingerprints?: string[];
  seedOffset?: number;
}

export interface DiverseAlternativeResult {
  success: boolean;
  selectedCandidate?: GenerationResult;
  diagnostics?: string[];
  totalExploredAttempts: number;
  uniqueValidFound: number;
  fingerprint?: string;
  similarityToCurrent?: number;
}

export interface SlotSwapValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Computes a structural fingerprint string for a timetable grid.
 * Keyed strictly by subjectId + memberId per slot position.
 */
export function computeTimetableFingerprint(grid: (TimetableSlot | null)[][]): string {
  if (!grid || grid.length === 0) return '';
  return grid
    .map(row => row.map(cell => (cell ? `${cell.subjectId}@${cell.memberId}` : '-')).join(','))
    .join(';');
}

/**
 * Computes percentage similarity between two timetable grids (0 to 100%).
 */
export function calculateTimetableSimilarity(
  gridA: (TimetableSlot | null)[][],
  gridB: (TimetableSlot | null)[][]
): number {
  if (!gridA || !gridB || gridA.length === 0 || gridB.length === 0) return 0;
  const days = Math.min(gridA.length, gridB.length);
  const periods = Math.min(gridA[0]?.length || 0, gridB[0]?.length || 0);

  let matching = 0;
  let total = 0;

  for (let d = 0; d < days; d++) {
    for (let p = 0; p < periods; p++) {
      const cellA = gridA[d]?.[p];
      const cellB = gridB[d]?.[p];
      if (cellA || cellB) {
        total++;
        if (cellA && cellB && cellA.subjectId === cellB.subjectId && cellA.memberId === cellB.memberId) {
          matching++;
        }
      }
    }
  }

  return total > 0 ? Math.round((matching / total) * 100) : 0;
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
      // Controlled variation: explore diverse morning and afternoon starts
      const startPattern = variantIndex % 4;
      const baseStarts =
        blockSize <= 2 ? [0, 1, 3, 5] : blockSize <= 3 ? [0, 3, 4] : [0, 3];
      let validLabStarts = baseStarts;
      if (startPattern === 1) {
        validLabStarts = [...baseStarts].reverse();
      } else if (startPattern === 2) {
        validLabStarts = blockSize <= 2 ? [3, 5, 0, 1] : [3, 0];
      } else if (startPattern === 3) {
        validLabStarts = blockSize <= 2 ? [1, 5, 0, 3] : [0, 3];
      }

      // Permute day search order using variant offset to avoid always clustering on Day 0
      const dayShift = (variantIndex * 3 + labIdx * 2) % daysCount;

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
      const mode = variantIndex % 4;
      if (mode === 1) {
        const rotationOffset = (variantIndex * 3) % theoryQueue.length;
        const rotated = [
          ...theoryQueue.slice(rotationOffset),
          ...theoryQueue.slice(0, rotationOffset)
        ];
        theoryQueue.splice(0, theoryQueue.length, ...rotated);
      } else if (mode === 2) {
        const rotationOffset = (variantIndex * 5) % theoryQueue.length;
        const rotated = [
          ...theoryQueue.slice(rotationOffset),
          ...theoryQueue.slice(0, rotationOffset)
        ].reverse();
        theoryQueue.splice(0, theoryQueue.length, ...rotated);
      } else if (mode === 3) {
        const half = Math.floor(theoryQueue.length / 2);
        const swapped = [...theoryQueue.slice(half), ...theoryQueue.slice(0, half)];
        theoryQueue.splice(0, theoryQueue.length, ...swapped);
      }
    }

    // Helper: Staggered candidate periods for balanced rotation across days
    function getCandidatePeriods(day: number, stagger: boolean): number[] {
      const mode = Math.floor(variantIndex / 2) % 3;
      if (!stagger) {
        if (mode === 1) {
          return Array.from({ length: periodsPerDay }, (_, i) => periodsPerDay - 1 - i);
        }
        return Array.from({ length: periodsPerDay }, (_, i) => i);
      }
      const offset = (day * 2 + variantIndex * 3) % periodsPerDay;
      if (mode === 1) {
        return Array.from({ length: periodsPerDay }, (_, i) => (offset + periodsPerDay - 1 - i) % periodsPerDay);
      }
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
   * Explores a bounded candidate search space (target: up to 100 candidate attempts)
   * entirely inside the engine layer. Rejects exact duplicates, penalizes near-duplicates,
   * balances daily workload, and selects the single best diverse schedule.
   * Does NOT return the entire candidate array to the client.
   */
  static generateDiverseAlternative(
    input: GenerationInput,
    options: DiverseGenerationOptions = {}
  ): DiverseAlternativeResult {
    const maxAttempts = options.maxSearchAttempts || 100;
    const timeLimitMs = options.maxTimeMs || 3000;
    const startTime = Date.now();

    const currentFingerprint = options.currentGrid
      ? computeTimetableFingerprint(options.currentGrid)
      : '';

    const excludedFingerprints = new Set<string>();
    if (currentFingerprint) excludedFingerprints.add(currentFingerprint);
    if (options.previousFingerprints) {
      options.previousFingerprints.forEach(fp => {
        if (fp) excludedFingerprints.add(fp);
      });
    }

    const seenInRun = new Set<string>();
    const validCandidates: {
      result: GenerationResult;
      fingerprint: string;
      similarity: number;
      compositeScore: number;
    }[] = [];

    let attemptsExecuted = 0;
    const baseSeed = options.seedOffset || 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Respect bounded compute budget
      if (Date.now() - startTime > timeLimitMs) {
        break;
      }

      attemptsExecuted++;
      const variantIndex = baseSeed + attempt;
      const candidate = this.generateCandidate(input, variantIndex, options.currentGrid);

      if (candidate.success && candidate.grid) {
        const fp = computeTimetableFingerprint(candidate.grid);

        // Skip exact structural duplicate already evaluated in this run
        if (seenInRun.has(fp)) continue;
        seenInRun.add(fp);

        // Check if exact duplicate of current or previous draft
        const isHistoricalDuplicate = excludedFingerprints.has(fp);

        const similarity = options.currentGrid
          ? calculateTimetableSimilarity(candidate.grid, options.currentGrid)
          : 0;

        // Diversity reward: higher score for different placements
        const diversityBonus = 100 - similarity; // 0 (identical) to 100 (completely different)

        // Calculate composite score
        // If historical duplicate: heavy penalty (-1000) so it's only chosen as last resort
        const duplicatePenalty = isHistoricalDuplicate ? 1000 : 0;
        const compositeScore =
          (candidate.qualityScore || 80) * 0.4 +
          diversityBonus * 0.6 -
          duplicatePenalty;

        validCandidates.push({
          result: candidate,
          fingerprint: fp,
          similarity,
          compositeScore
        });

        // Early exit optimization: if we have found at least 10 unique valid candidates
        // and explored at least 30 attempts with high diversity and quality
        if (validCandidates.length >= 10 && attempt >= 30 && compositeScore >= 85) {
          break;
        }
      }
    }

    // If no valid candidates were produced
    if (validCandidates.length === 0) {
      const fallback = this.generateCandidate(input, 0, options.currentGrid);
      return {
        success: false,
        diagnostics: fallback.diagnostics || [
          'Constraint satisfaction failed: Could not generate a valid timetable satisfying all faculty and section constraints.'
        ],
        totalExploredAttempts: attemptsExecuted,
        uniqueValidFound: 0
      };
    }

    // Sort candidates by composite score descending (highest quality and diversity first)
    validCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

    // Prefer non-duplicate if one exists
    const nonDuplicates = validCandidates.filter(c => c.fingerprint !== currentFingerprint);
    const chosen = nonDuplicates.length > 0 ? nonDuplicates[0] : validCandidates[0];

    return {
      success: true,
      selectedCandidate: chosen.result,
      diagnostics: [],
      totalExploredAttempts: attemptsExecuted,
      uniqueValidFound: validCandidates.length,
      fingerprint: chosen.fingerprint,
      similarityToCurrent: chosen.similarity
    };
  }

  /**
   * Generates multiple diverse valid candidate variants (target: up to 10 distinct schedules).
   * Backward-compatible entry point for existing tests or callers.
   */
  static generateDiverseCandidates(
    input: GenerationInput,
    targetCandidatesCount = 10,
    previousGrid?: (TimetableSlot | null)[][]
  ): {
    candidates: GenerationResult[];
    bestCandidate: GenerationResult;
  } {
    const alternative = this.generateDiverseAlternative(input, {
      maxSearchAttempts: Math.max(20, targetCandidatesCount * 3),
      currentGrid: previousGrid
    });

    if (alternative.success && alternative.selectedCandidate) {
      return {
        candidates: [alternative.selectedCandidate],
        bestCandidate: alternative.selectedCandidate
      };
    }

    const fallback = this.generateCandidate(input, 0, previousGrid);
    return {
      candidates: [fallback],
      bestCandidate: fallback
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
