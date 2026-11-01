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
}

export class TimetableEngine {
  /**
   * Enterprise Global Constraint Satisfaction Problem (CSP) Solver
   * Supports Single-Subject, Multi-Subject, Continuous Labs, and Multi-Tier Balanced Scheduling.
   * Enforces global conflict prevention keyed strictly by `memberId + dayIdx + periodIdx`.
   */
  static generate(input: GenerationInput): GenerationResult {
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
        diagnostics: ['No valid teaching assignments available to generate timetable.']
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
        ]
      };
    }

    // Separate Lab and Theory assignments
    const labAssignments = validAssignments.filter(a => a.type === 'Lab');
    const theoryAssignments = validAssignments.filter(a => a.type === 'Theory');

    // -------------------------------------------------------------------------
    // 1. PLACE LAB ASSIGNMENTS FIRST (Continuous Multi-Period Blocks)
    // -------------------------------------------------------------------------
    for (const lab of labAssignments) {
      const subj = subjectsMap.get(lab.subjectId)!;
      const staff = staffMap.get(lab.memberId)!;
      const blockSize = subj.labBlockHours || lab.weeklyHours || (lab.weeklyHours >= 4 ? 4 : lab.weeklyHours >= 3 ? 3 : 2);

      let placed = false;
      // Valid start periods to avoid crossing college breaks
      const validLabStarts =
        blockSize <= 2 ? [0, 1, 3, 5] : blockSize <= 3 ? [0, 3, 4] : [0, 3];

      for (let day = 0; day < daysCount && !placed; day++) {
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
          conflictingStaff: [lab.memberId]
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

    // Sort queue: most constrained faculty first
    theoryQueue.sort((a, b) => {
      let aClashes = 0, bClashes = 0;
      globalBusySlots.forEach((_, key) => {
        if (key.startsWith(`${a.asgn.memberId}_`)) aClashes++;
        if (key.startsWith(`${b.asgn.memberId}_`)) bClashes++;
      });
      if (bClashes !== aClashes) return bClashes - aClashes;
      return b.asgn.weeklyHours - a.asgn.weeklyHours;
    });

    // Helper: Staggered candidate periods for balanced rotation across days
    function getCandidatePeriods(day: number, stagger: boolean): number[] {
      if (!stagger) {
        return Array.from({ length: periodsPerDay }, (_, i) => i);
      }
      // Rotates starting period by (day * 2) % periodsPerDay to prevent repetitive slots
      const offset = (day * 2) % periodsPerDay;
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

      // Try each working day
      for (let d = 0; d < daysCount; d++) {
        // Daily capacity limit for this subject
        const currentCountOnDay = workingGrid[d].reduce(
          (acc, cell) => (cell && cell.subjectId === asgn.subjectId ? acc + 1 : acc),
          0
        );
        if (currentCountOnDay >= targetMaxPerDay) continue;

        const candidatePeriods = getCandidatePeriods(d, staggerPeriods);

        for (const p of candidatePeriods) {
          if (workingGrid[d][p] !== null) continue;

          // Prevent consecutive duplicate theory period
          if (enforceNoConsecutive) {
            if (p > 0 && workingGrid[d][p - 1]?.subjectId === asgn.subjectId) continue;
            if (p < periodsPerDay - 1 && workingGrid[d][p + 1]?.subjectId === asgn.subjectId) continue;
          }

          // Check global faculty collision across the institution
          const clashKey = `${asgn.memberId}_${d}_${p}`;
          if (globalBusySlots.has(clashKey)) continue;

          // Tentative placement
          workingGrid[d][p] = {
            dayIdx: d,
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
          workingGrid[d][p] = null;
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
        ]
      };
    }

    return {
      success: true,
      grid: finalGrid,
      totalAllocated,
      totalRequired,
      diagnostics: []
    };
  }
}
