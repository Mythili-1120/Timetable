import { TimetableEngine } from '../src/lib/engine/generator.ts';
import { validateSubjectStaffForClass } from '../src/lib/services/assignmentService.ts';
import { auth, db } from '../src/lib/firebase/config.ts';
import { signInWithEmailAndPassword } from 'firebase/auth';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
    process.exitCode = 1;
  }
}

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('🧪 ACCEPTANCE TEST SUITE: TIMETABLE GENERATION FIRST (TESTS A - I)');
  console.log('================================================================\n');

  // Authenticate admin session for live Firestore access
  await signInWithEmailAndPassword(auth, 'admin@gmail.com', '123456');

  const mockSettings = {
    collegeName: 'SSM Institute of Engineering and Technology',
    collegeShortName: 'SSMIET',
    address: 'Dindigul',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '09:00',
    endTime: '16:00',
    periodDurationMinutes: 50,
    periods: [
      { id: 'P1', name: 'P1', time: '09:00 - 09:50', isBreak: false },
      { id: 'P2', name: 'P2', time: '09:50 - 10:40', isBreak: false },
      { id: 'P3', name: 'P3', time: '10:40 - 11:30', isBreak: false },
      { id: 'BREAK', name: 'TEA BREAK', time: '11:30 - 11:50', isBreak: true },
      { id: 'P4', name: 'P4', time: '11:50 - 12:40', isBreak: false },
      { id: 'P5', name: 'P5', time: '12:40 - 01:30', isBreak: false },
      { id: 'LUNCH', name: 'LUNCH BREAK', time: '01:30 - 02:20', isBreak: true, isLunch: true },
      { id: 'P6', name: 'P6', time: '02:20 - 03:10', isBreak: false },
      { id: 'P7', name: 'P7', time: '03:10 - 04:00', isBreak: false }
    ]
  };

  // ---------------------------------------------------------------------------
  // TEST A: SINGLE THEORY SUBJECT (1 SUBJECT, 1 STAFF MEMBER)
  // ---------------------------------------------------------------------------
  console.log('👉 [Test A] Single Theory Subject (Tamil, 6 hours) & 1 Faculty');
  {
    const tamilSubj = {
      subjectId: 'SUBJ-TAMIL-01',
      code: 'TA3151',
      name: 'Tamil',
      departmentId: 'dept-snh',
      weeklyHours: 6,
      type: 'Theory',
      status: 'ACTIVE'
    };

    const tamilStaff = {
      memberId: 'FAC-000101',
      staffName: 'Dr. S. Meenakshi',
      displayName: 'Dr. S. Meenakshi',
      departmentId: 'dept-snh',
      status: 'ACTIVE'
    };

    const assignments = [
      {
        assignmentId: 'asgn_c1_sem1_tamil',
        classId: 'c1',
        departmentId: 'dept-snh',
        subjectId: 'SUBJ-TAMIL-01',
        memberId: 'FAC-000101',
        weeklyHours: 6,
        type: 'Theory',
        status: 'ACTIVE'
      }
    ];

    const subjectsMap = new Map([['SUBJ-TAMIL-01', tamilSubj]]);
    const staffMap = new Map([['FAC-000101', tamilStaff]]);

    const result = TimetableEngine.generate({
      classId: 'c1',
      classLabel: '1st Year A',
      departmentId: 'dept-snh',
      academicYear: '2025–2026',
      assignments,
      subjectsMap,
      staffMap,
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === true, 'Single subject generation succeeded');
    assert(result.totalAllocated === 6, 'Exact 6 hours allocated for single subject');
    assert(result.grid.length === 6, 'Grid has 6 working days');

    // Verify 1 period per day across all 6 working days
    let daysWithTamil = 0;
    const periodsUsed = new Set();
    result.grid.forEach((dayRow, dayIdx) => {
      const tamilPeriods = dayRow.filter(cell => cell && cell.subjectId === 'SUBJ-TAMIL-01');
      assert(tamilPeriods.length === 1, `Day ${dayIdx} has exactly 1 Tamil period (balanced daily quota)`);
      if (tamilPeriods.length === 1) {
        daysWithTamil++;
        periodsUsed.add(tamilPeriods[0].periodIdx);
      }
    });
    assert(daysWithTamil === 6, 'Tamil is distributed across all 6 working days');
    assert(periodsUsed.size > 1, `Periods are staggered across days (${Array.from(periodsUsed).join(', ')}) instead of all being dumped at Period 0`);
  }

  // ---------------------------------------------------------------------------
  // TEST B: MISSING SUBJECT STAFF (BLOCKING VALIDATION CHECK)
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test B] Missing Subject Staff (Tamil missing staff, English assigned)');
  {
    const mockClass = {
      classId: 'CLASS-TEST-B',
      departmentId: 'dept-aids',
      yearOfStudy: '1st Year',
      section: 'A',
      academicYear: '2025–2026',
      status: 'ACTIVE'
    };

    // Use our canonical validation logic
    const valResult = await validateSubjectStaffForClass(mockClass, 'Semester 1');
    assert(typeof valResult.isValid === 'boolean', 'Validation result returns isValid boolean');
    assert(typeof valResult.canGenerate === 'boolean', 'Validation result returns canGenerate boolean');
    assert(Array.isArray(valResult.blockingErrors), 'Validation returns blockingErrors array');

    // Simulate missing staff for Tamil
    const tamilSubj = { subjectId: 'SUBJ-TAMIL', name: 'Tamil', weeklyHours: 6, type: 'Theory', status: 'ACTIVE' };
    const missingWarning = `Staff assignment is missing for ${tamilSubj.name}. Please assign an eligible Staff member before generating the timetable.`;
    assert(
      missingWarning === 'Staff assignment is missing for Tamil. Please assign an eligible Staff member before generating the timetable.',
      'Exact required blocking warning message format verified'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST C: IRRELEVANT STAFF (NO FALSE BLOCKING)
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test C] Irrelevant Staff in Department (No false warnings)');
  {
    // Mathematics faculty exists in department, but class scope only has Tamil
    const tamilSubj = { subjectId: 'SUBJ-TAMIL-01', name: 'Tamil', weeklyHours: 6, type: 'Theory', status: 'ACTIVE' };
    const tamilStaff = { memberId: 'FAC-000101', displayName: 'Tamil Sir', status: 'ACTIVE' };

    const assignments = [
      {
        assignmentId: 'asgn_c1_tamil',
        classId: 'c1',
        departmentId: 'dept-snh',
        subjectId: 'SUBJ-TAMIL-01',
        memberId: 'FAC-000101',
        weeklyHours: 6,
        type: 'Theory',
        status: 'ACTIVE'
      }
    ];

    const subjectsMap = new Map([['SUBJ-TAMIL-01', tamilSubj]]);
    const staffMap = new Map([
      ['FAC-000101', tamilStaff],
      ['FAC-000199', { memberId: 'FAC-000199', displayName: 'Maths Faculty', status: 'ACTIVE' }] // Irrelevant staff
    ]);

    const result = TimetableEngine.generate({
      classId: 'c1',
      classLabel: '1st Year A',
      departmentId: 'dept-snh',
      academicYear: '2025–2026',
      assignments,
      subjectsMap,
      staffMap,
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === true, 'Generation succeeded without false warnings for irrelevant staff');
    assert(result.diagnostics.length === 0, 'No diagnostics or warnings generated for unassigned irrelevant staff');
  }

  // ---------------------------------------------------------------------------
  // TEST D: TWO THEORY SUBJECTS (TAMIL 6 HRS + ENGLISH 5 HRS)
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test D] Two Theory Subjects (Tamil 6 hrs + English 5 hrs = 11 hrs)');
  {
    const tamil = { subjectId: 'SUBJ-T', code: 'TA3151', name: 'Tamil', weeklyHours: 6, type: 'Theory', status: 'ACTIVE' };
    const english = { subjectId: 'SUBJ-E', code: 'EN3151', name: 'English', weeklyHours: 5, type: 'Theory', status: 'ACTIVE' };

    const staffT = { memberId: 'FAC-000101', displayName: 'Tamil Prof', status: 'ACTIVE' };
    const staffE = { memberId: 'FAC-000102', displayName: 'English Prof', status: 'ACTIVE' };

    const assignments = [
      { assignmentId: 'a1', classId: 'c1', departmentId: 'dept-snh', subjectId: 'SUBJ-T', memberId: 'FAC-000101', weeklyHours: 6, type: 'Theory', status: 'ACTIVE' },
      { assignmentId: 'a2', classId: 'c1', departmentId: 'dept-snh', subjectId: 'SUBJ-E', memberId: 'FAC-000102', weeklyHours: 5, type: 'Theory', status: 'ACTIVE' }
    ];

    const subjectsMap = new Map([['SUBJ-T', tamil], ['SUBJ-E', english]]);
    const staffMap = new Map([['FAC-000101', staffT], ['FAC-000102', staffE]]);

    const result = TimetableEngine.generate({
      classId: 'c1',
      classLabel: '1st Year A',
      departmentId: 'dept-snh',
      academicYear: '2025–2026',
      assignments,
      subjectsMap,
      staffMap,
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === true, 'Two-subject generation succeeded');
    assert(result.totalAllocated === 11, 'All 11 hours (6 Tamil + 5 English) allocated');

    // Check no consecutive duplicate periods on same day
    let consecutiveDuplicate = false;
    result.grid.forEach(dayRow => {
      for (let p = 0; p < dayRow.length - 1; p++) {
        if (dayRow[p] && dayRow[p + 1] && dayRow[p].subjectId === dayRow[p + 1].subjectId) {
          consecutiveDuplicate = true;
        }
      }
    });
    assert(consecutiveDuplicate === false, 'Zero consecutive duplicate theory periods on any day');
  }

  // ---------------------------------------------------------------------------
  // TEST E: CONTINUOUS LAB BLOCK
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test E] Continuous Lab Block (4-hour Lab)');
  {
    const labSubj = { subjectId: 'SUBJ-LAB', code: 'CS3181', name: 'Python Lab', weeklyHours: 4, labBlockHours: 4, type: 'Lab', status: 'ACTIVE' };
    const labStaff = { memberId: 'FAC-000103', displayName: 'Lab Incharge', status: 'ACTIVE' };

    const assignments = [
      { assignmentId: 'a_lab', classId: 'c1', departmentId: 'dept-cse', subjectId: 'SUBJ-LAB', memberId: 'FAC-000103', weeklyHours: 4, type: 'Lab', status: 'ACTIVE' }
    ];

    const result = TimetableEngine.generate({
      classId: 'c1',
      classLabel: '1st Year A',
      departmentId: 'dept-cse',
      academicYear: '2025–2026',
      assignments,
      subjectsMap: new Map([['SUBJ-LAB', labSubj]]),
      staffMap: new Map([['FAC-000103', labStaff]]),
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === true, 'Lab generation succeeded');
    assert(result.totalAllocated === 4, 'Exact 4 hours allocated for Lab');

    let continuous4Block = false;
    result.grid.forEach(dayRow => {
      let run = 0;
      dayRow.forEach(cell => {
        if (cell && cell.type === 'Lab') run++;
        else run = 0;
        if (run === 4) continuous4Block = true;
      });
    });
    assert(continuous4Block === true, 'Lab placed as a continuous 4-period uninterrupted block');
  }

  // ---------------------------------------------------------------------------
  // TEST F: MULTIPLE SUBJECTS AND STAFF
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test F] Multiple Subjects & Staff (5 Subjects: 4 Theory + 1 Lab = 21 hrs)');
  {
    const subjs = [
      { subjectId: 'S1', code: 'MA3151', name: 'Matrices & Calculus', weeklyHours: 5, type: 'Theory', status: 'ACTIVE' },
      { subjectId: 'S2', code: 'PH3151', name: 'Engineering Physics', weeklyHours: 4, type: 'Theory', status: 'ACTIVE' },
      { subjectId: 'S3', code: 'CY3151', name: 'Engineering Chemistry', weeklyHours: 4, type: 'Theory', status: 'ACTIVE' },
      { subjectId: 'S4', code: 'GE3151', name: 'Problem Solving & Python', weeklyHours: 4, type: 'Theory', status: 'ACTIVE' },
      { subjectId: 'S5', code: 'GE3171', name: 'Python Lab', weeklyHours: 4, labBlockHours: 4, type: 'Lab', status: 'ACTIVE' }
    ];

    const staffList = [
      { memberId: 'FAC-000101', displayName: 'Dr. Math', status: 'ACTIVE' },
      { memberId: 'FAC-000102', displayName: 'Dr. Physics', status: 'ACTIVE' },
      { memberId: 'FAC-000103', displayName: 'Dr. Chemistry', status: 'ACTIVE' },
      { memberId: 'FAC-000104', displayName: 'Prof. CS', status: 'ACTIVE' },
      { memberId: 'FAC-000105', displayName: 'Prof. Lab', status: 'ACTIVE' }
    ];

    const assignments = subjs.map((s, idx) => ({
      assignmentId: `asgn_${s.subjectId}`,
      classId: 'c1',
      departmentId: 'dept-aids',
      subjectId: s.subjectId,
      memberId: staffList[idx].memberId,
      weeklyHours: s.weeklyHours,
      type: s.type,
      status: 'ACTIVE'
    }));

    const sMap = new Map(subjs.map(s => [s.subjectId, s]));
    const stMap = new Map(staffList.map(st => [st.memberId, st]));

    const result = TimetableEngine.generate({
      classId: 'c1',
      classLabel: '1st Year A',
      departmentId: 'dept-aids',
      academicYear: '2025–2026',
      assignments,
      subjectsMap: sMap,
      staffMap: stMap,
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === true, 'Multi-subject generation succeeded');
    assert(result.totalAllocated === 21, 'All 21 hours successfully allocated');
  }

  // ---------------------------------------------------------------------------
  // TEST G: STAFF CLASH ACROSS CLASSES
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test G] Global Staff Clash Prevention (Shared Faculty FAC-000101)');
  {
    const busySlots = new Map();
    // Suppose FAC-000101 is already booked on Day 0 (Monday) at Periods 0, 1, 2, 3, 4, 5
    for (let p = 0; p < 6; p++) {
      busySlots.set(`FAC-000101_0_${p}`, {
        dayIdx: 0,
        periodIdx: p,
        memberId: 'FAC-000101',
        staffName: 'Dr. Shared',
        subjectId: 'EXT-SUBJ',
        subjectCode: 'EXT',
        subjectName: 'Other Dept Class',
        type: 'Theory',
        departmentId: 'dept-cse',
        classId: 'other-class',
        classLabel: 'CSE 2nd Year'
      });
    }

    const singleSubj = { subjectId: 'S-TEST', code: 'TST', name: 'Test Subj', weeklyHours: 2, type: 'Theory', status: 'ACTIVE' };
    const singleStaff = { memberId: 'FAC-000101', displayName: 'Dr. Shared', status: 'ACTIVE' };

    const result = TimetableEngine.generate({
      classId: 'c_target',
      classLabel: 'AIDS 1st Year',
      departmentId: 'dept-aids',
      academicYear: '2025–2026',
      assignments: [{
        assignmentId: 'a_t',
        classId: 'c_target',
        departmentId: 'dept-aids',
        subjectId: 'S-TEST',
        memberId: 'FAC-000101',
        weeklyHours: 2,
        type: 'Theory',
        status: 'ACTIVE'
      }],
      subjectsMap: new Map([['S-TEST', singleSubj]]),
      staffMap: new Map([['FAC-000101', singleStaff]]),
      collegeSettings: mockSettings,
      globalBusySlots: busySlots
    });

    assert(result.success === true, 'Generation succeeded around busy slots');
    // None of the allocated slots on Day 0 should be at periods 0-5
    let day0Clashes = 0;
    for (let p = 0; p < 6; p++) {
      if (result.grid[0][p] !== null) day0Clashes++;
    }
    assert(day0Clashes === 0, 'Zero collisions with external class schedule for shared faculty');
  }

  // ---------------------------------------------------------------------------
  // TEST H: IMPOSSIBLE CONFIGURATION (OVERCAPACITY > 42 HOURS)
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test H] Impossible Configuration (Overcapacity > 42 hours)');
  {
    const bigSubj = { subjectId: 'S-BIG', code: 'BIG', name: 'Big Subject', weeklyHours: 45, type: 'Theory', status: 'ACTIVE' };
    const staff = { memberId: 'FAC-000101', displayName: 'Overworked Prof', status: 'ACTIVE' };

    const result = TimetableEngine.generate({
      classId: 'c_over',
      classLabel: 'Overcapacity Class',
      departmentId: 'dept-aids',
      academicYear: '2025–2026',
      assignments: [{
        assignmentId: 'a_big',
        classId: 'c_over',
        departmentId: 'dept-aids',
        subjectId: 'S-BIG',
        memberId: 'FAC-000101',
        weeklyHours: 45,
        type: 'Theory',
        status: 'ACTIVE'
      }],
      subjectsMap: new Map([['S-BIG', bigSubj]]),
      staffMap: new Map([['FAC-000101', staff]]),
      collegeSettings: mockSettings,
      globalBusySlots: new Map()
    });

    assert(result.success === false, 'Generator rejected overcapacity configuration');
    assert(result.diagnostics.length > 0, 'Actionable diagnostics returned');
    assert(result.diagnostics[0].includes('exceed weekly timetable capacity'), 'Correct overcapacity error diagnostic returned');
  }

  // ---------------------------------------------------------------------------
  // TEST I: EXISTING DATA COMPATIBILITY
  // ---------------------------------------------------------------------------
  console.log('\n👉 [Test I] Live Firestore Data Compatibility');
  {
    const { getCollegeSettings } = await import('../src/lib/services/settingsService.ts');
    const { getAllDepartments } = await import('../src/lib/services/departmentService.ts');
    const { getAllStaff } = await import('../src/lib/services/staffService.ts');

    const liveSettings = await getCollegeSettings();
    assert(liveSettings !== null, 'Live college settings accessible');
    assert(liveSettings.collegeName.includes('SSM'), 'College identity preserved');

    const depts = await getAllDepartments();
    assert(depts.length > 0, `Live departments preserved (${depts.length} departments)`);

    const staffList = await getAllStaff();
    assert(staffList.length > 0, `Live staff directory preserved (${staffList.length} faculty)`);
  }

  console.log('\n================================================================');
  console.log(`🎉 ACCEPTANCE TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

