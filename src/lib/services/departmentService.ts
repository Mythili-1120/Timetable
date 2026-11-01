import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Department } from '../../types';
import { logAdminAction } from './auditService';

// In-memory cache for fast responsive navigation
let cachedDepartments: Department[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds (revalidated on mutation or expiration)

export function invalidateDepartmentCache() {
  cachedDepartments = null;
  cacheTime = 0;
}

export function getCachedDepartments(): Department[] | null {
  if (cachedDepartments && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedDepartments;
  }
  return null;
}

export function getCachedDepartmentCounts(): { total: number; active: number; archived: number } | null {
  const depts = getCachedDepartments();
  if (!depts) return null;
  let active = 0;
  let archived = 0;
  depts.forEach(d => {
    if (d.status === 'ACTIVE') active++;
    else archived++;
  });
  return { total: depts.length, active, archived };
}

export async function getAllDepartments(forceRefresh = false): Promise<Department[]> {
  if (!forceRefresh && cachedDepartments && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedDepartments;
  }

  try {
    const snap = await getDocs(collection(db, 'departments'));
    // STRICT RULE: No default demo departments are seeded. A department exists only if created by Admin.
    const result = snap.docs.map(d => d.data() as Department);
    cachedDepartments = result;
    cacheTime = Date.now();
    return result;
  } catch (err) {
    console.error('Error fetching departments:', err);
    return cachedDepartments || [];
  }
}

export async function getDepartmentById(departmentId: string): Promise<Department | null> {
  // Check memory cache first
  if (cachedDepartments && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    const found = cachedDepartments.find(d => d.departmentId === departmentId);
    if (found) return found;
  }

  try {
    const snap = await getDoc(doc(db, 'departments', departmentId));
    if (snap.exists()) {
      return snap.data() as Department;
    }
    return null;
  } catch (err) {
    console.error('Error fetching department by ID:', err);
    return null;
  }
}

export async function createDepartment(
  dept: { code: string; name: string; description?: string },
  adminUid: string
): Promise<Department> {
  const codeClean = dept.code.trim().toUpperCase();
  const deptId = `dept-${codeClean.toLowerCase()}`;
  const record: Department = {
    departmentId: deptId,
    code: codeClean,
    name: dept.name.trim(),
    description: (dept.description || '').trim(),
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'departments', deptId), record);
  invalidateDepartmentCache();
  await logAdminAction(adminUid, 'CREATE_DEPARTMENT', 'departments', deptId, record);
  return record;
}

export async function updateDepartment(
  departmentId: string,
  updates: Partial<Department>,
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'departments', departmentId);
  const data = {
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(ref, data);
  invalidateDepartmentCache();
  await logAdminAction(adminUid, 'UPDATE_DEPARTMENT', 'departments', departmentId, updates);
}

export async function archiveDepartment(departmentId: string, adminUid: string): Promise<void> {
  await updateDepartment(departmentId, {
    status: 'ARCHIVED',
    archivedAt: new Date().toISOString()
  }, adminUid);
  invalidateDepartmentCache();
  await logAdminAction(adminUid, 'ARCHIVE_DEPARTMENT', 'departments', departmentId);
}

export interface DepartmentDeletionSafetyCheck {
  canDelete: boolean;
  blockingReasons: string[];
}

/**
 * Validates whether a department can be safely deleted without breaking referential integrity,
 * staff relationships, subjects, classes, teaching assignments, or timetable snapshots.
 */
