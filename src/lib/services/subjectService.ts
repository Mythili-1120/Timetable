import { collection, doc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Subject,
  UndergraduateYear,
  SemesterDefinition,
  YEAR_SEMESTERS
} from '../../types';
import { logAdminAction } from './auditService';

// Canonical Semester Helper Functions
export { YEAR_SEMESTERS };
export type { UndergraduateYear, SemesterDefinition };

export function getSemestersForYear(year?: string | null): SemesterDefinition[] {
  if (!year) {
    return YEAR_SEMESTERS['1st Year'];
  }
  const clean = year.trim();
  if (clean === '1st Year' || clean.toLowerCase().includes('first') || clean === '1') {
    return YEAR_SEMESTERS['1st Year'];
  }
  if (clean === '2nd Year' || clean.toLowerCase().includes('second') || clean === '2') {
    return YEAR_SEMESTERS['2nd Year'];
  }
  if (clean === '3rd Year' || clean.toLowerCase().includes('third') || clean === '3') {
    return YEAR_SEMESTERS['3rd Year'];
  }
  if (clean === '4th Year' || clean.toLowerCase().includes('fourth') || clean === '4') {
    return YEAR_SEMESTERS['4th Year'];
  }
  return YEAR_SEMESTERS['1st Year'];
}

export function getSemesterNumber(semester?: string | number | null): number | undefined {
  if (semester === undefined || semester === null) return undefined;
  if (typeof semester === 'number') return semester;
  const match = semester.match(/\d+/);
  return match ? parseInt(match[0], 10) : undefined;
}

export function formatSemesterName(semester?: string | number | null): string {
  if (!semester) return '';
  if (typeof semester === 'string' && semester.startsWith('Semester ')) return semester;
  const num = getSemesterNumber(semester);
  return num ? `Semester ${num}` : String(semester);
}

export function getYearForSemester(semester?: string | number | null): UndergraduateYear {
  const num = getSemesterNumber(semester);
  if (!num) return '1st Year';
  if (num <= 2) return '1st Year';
  if (num <= 4) return '2nd Year';
  if (num <= 6) return '3rd Year';
  return '4th Year';
}

/**
 * Reconciles subject semester representation in memory without altering existing fields.
 * If semester string exists but semesterNumber is absent, derives semesterNumber.
 * If semesterNumber exists but semester string is absent, derives semester string.
 * If neither exists, flags requiresSemesterReview: true so Admin can review and assign.
 */
export function reconcileSubjectSemester(s: Subject): Subject {
  let semName = s.semester?.trim();
  let semNum = s.semesterNumber;

  if (semNum !== undefined && !semName) {
    semName = formatSemesterName(semNum);
  } else if (semName && semNum === undefined) {
    semNum = getSemesterNumber(semName);
  }

  const requiresReview = !semName && semNum === undefined;

  return {
    ...s,
    ...(semName ? { semester: semName } : {}),
    ...(semNum !== undefined ? { semesterNumber: semNum } : {}),
    requiresSemesterReview: requiresReview
  };
}

/**
 * Checks for duplicate subject code within the applicable Department + Year + Semester scope.
 * Preserves canonical Subject IDs and prevents accidental duplicate creation or overwrites.
 */
export function findDuplicateSubject(
  subjects: Subject[],
  code: string,
  departmentId: string,
  yearOfStudy?: string,
  semester?: string | number,
  excludeSubjectId?: string
): Subject | null {
  const cleanCode = code.trim().toUpperCase();
  const normDept = normalizeDeptId(departmentId);
  const targetSemNum = getSemesterNumber(semester);
  const targetSemName = formatSemesterName(semester);

  return (
    subjects.find(s => {
      if (excludeSubjectId && s.subjectId === excludeSubjectId) return false;
      if (normalizeDeptId(s.departmentId) !== normDept) return false;
      if (s.code.trim().toUpperCase() !== cleanCode) return false;
      if (s.status === 'INACTIVE') return false;

      // Scope checking:
      if (yearOfStudy && s.yearOfStudy && s.yearOfStudy !== yearOfStudy) return false;
      if (targetSemNum && s.semesterNumber && s.semesterNumber !== targetSemNum) return false;
      if (targetSemName && s.semester && s.semester !== targetSemName) return false;

      return true;
    }) || null
  );
}

