import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ClassSection } from '../../types';
import { logAdminAction } from './auditService';

export function generateClassId(
  departmentId: string,
  academicYear: string,
  yearOfStudy: string,
  section: string
): string {
  const cleanYear = academicYear.replace(/[^a-zA-Z0-9]/g, '-');
  const cleanStudy = yearOfStudy.replace(/\s+/g, '-');
  const cleanSec = section.trim().toUpperCase();
  return `${departmentId}_${cleanYear}_${cleanStudy}_${cleanSec}`;
}

let cachedClasses: ClassSection[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds (revalidated on mutation or expiration)

export function invalidateClassCache() {
  cachedClasses = null;
  cacheTime = 0;
}

export function getCachedClasses(departmentId?: string, academicYear?: string): ClassSection[] | null {
  if (cachedClasses && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    let result = cachedClasses;
    if (departmentId) {
      result = result.filter(c => c.departmentId === departmentId);
    }
    if (academicYear) {
      result = result.filter(c => c.academicYear === academicYear);
    }
    return result;
  }
  return null;
}

export function getCachedGlobalClassCounts(): { total: number; active: number } | null {
  const classes = getCachedClasses();
  if (!classes) return null;
  let active = 0;
  classes.forEach(c => {
    if (c.status === 'ACTIVE') active++;
  });
  return { total: classes.length, active };
}

export async function getAllClasses(departmentId?: string, academicYear?: string, forceRefresh = false): Promise<ClassSection[]> {
  if (!forceRefresh && cachedClasses && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    let result = cachedClasses;
    if (departmentId) {
      result = result.filter(c => c.departmentId === departmentId);
    }
    if (academicYear) {
      result = result.filter(c => c.academicYear === academicYear);
    }
    return result;
  }

  try {
    let q = query(collection(db, 'classes'));
    if (departmentId && academicYear && (!cachedClasses || forceRefresh)) {
      q = query(collection(db, 'classes'), where('departmentId', '==', departmentId), where('academicYear', '==', academicYear));
    } else if (departmentId && (!cachedClasses || forceRefresh)) {
      q = query(collection(db, 'classes'), where('departmentId', '==', departmentId));
    }
    const snap = await getDocs(q);
    const result = snap.docs.map(d => d.data() as ClassSection);
    if (!departmentId && !academicYear) {
      cachedClasses = result;
      cacheTime = Date.now();
    }
    return result;
  } catch (err) {
    console.error('Error fetching classes:', err);
    return cachedClasses ? getCachedClasses(departmentId, academicYear) || [] : [];
  }
}

export async function createClass(
  data: {
    departmentId: string;
    academicYear: string;
    yearOfStudy: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
    section: string;
  },
  adminUid: string
): Promise<ClassSection> {
  const classId = generateClassId(data.departmentId, data.academicYear, data.yearOfStudy, data.section);

  const record: ClassSection = {
    classId,
    departmentId: data.departmentId,
    academicYear: data.academicYear,
    yearOfStudy: data.yearOfStudy,
    section: data.section.trim().toUpperCase(),
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'classes', classId), record);
  invalidateClassCache();
  await logAdminAction(adminUid, 'CREATE_CLASS', 'classes', classId, record);
  return record;
}

export async function updateClass(
  classId: string,
  updates: Partial<ClassSection>,
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'classes', classId);
  const clean = {
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(ref, clean);
  invalidateClassCache();
  await logAdminAction(adminUid, 'UPDATE_CLASS', 'classes', classId, clean);
}

export async function archiveClass(classId: string, adminUid: string): Promise<void> {
  await updateClass(classId, { status: 'INACTIVE' }, adminUid);
  await logAdminAction(adminUid, 'ARCHIVE_CLASS', 'classes', classId);
}

// ============================================================================
// CANONICAL CLASS / SECTION METRICS & AGGREGATIONS
// ============================================================================

/**
 * Resolves all class sections belonging to a department.
 */
export async function getDepartmentClasses(
  departmentId: string,
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<ClassSection[]> {
  const allClasses = await getAllClasses(undefined, undefined, options.forceRefresh);
  const activeOnly = options.activeOnly !== false;
  return allClasses.filter(c => c.departmentId === departmentId && (!activeOnly || c.status === 'ACTIVE'));
}

/**
 * Canonical calculation: Count of classes in a department.
 */
export async function getDepartmentClassCount(
  departmentId: string,
  options: { activeOnly?: boolean } = { activeOnly: true }
): Promise<number> {
  const list = await getDepartmentClasses(departmentId, options);
  return list.length;
}

/**
 * High-performance batch calculation:
 * Resolves the class section count for ALL departments in a single pass.
 * Returns Map<departmentId, count>.
 */
export async function getAllDepartmentClassCounts(
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<Map<string, number>> {
  const allClasses = await getAllClasses(undefined, undefined, options.forceRefresh);
  const activeOnly = options.activeOnly !== false;

  const map = new Map<string, number>();
  allClasses.forEach(c => {
    if (activeOnly && c.status !== 'ACTIVE') return;
    map.set(c.departmentId, (map.get(c.departmentId) || 0) + 1);
  });

  return map;
}

/**
 * Canonical global class counts.
 */
export async function getGlobalClassCounts(forceRefresh = false): Promise<{
  total: number;
  active: number;
}> {
  const allClasses = await getAllClasses(undefined, undefined, forceRefresh);
  let active = 0;

  allClasses.forEach(c => {
    if (c.status === 'ACTIVE') active++;
  });

  return {
    total: allClasses.length,
    active
  };
}