export async function checkDepartmentDeletionSafety(departmentId: string): Promise<DepartmentDeletionSafetyCheck> {
  const blockingReasons: string[] = [];
  const cleanId = departmentId.trim().toLowerCase();
  const rawCode = cleanId.replace(/^dept-/, '');

  // Helper to match department ID (case-insensitive, handling both "dept-xxx" and "xxx")
  const matchesDept = (id?: string | null) => {
    if (!id) return false;
    const lower = id.trim().toLowerCase();
    return lower === cleanId || lower === rawCode || lower === `dept-${rawCode}`;
  };

  // 1. Check Primary Staff
  try {
    const staffSnap = await getDocs(collection(db, 'staff'));
    const matchingStaff = staffSnap.docs.filter(d => {
      const data = d.data();
      return matchesDept(data.primaryDepartmentId) || matchesDept(data.departmentId);
    });
    if (matchingStaff.length > 0) {
      blockingReasons.push(
        `${matchingStaff.length} faculty member(s) have this department configured as their primary department. Reassign or delete these staff members first.`
      );
    }
  } catch (err) {
    console.error('Error checking staff during department delete check:', err);
  }

  // 2. Check Secondary Staff Department Links
  try {
    const linksSnap = await getDocs(collection(db, 'staffDepartmentLinks'));
    const matchingLinks = linksSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingLinks.length > 0) {
      blockingReasons.push(
        `${matchingLinks.length} faculty secondary department link(s) point to this department. Remove these links first.`
      );
    }
  } catch (err) {
    console.error('Error checking staff links during department delete check:', err);
  }

  // 3. Check Subjects
  try {
    const subjectsSnap = await getDocs(collection(db, 'subjects'));
    const matchingSubjects = subjectsSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingSubjects.length > 0) {
      blockingReasons.push(
        `${matchingSubjects.length} subject(s) in Subject Master belong to this department. Delete or reassign these subjects first.`
      );
    }
  } catch (err) {
    console.error('Error checking subjects during department delete check:', err);
  }

  // 4. Check Classes & Sections
  try {
    const classesSnap = await getDocs(collection(db, 'classes'));
    const matchingClasses = classesSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingClasses.length > 0) {
      blockingReasons.push(
        `${matchingClasses.length} class section(s) belong to this department. Delete or reassign these classes first.`
      );
    }
  } catch (err) {
    console.error('Error checking classes during department delete check:', err);
  }

  // 5. Check Teaching Assignments
  try {
    const asgnSnap = await getDocs(collection(db, 'teachingAssignments'));
    const matchingAsgns = asgnSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingAsgns.length > 0) {
      blockingReasons.push(
        `${matchingAsgns.length} teaching assignment(s) exist under this department. Delete or reassign these assignments first.`
      );
    }
  } catch (err) {
    console.error('Error checking teaching assignments during department delete check:', err);
  }

  // 6. Check Draft Timetables
  try {
    const ttSnap = await getDocs(collection(db, 'timetables'));
    const matchingTimetables = ttSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingTimetables.length > 0) {
      blockingReasons.push(
        `${matchingTimetables.length} draft timetable(s) belong to this department. Delete them first.`
      );
    }
  } catch (err) {
    console.error('Error checking timetables during department delete check:', err);
  }

  // 7. Check Published Timetables
  try {
    const pubSnap = await getDocs(collection(db, 'publishedTimetables'));
    const matchingPub = pubSnap.docs.filter(d => matchesDept(d.data().departmentId));
    if (matchingPub.length > 0) {
      blockingReasons.push(
        `${matchingPub.length} published historical timetable snapshot(s) belong to this department. Historical snapshots cannot be deleted. Use 'Archive Department' instead of permanent deletion.`
      );
    }
  } catch (err) {
    console.error('Error checking published timetables during department delete check:', err);
  }

  return {
    canDelete: blockingReasons.length === 0,
    blockingReasons
  };
}

/**
 * Permanently deletes a department from Firestore after verifying all referential integrity checks.
 */
export async function deleteDepartment(departmentId: string, adminUid: string): Promise<void> {
  const safety = await checkDepartmentDeletionSafety(departmentId);
  if (!safety.canDelete) {
    const reasonText = safety.blockingReasons.join('\n• ');
    throw new Error(
      `Cannot delete department (${departmentId}):\n• ${reasonText}`
    );
  }

  try {
    await deleteDoc(doc(db, 'departments', departmentId));
    invalidateDepartmentCache();
    await logAdminAction(adminUid, 'DELETE_DEPARTMENT', 'departments', departmentId);
  } catch (err: any) {
    console.error('Error during department deletion:', err);
    if (err?.code === 'permission-denied' || err?.message?.toLowerCase().includes('permissions')) {
      throw new Error(
        `Cloud Firestore permission-denied: The live security rules on project 'timetable-76d9f' disallow deletion of /departments documents.\n\n` +
        `ROOT CAUSE:\n` +
        `The live Cloud Firestore database requires an authenticated administrator session to delete departments.\n\n` +
        `FIX:\n` +
        `1. Ensure you are signed in as an administrator (admin@ssmiet.ac.in or admin@gmail.com).\n` +
        `2. Ensure the latest firestore.rules is published in Firebase Console: https://console.firebase.google.com/project/timetable-76d9f/firestore/rules`
      );
    }
    throw err;
  }
}

// ============================================================================
// CANONICAL DEPARTMENT METRICS & AGGREGATIONS
// ============================================================================

/**
 * Canonical calculation: Total, active, and archived departments.
 */
export async function getDepartmentCounts(forceRefresh = false): Promise<{
  total: number;
  active: number;
  archived: number;
}> {
  const allDepts = await getAllDepartments(forceRefresh);
  let active = 0;
  let archived = 0;

  allDepts.forEach(d => {
    if (d.status === 'ACTIVE') active++;
    else archived++;
  });

  return {
    total: allDepts.length,
    active,
    archived
  };
}
