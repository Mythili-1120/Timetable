import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Department } from '../../types';
import { logAdminAction } from './auditService';

// In-memory cache for fast responsive navigation
let cachedDepartments: Department[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 15000; // 15 seconds

export function invalidateDepartmentCache() {
  cachedDepartments = null;
  cacheTime = 0;
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
    return [];
  }
}

export async function getDepartmentById(departmentId: string): Promise<Department | null> {
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