// In-memory cache for fast responsive navigation
let cachedSubjects: Subject[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds (revalidated on mutation or expiration)

export function normalizeDeptId(id?: string | null): string {
  if (!id) return '';
  const clean = id.trim().toLowerCase();
  return clean.startsWith('dept-') ? clean : `dept-${clean}`;
}

export function invalidateSubjectCache() {
  cachedSubjects = null;
  cacheTime = 0;
}

export function getCachedSubjects(departmentId?: string): Subject[] | null {
  if (cachedSubjects && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    if (departmentId) {
      const targetNorm = normalizeDeptId(departmentId);
      return cachedSubjects.filter(s => normalizeDeptId(s.departmentId) === targetNorm);
    }
    return cachedSubjects;
  }
  return null;
}

export function getCachedDepartmentSubjectCounts(
  options: { activeOnly?: boolean } = { activeOnly: true }
): Map<string, number> | null {
  const allSubjs = getCachedSubjects();
  if (!allSubjs) return null;
  const activeOnly = options.activeOnly !== false;
  const map = new Map<string, number>();
  allSubjs.forEach(s => {
    if (activeOnly && s.status === 'INACTIVE') return;
    const norm = normalizeDeptId(s.departmentId);
    map.set(norm, (map.get(norm) || 0) + 1);
    if (s.departmentId && s.departmentId !== norm) {
      map.set(s.departmentId, (map.get(s.departmentId) || 0) + 1);
    }
  });
  return map;
}

export function getCachedGlobalSubjectCounts(): {
  total: number;
  active: number;
  theory: number;
  lab: number;
} | null {
  const allSubjs = getCachedSubjects();
  if (!allSubjs) return null;
  let active = 0;
  let theory = 0;
  let lab = 0;
  allSubjs.forEach(s => {
    if (s.status !== 'INACTIVE') {
      active++;
      if (s.type === 'Lab') lab++;
      else theory++;
    }
  });
  return { total: allSubjs.length, active, theory, lab };
}

export async function getAllSubjects(departmentId?: string, forceRefresh = false): Promise<Subject[]> {
  if (!forceRefresh && cachedSubjects && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    if (departmentId) {
      const targetNorm = normalizeDeptId(departmentId);
      return cachedSubjects.filter(s => normalizeDeptId(s.departmentId) === targetNorm);
    }
    return cachedSubjects;
  }

  try {
    const snap = await getDocs(collection(db, 'subjects'));
    const result = snap.docs.map(d => reconcileSubjectSemester(d.data() as Subject));
    cachedSubjects = result;
    cacheTime = Date.now();

    if (departmentId) {
      const targetNorm = normalizeDeptId(departmentId);
      return result.filter(s => normalizeDeptId(s.departmentId) === targetNorm);
    }
    return result;
  } catch (err) {
    console.error('Error fetching subjects:', err);
    return cachedSubjects ? (departmentId ? cachedSubjects.filter(s => normalizeDeptId(s.departmentId) === normalizeDeptId(departmentId)) : cachedSubjects) : [];
  }
}

/**
 * Sanitizes a Firestore write payload by removing any keys whose value is undefined.
 * Preserves intentional values including 0, false, null, and empty strings.
 * Guarantees Firestore setDoc / updateDoc operations never fail with:
 * "Unsupported field value: undefined"
 */
export function sanitizeSubjectPayload<T extends Record<string, any>>(payload: T): T {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
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
    yearOfStudy?: UndergraduateYear;
    semester?: string;
    semesterNumber?: number;
  },
  adminUid: string
): Promise<Subject> {
  const codeClean = data.code.trim().toUpperCase();
  const subjectId = `SUBJ-${data.departmentId.replace('dept-', '').toUpperCase()}-${codeClean}`;

  let semName = data.semester?.trim();
  let semNum = data.semesterNumber;
  if (semNum !== undefined && !semName) {
    semName = formatSemesterName(semNum);
  } else if (semName && semNum === undefined) {
    semNum = getSemesterNumber(semName);
  }

  const payload: Record<string, any> = {
    subjectId,
    code: codeClean,
    name: data.name.trim(),
    type: data.type,
    weeklyHours: Number(data.weeklyHours) || (data.type === 'Lab' ? 4 : 3),
    departmentId: data.departmentId,
    academicYear: data.academicYear || '2025–2026',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Lab block hours:
  // For Lab subjects: if specified (including 0), use that number; if omitted, default to 4.
  // For Theory subjects: omit when undefined; preserve only if explicitly provided.
  if (data.type === 'Lab') {
    if (data.labBlockHours !== undefined && data.labBlockHours !== null) {
      payload.labBlockHours = Number(data.labBlockHours);
    } else {
      payload.labBlockHours = 4;
    }
  } else if (data.labBlockHours !== undefined && data.labBlockHours !== null) {
    payload.labBlockHours = Number(data.labBlockHours);
  }

  if (data.yearOfStudy !== undefined && data.yearOfStudy !== null) {
    payload.yearOfStudy = data.yearOfStudy;
  }

  if (semName) {
    payload.semester = semName;
  }
  if (semNum !== undefined) {
    payload.semesterNumber = semNum;
  }

  const cleanRecord = sanitizeSubjectPayload(payload) as Subject;

  await setDoc(doc(db, 'subjects', subjectId), cleanRecord);
  invalidateSubjectCache();
  await logAdminAction(adminUid, 'CREATE_SUBJECT', 'subjects', subjectId, cleanRecord);
  return cleanRecord;
}

export async function updateSubject(
  subjectId: string,
  updates: Partial<Subject>,
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'subjects', subjectId);
  const payload: Record<string, any> = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  // Align semester and semesterNumber whenever either is provided
  if (updates.semester !== undefined || updates.semesterNumber !== undefined) {
    let semName = updates.semester?.trim();
    let semNum = updates.semesterNumber;
    if (semNum !== undefined && !semName) {
      semName = formatSemesterName(semNum);
    } else if (semName && semNum === undefined) {
      semNum = getSemesterNumber(semName);
    }
    if (semName !== undefined) payload.semester = semName;
    if (semNum !== undefined) payload.semesterNumber = semNum;
    if (semName || semNum !== undefined) {
      payload.requiresSemesterReview = false;
    }
  }

  // If updates explicitly specify Lab with undefined labBlockHours, default to 4
  if (updates.type === 'Lab' && updates.labBlockHours === undefined) {
    payload.labBlockHours = 4;
  }

  const clean = sanitizeSubjectPayload(payload);
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
  const targetNorm = normalizeDeptId(departmentId);
  return allSubjs.filter(s => {
    const sNorm = normalizeDeptId(s.departmentId);
    const matchesDept = sNorm === targetNorm;
    const isActive = s.status !== 'INACTIVE';
    return matchesDept && (!activeOnly || isActive);
  });
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
    if (activeOnly && s.status === 'INACTIVE') return;
    const norm = normalizeDeptId(s.departmentId);
    map.set(norm, (map.get(norm) || 0) + 1);
    if (s.departmentId && s.departmentId !== norm) {
      map.set(s.departmentId, (map.get(s.departmentId) || 0) + 1);
    }
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
