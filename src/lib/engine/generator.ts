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
   * Global Constraint Satisfaction Problem (CSP) Solver
   * Enforces global conflict checks keyed strictly by `memberId + dayIdx + periodIdx`.
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
    const periodsPerDay = teachingPeriods.length; // 7

    // Initialize 6 x 7 empty grid
    const grid: (TimetableSlot | null)[][] = Array.from({ length: daysCount }, () =>
      Array(periodsPerDay).fill(null)
    );

    // Calculate total required hours
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

    const weeklyCapacity = daysCount * periodsPerDay; // 42
    if (totalRequired > weeklyCapacity) {
      return {
        success: false,
        grid,
        totalAllocated: 0,
        totalRequired,
        diagnostics: [`Total required hours (${totalRequired}) exceed weekly timetable capacity (${weeklyCapacity} periods).`]
      };
    }

    // Separate Lab and Theory assignments
    const labAssignments = validAssignments.filter(a => a.type === 'Lab');
    const theoryAssignments = validAssignments.filter(a => a.type === 'Theory');

    // 1. Place Lab Assignments First (Continuous Blocks)
    for (const lab of labAssignments) {
      const subj = subjectsMap.get(lab.subjectId)!;
      const staff = staffMap.get(lab.memberId)!;
      const blockSize = subj.labBlockHours || lab.weeklyHours || 4;

      let placed = false;
      const validLabStarts = blockSize <= 3 ? [0, 1, 3, 5] : [0, 3]; // Avoid break overlaps

      for (let day = 0; day < daysCount && !placed; day++) {
        for (const startPeriod of validLabStarts) {
          if (startPeriod + blockSize > periodsPerDay) continue;

          // Check if this class's slots are free
          let canFit = true;
          for (let p = 0; p < blockSize; p++) {
            const periodIdx = startPeriod + p;
            if (grid[day][periodIdx] !== null) {
              canFit = false;
              break;
            }
            // Check global staff clash across entire institution
            const clashKey = `${lab.memberId}_${day}_${periodIdx}`;
            if (globalBusySlots.has(clashKey)) {
              canFit = false;
              break;
            }
          }

          if (canFit) {
            // Allocate continuous lab block
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

    // 2. Place Theory Assignments (Distributed evenly, zero consecutive repeats)
    const theoryQueue: { asgn: TeachingAssignment; subj: Subject; staff: Staff }[] = [];
    for (const t of theoryAssignments) {
      const subj = subjectsMap.get(t.subjectId)!;
      const staff = staffMap.get(t.memberId)!;
      for (let h = 0; h < t.weeklyHours; h++) {
        theoryQueue.push({ asgn: t, subj, staff });
      }
    }

    // Sort queue by staff constraint load (most constrained first)
    theoryQueue.sort((a, b) => {
      let aClashes = 0, bClashes = 0;
      globalBusySlots.forEach((val, key) => {
        if (key.startsWith(`${a.asgn.memberId}_`)) aClashes++;
        if (key.startsWith(`${b.asgn.memberId}_`)) bClashes++;
      });
      return bClashes - aClashes;
    });

    // Backtracking placement for theory
    function solveTheory(idx: number): boolean {
      if (idx >= theoryQueue.length) return true;

      const { asgn, subj, staff } = theoryQueue[idx];

      // Try each day and period
      for (let d = 0; d < daysCount; d++) {
        // Enforce max 1 period/day if total weekly hours <= daysCount
        if (asgn.weeklyHours <= daysCount) {
          const alreadyOnDay = grid[d].some(cell => cell && cell.subjectId === asgn.subjectId);
          if (alreadyOnDay) continue;
        }

        for (let p = 0; p < periodsPerDay; p++) {
          if (grid[d][p] !== null) continue;

          // Prevent consecutive duplicate theory period
          if (p > 0 && grid[d][p - 1]?.subjectId === asgn.subjectId) continue;
          if (p < periodsPerDay - 1 && grid[d][p + 1]?.subjectId === asgn.subjectId) continue;

          // Check global staff collision
          const clashKey = `${asgn.memberId}_${d}_${p}`;
          if (globalBusySlots.has(clashKey)) continue;

          // Tentatively place
          grid[d][p] = {
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

          if (solveTheory(idx + 1)) return true;

          // Backtrack
          grid[d][p] = null;
        }
      }

      return false;
    }

    const solved = solveTheory(0);

    // Calculate total allocated
    let totalAllocated = 0;
    for (let d = 0; d < daysCount; d++) {
      for (let p = 0; p < periodsPerDay; p++) {
        if (grid[d][p] !== null) totalAllocated++;
      }
    }

    if (!solved || totalAllocated < totalRequired) {
      return {
        success: false,
        grid,
        totalAllocated,
        totalRequired,
        diagnostics: [
          `Constraint satisfaction failed: Could not allocate all ${totalRequired} hours without faculty collisions. Only ${totalAllocated} hours could be placed collision-free.`
        ]
      };
    }

    return {
      success: true,
      grid,
      totalAllocated,
      totalRequired,
      diagnostics: []
    };
  }
}

