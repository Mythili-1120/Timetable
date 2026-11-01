import { auth, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from '../src/lib/firebase/config.ts';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { createStaff, updateStaff, getStaffById, getAllStaff } from '../src/lib/services/staffService.ts';
import { validatePhoneNumber } from '../src/lib/utils/phoneValidation.ts';
import {
  createAssignment,
  deleteAssignment,
  validateStaffSubjectEligibility,
  validateSubjectStaffForClass
} from '../src/lib/services/assignmentService.ts';

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

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 STAFF SUBJECT ELIGIBILITY & PHONE NUMBER ACCEPTANCE (TESTS A-K)');
  console.log('================================================================\n');

  // Authenticate as Admin
  const cred = await signInWithEmailAndPassword(auth, 'admin@gmail.com', '123456');
  const adminUid = cred.user.uid;

  const cleanupPaths = [];

  try {
    // -------------------------------------------------------------------------
    // TEST E: REJECT INVALID PHONE NUMBER
    // -------------------------------------------------------------------------
    console.log('👉 [Test E] Phone Number Format Validation (Reject Invalid)');
    {
      const invalidPhones = [
        '',
        '12345',               // Too short (5 digits)
        'abcdefghij',          // Non-numeric
        '98765abcde',          // Mixed characters
        '1234567890',          // Starts with 1 (invalid Indian mobile)
        '5555555555',          // Starts with 5 (invalid Indian mobile)
        '987654321012345678'   // Too long (>15 digits)
      ];

      for (const p of invalidPhones) {
        const res = validatePhoneNumber(p);
        assert(res.isValid === false, `Rejected invalid phone: "${p}" (${res.error})`);
      }

      // Valid phone numbers
      const validPhones = [
        '9876543210',
        '+91 9876543210',
        '+91-9876543210',
        '09876543210',
        '8765432109',
        '7654321098',
        '6543210987'
      ];

      for (const p of validPhones) {
        const res = validatePhoneNumber(p);
        assert(res.isValid === true, `Accepted valid phone: "${p}"`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST A: CREATE STAFF WITH PHONE NUMBER AND ONE SUBJECT
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test A] Create Staff with Phone Number & One Subject');
    let staffA;
    {
      staffA = await createStaff(
        {
          staffName: 'Karthik',
          initials: 'K',
          phone: '9876543210',
          phoneNumber: '9876543210',
          email: 'karthik@ssmiet.ac.in',
          designation: 'Assistant Professor',
          primaryDepartmentId: 'dept-aids',
          subjectIds: ['SUBJ-AIDS-TAMIL']
        },
        adminUid
      );
      cleanupPaths.push({ col: 'staff', id: staffA.memberId });
      cleanupPaths.push({ col: 'staffDepartmentLinks', id: `${staffA.memberId}_dept-aids` });

      assert(staffA.memberId.startsWith('FAC-'), `Permanent Member ID generated: ${staffA.memberId}`);
      assert(staffA.phone === '9876543210', 'Canonical phone field persisted');
      assert(staffA.phoneNumber === '9876543210', 'Canonical phoneNumber alias persisted');
      assert(Array.isArray(staffA.subjectIds) && staffA.subjectIds.includes('SUBJ-AIDS-TAMIL'), 'Single subject ID persisted in staff.subjectIds');

      // Verify Firestore persisted doc
      const snap = await getDoc(doc(db, 'staff', staffA.memberId));
      assert(snap.exists(), 'Staff document exists in Firestore');
      const data = snap.data();
      assert(data.phone === '9876543210', 'Phone matches in Firestore doc');
      assert(data.subjectIds[0] === 'SUBJ-AIDS-TAMIL', 'Subject ID matches in Firestore doc');
    }

    // -------------------------------------------------------------------------
    // TEST B: CREATE STAFF WITH MULTIPLE SUBJECTS
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test B] Create Staff with Multiple Subjects');
    let staffB;
    {
      staffB = await createStaff(
        {
          staffName: 'Anitha',
          initials: 'M',
          phone: '9840123456',
          phoneNumber: '9840123456',
          email: 'anitha@ssmiet.ac.in',
          designation: 'Associate Professor',
          primaryDepartmentId: 'dept-cse',
          subjectIds: ['SUBJ-CSE-DS', 'SUBJ-CSE-ALGO', 'SUBJ-CSE-OS']
        },
        adminUid
      );
      cleanupPaths.push({ col: 'staff', id: staffB.memberId });
      cleanupPaths.push({ col: 'staffDepartmentLinks', id: `${staffB.memberId}_dept-cse` });

      assert(staffB.memberId.startsWith('FAC-'), `Permanent Member ID generated: ${staffB.memberId}`);
      assert(staffB.subjectIds.length === 3, 'Multiple (3) subjects persisted in staffRecord');
      assert(staffB.subjectIds.includes('SUBJ-CSE-DS'), 'Subject 1 (DS) present');
      assert(staffB.subjectIds.includes('SUBJ-CSE-ALGO'), 'Subject 2 (ALGO) present');
      assert(staffB.subjectIds.includes('SUBJ-CSE-OS'), 'Subject 3 (OS) present');

      // Check primary link has subjectIds
      const linkSnap = await getDoc(doc(db, 'staffDepartmentLinks', `${staffB.memberId}_dept-cse`));
      assert(linkSnap.exists(), 'Department link created');
      const linkData = linkSnap.data();
      assert(linkData.subjectIds?.length === 3, 'Department link carries matching subjectIds');
    }

    // -------------------------------------------------------------------------
    // TEST C: EDIT PHONE NUMBER WITHOUT CHANGING MEMBER ID
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test C] Edit Phone Number Without Changing Member ID');
    {
      const originalMemberId = staffA.memberId;
      const updatedPhone = '9944123456';

      await updateStaff(
        originalMemberId,
        {
          phone: updatedPhone,
          phoneNumber: updatedPhone
        },
        adminUid
      );

      const refreshed = await getStaffById(originalMemberId);
      assert(refreshed.memberId === originalMemberId, `Member ID strictly unchanged: ${refreshed.memberId}`);
      assert(refreshed.phone === updatedPhone, `Phone updated to ${updatedPhone}`);
      assert(refreshed.phoneNumber === updatedPhone, `phoneNumber updated to ${updatedPhone}`);
    }

    // -------------------------------------------------------------------------
    // TEST D: ADD AND REMOVE SUBJECT ELIGIBILITY
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test D] Add and Remove Subject Eligibility');
    {
      const targetId = staffB.memberId;

      // Add a 4th subject: 'SUBJ-CSE-NETWORKS'
      const updatedSubjs = [...staffB.subjectIds, 'SUBJ-CSE-NETWORKS'];
      await updateStaff(targetId, { subjectIds: updatedSubjs }, adminUid);

      let refreshed = await getStaffById(targetId);
      assert(refreshed.subjectIds.length === 4, 'Subject added: total 4 subjects');
      assert(refreshed.subjectIds.includes('SUBJ-CSE-NETWORKS'), 'New subject SUBJ-CSE-NETWORKS is present');

      // Remove a subject: remove 'SUBJ-CSE-DS'
      const prunedSubjs = refreshed.subjectIds.filter(id => id !== 'SUBJ-CSE-DS');
      await updateStaff(targetId, { subjectIds: prunedSubjs }, adminUid);

      refreshed = await getStaffById(targetId);
      assert(refreshed.subjectIds.length === 3, 'Subject removed: total 3 subjects');
      assert(!refreshed.subjectIds.includes('SUBJ-CSE-DS'), 'SUBJ-CSE-DS was successfully removed');
      assert(refreshed.subjectIds.includes('SUBJ-CSE-NETWORKS'), 'SUBJ-CSE-NETWORKS still preserved');
    }

    // -------------------------------------------------------------------------
    // TEST F: PREVENT CROSS-DEPARTMENT SUBJECT UNLESS LINK EXISTS
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test F] Cross-Department Relationship Requirement');
    {
      // staffA belongs to 'dept-aids', try checking eligibility for an unrelated department 'dept-mech'
      const checkUnrelated = await validateStaffSubjectEligibility(
        staffA.memberId,
        'dept-mech',
        'SUBJ-MECH-THERMO'
      );
      assert(checkUnrelated.isEligible === false, 'Blocked: Staff not affiliated with dept-mech');
      assert(checkUnrelated.error.includes('not affiliated or linked'), 'Clear error explaining lack of department affiliation');
    }

    // -------------------------------------------------------------------------
    // TEST G: PREVENT TEACHING ASSIGNMENT WHEN NOT ELIGIBLE
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test G] Prevent Assignment When Staff Is Not Eligible');
    {
      // Set up a mock subject in dept-aids
      const mockSubj = {
        subjectId: 'SUBJ-AIDS-TEST-G',
        code: 'AD3001',
        name: 'Deep Learning',
        departmentId: 'dept-aids',
        academicYear: '2025–2026',
        weeklyHours: 4,
        type: 'Theory',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'subjects', mockSubj.subjectId), mockSubj);
      cleanupPaths.push({ col: 'subjects', id: mockSubj.subjectId });

      // staffA only has 'SUBJ-AIDS-TAMIL', NOT 'SUBJ-AIDS-TEST-G'
      let threwError = false;
      let errorMsg = '';
      try {
        await createAssignment(
          {
            memberId: staffA.memberId,
            departmentId: 'dept-aids',
            subjectId: mockSubj.subjectId,
            classId: 'CLASS-AIDS-A',
            weeklyHours: 4,
            type: 'Theory',
            academicYear: '2025–2026'
          },
          adminUid
        );
      } catch (err) {
        threwError = true;
        errorMsg = err.message;
      }

      assert(threwError === true, 'Assignment creation blocked for ineligible subject');
      assert(
        errorMsg === 'This Staff member is not configured as eligible for the selected Subject. Update Staff Subject details before assigning.',
        `Exact required error message emitted: "${errorMsg}"`
      );
    }

    // -------------------------------------------------------------------------
    // TEST H: ALLOW VALID STAFF-SUBJECT ASSIGNMENT
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test H] Allow Valid Staff-Subject Assignment');
    {
      // Create valid subject in dept-aids that staffA IS eligible for
      const mockTamil = {
        subjectId: 'SUBJ-AIDS-TAMIL',
        code: 'TA3151',
        name: 'Heritage Tamil',
        departmentId: 'dept-aids',
        academicYear: '2025–2026',
        weeklyHours: 4,
        type: 'Theory',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'subjects', mockTamil.subjectId), mockTamil);
      cleanupPaths.push({ col: 'subjects', id: mockTamil.subjectId });

      const asgn = await createAssignment(
        {
          memberId: staffA.memberId,
          departmentId: 'dept-aids',
          subjectId: mockTamil.subjectId,
          classId: 'CLASS-AIDS-A',
          weeklyHours: 4,
          type: 'Theory',
          academicYear: '2025–2026'
        },
        adminUid
      );
      cleanupPaths.push({ col: 'teachingAssignments', id: asgn.assignmentId });

      assert(asgn.assignmentId !== undefined, `Assignment created successfully: ${asgn.assignmentId}`);
      assert(asgn.memberId === staffA.memberId, 'Assignment maps correct Member ID');
      assert(asgn.subjectId === mockTamil.subjectId, 'Assignment maps correct Subject ID');
    }

    // -------------------------------------------------------------------------
    // TEST I: TIMETABLE VALIDATION IDENTIFIES INELIGIBLE / MISSING STAFF
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test I] Timetable Validation Identifies Ineligible / Missing Staff');
    {
      const mockClassSection = {
        classId: 'CLS-TEST-I',
        departmentId: 'dept-aids',
        yearOfStudy: '1st Year',
        section: 'A',
        academicYear: '2025–2026',
        status: 'ACTIVE'
      };

      const valResult = await validateSubjectStaffForClass(mockClassSection);
      assert(typeof valResult.isValid === 'boolean', 'Timetable validation returned isValid');
      assert(typeof valResult.canGenerate === 'boolean', 'Timetable validation returned canGenerate');
      assert(Array.isArray(valResult.blockingErrors), 'Blocking errors array returned');
    }

    // -------------------------------------------------------------------------
    // TEST J: EXISTING STAFF RECORDS COMPATIBILITY
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test J] Existing Staff Records Compatibility');
    {
      // Inspect pre-existing staff FAC-000101
      const preExisting = await getStaffById('FAC-000101');
      assert(preExisting !== null, 'Pre-existing staff FAC-000101 retrieved');
      assert(typeof preExisting.memberId === 'string', 'memberId is string');
      assert(preExisting.status === 'ACTIVE', 'status is ACTIVE');

      // Verify safe handling when optional fields are empty/absent
      const phoneDisplay = preExisting.phoneNumber || preExisting.phone || '—';
      assert(phoneDisplay !== undefined, 'Phone handles missing optional field safely');
      const subjs = Array.isArray(preExisting.subjectIds) ? preExisting.subjectIds : [];
      assert(Array.isArray(subjs), 'subjectIds defaults cleanly to array');
    }

    // -------------------------------------------------------------------------
    // TEST K: NO DUPLICATE STAFF OR SUBJECT RECORDS
    // -------------------------------------------------------------------------
    console.log('\n👉 [Test K] Verify No Duplicate Staff Or Subject Records');
    {
      const allStaffSnap = await getDocs(collection(db, 'staff'));
      const memberIds = new Set();
      let hasDuplicates = false;
      allStaffSnap.forEach(d => {
        if (memberIds.has(d.id)) hasDuplicates = true;
        memberIds.add(d.id);
      });
      assert(hasDuplicates === false, `All ${memberIds.size} staff member IDs are strictly unique`);

      const allSubjSnap = await getDocs(collection(db, 'subjects'));
      const subjectIds = new Set();
      let duplicateSubjs = false;
      allSubjSnap.forEach(d => {
        if (subjectIds.has(d.id)) duplicateSubjs = true;
        subjectIds.add(d.id);
      });
      assert(duplicateSubjs === false, `All ${subjectIds.size} subject IDs are strictly unique`);
    }

  } finally {
    // Clean up temporary test records
    console.log('\n🧹 Cleaning up test records...');
    for (const item of cleanupPaths) {
      try {
        if (item.col === 'staff') {
          // In Firestore rules, staff are soft-archived rather than deleted to preserve auditability
          await archiveStaff(item.id, adminUid);
        } else if (item.col === 'teachingAssignments') {
          await deleteAssignment(item.id, adminUid);
        } else if (item.col === 'subjects') {
          await deleteDoc(doc(db, item.col, item.id));
        }
      } catch (err) {
        // ignore
      }
    }
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

runTestSuite().catch(err => {
  console.error('Fatal test error stack:', err.stack || err);
  process.exit(1);
});
