import { collection, doc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Subject } from '../../types';
import { logAdminAction } from './auditService';

let cachedSubjects: Subject[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 15000;

export function invalidateSubjectCache() {
  cachedSubjects = null;
  cacheTime = 0;
}

export async function getAllSubjects(departmentId?: string, forceRefresh = false): Promise<Subject[]> {
  if (!forceRefresh && !departmentId && cachedSubjects && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedSubjects;
  }

  try {
    let q = query(collection(db, 'subjects'));
    if (departmentId) {
      q = query(collection(db, 'subjects'), where('departmentId', '==', departmentId));
    }
    const snap = await getDocs(q);
    const result = snap.docs.map(d => d.data() as Subject);
    if (!departmentId) {
      cachedSubjects = result;
      cacheTime = Date.now();
    }
    return result;
  } catch (err) {
    console.error('Error fetching subjects:', err);
    return [];
  }
}

export async function createSubject(
  data: {
    code: string;
    name: string;
    type: 'Theory' | 'Lab';
    weeklyHours: number;
    labBlockHours?: number;
    departmentId: string;
    academicYear: string;
    yearOfStudy?: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
  },
  adminUid: string
): Promise<Subject> {
  const codeClean = data.code.trim().toUpperCase();
  const subjectId = `SUBJ-${data.departmentId.replace('dept-', '').toUpperCase()}-${codeClean}`;

  const record: Subject = {
    subjectId,
    code: codeClean,
    name: data.name.trim(),
    type: data.type,
    weeklyHours: Number(data.weeklyHours) || (data.type === 'Lab' ? 4 : 3),
    labBlockHours: data.type === 'Lab' ? (Number(data.labBlockHours) || 4) : undefined,
    departmentId: data.departmentId,
    academicYear: data.academicYear || '2025–2026',
    yearOfStudy: data.yearOfStudy,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'subjects', subjectId), record);
  invalidateSubjectCache();
  await logAdminAction(adminUid, 'CREATE_SUBJECT', 'subjects', subjectId, record);
  return record;
}

export async function updateSubject(
  subjectId: string,
  updates: Partial<Subject>,
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'subjects', subjectId);
  const clean = {
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(ref, clean);
  invalidateSubjectCache();
  await logAdminAction(adminUid, 'UPDATE_SUBJECT', 'subjects', subjectId, clean);
}

export async function archiveSubject(subjectId: string, adminUid: string): Promise<void> {
  await updateSubject(subjectId, { status: 'INACTIVE' }, adminUid);
  await logAdminAction(adminUid, 'ARCHIVE_SUBJECT', 'subjects', subjectId);
}

// ============================================================================
// CANONICAL SUBJECT METRICS & AGGREGATIONS
// ============================================================================

/**
 * Resolves all subjects belonging to a department.
 */
export async function getDepartmentSubjects(
  departmentId: string,
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<Subject[]> {
  const allSubjs = await getAllSubjects(undefined, options.forceRefresh);
  const activeOnly = options.activeOnly !== false;
  return allSubjs.filter(s => s.departmentId === departmentId && (!activeOnly || s.status === 'ACTIVE'));
}

/**
 * Canonical calculation: Count of subjects for a specific department.
 */
export async function getDepartmentSubjectCount(
  departmentId: string,
  options: { activeOnly?: boolean } = { activeOnly: true }
): Promise<number> {
  const list = await getDepartmentSubjects(departmentId, options);
  return list.length;
}

/**
 * High-performance batch calculation:
 * Resolves the subject count for ALL departments in a single pass.
 * Returns Map<departmentId, count>.
 */
export async function getAllDepartmentSubjectCounts(
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<Map<string, number>> {
  const allSubjs = await getAllSubjects(undefined, options.forceRefresh);
  const activeOnly = options.activeOnly !== false;

  const map = new Map<string, number>();
  allSubjs.forEach(s => {
    if (activeOnly && s.status !== 'ACTIVE') return;
    map.set(s.departmentId, (map.get(s.departmentId) || 0) + 1);
  });

  return map;
}

/**
 * Canonical global subject counts.
 */
export async function getGlobalSubjectCounts(forceRefresh = false): Promise<{
  total: number;
  active: number;
  theory: number;
  lab: number;
}> {
  const allSubjs = await getAllSubjects(undefined, forceRefresh);
  let active = 0;
  let theory = 0;
  let lab = 0;

  allSubjs.forEach(s => {
    if (s.status === 'ACTIVE') {
      active++;
      if (s.type === 'Lab') lab++;
      else theory++;
    }
  });

  return {
    total: allSubjs.length,
    active,
    theory,
    lab
  };
}
