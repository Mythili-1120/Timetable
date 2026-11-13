import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  TeachingAssignment,
  ClassSection,
  Staff,
  Subject,
  StaffDepartmentLink,
  SubjectResolutionResult,
  StructuredValidationError,
  SubjectStaffValidationResult,
  AssignmentValidationErrorCode
} from '../../types';
import { logAdminAction } from './auditService';
import { getAllStaffDepartmentLinks, getStaffById, linkStaffToDepartment, invalidateStaffCache, getAllStaff } from './staffService';
import { getAllSubjects, normalizeDeptId, formatSemesterName, getSemesterNumber } from './subjectService';
import { getAllClasses } from './classService';

export interface AssignmentValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Returns canonical semester list for a given year of study.
 */
export function getSemestersForYear(yearOfStudy?: string): string[] {
  switch (yearOfStudy) {
    case '1st Year': return ['Semester 1', 'Semester 2'];
    case '2nd Year': return ['Semester 3', 'Semester 4'];
    case '3rd Year': return ['Semester 5', 'Semester 6'];
    case '4th Year': return ['Semester 7', 'Semester 8'];
    default: return ['Semester 1', 'Semester 2'];
  }
}

/**
 * Generates a deterministic unique slot ID for an assignment:
 * asgn_{classId}_{cleanSemester}_{subjectId}
 */
export function generateAssignmentSlotId(classId: string, subjectId: string, semester?: string): string {
  const cleanSem = semester ? semester.replace(/\s+/g, '-').toLowerCase() : 'sem1';
  return `asgn_${classId}_${cleanSem}_${subjectId}`;
}

/**
 * Canonical assignment validation: enforces required fields, positive weekly hours, and non-empty IDs.
 */
export function validateAssignmentInput(data: {
  memberId: string;
  departmentId: string;
  subjectId: string;
  classId: string;
  weeklyHours: number;
}): AssignmentValidationResult {
  if (!data.memberId?.trim()) {
    return { isValid: false, error: 'Faculty member is required.' };
  }
  if (!data.departmentId?.trim()) {
    return { isValid: false, error: 'Department is required.' };
  }
  if (!data.subjectId?.trim()) {
    return { isValid: false, error: 'Subject is required.' };
  }
  if (!data.classId?.trim()) {
    return { isValid: false, error: 'Class section is required.' };
  }
  if (typeof data.weeklyHours !== 'number' || isNaN(data.weeklyHours) || data.weeklyHours <= 0) {
    return { isValid: false, error: 'Weekly teaching hours must be a positive number.' };
  }
  return { isValid: true };
}

// ============================================================================
// CANONICAL SCOPED CACHE & IN-FLIGHT DEDUPLICATION
// ============================================================================

interface ScopedAssignmentCacheEntry {
  data: TeachingAssignment[];
  timestamp: number;
}

const scopedAssignmentCache = new Map<string, ScopedAssignmentCacheEntry>();
const inFlightAssignmentPromises = new Map<string, Promise<TeachingAssignment[]>>();
const CACHE_TTL_MS = 60000; // 60 seconds

function getAssignmentCacheKey(filters?: {
  departmentId?: string;
  classId?: string;
  memberId?: string;
  semester?: string;
  academicYear?: string;
}): string {
  if (!filters || Object.keys(filters).length === 0) return '__GLOBAL__';
  const parts: string[] = [];
  if (filters.classId) parts.push(`class:${filters.classId.trim()}`);
  if (filters.departmentId) parts.push(`dept:${normalizeDeptId(filters.departmentId)}`);
  if (filters.memberId) parts.push(`member:${filters.memberId.trim()}`);
  if (filters.semester && filters.semester !== 'ALL') parts.push(`sem:${filters.semester.trim()}`);
  if (filters.academicYear) parts.push(`acad:${filters.academicYear.trim()}`);
  return parts.length > 0 ? parts.sort().join('|') : '__GLOBAL__';
}

/**
 * Centrally invalidates the teaching assignment cache.
 * When classId or departmentId is passed, invalidates matching scopes and global cache.
 * When called without arguments, invalidates all scopes across the application.
 */
export function invalidateAssignmentCache(classId?: string, departmentId?: string) {
  scopedAssignmentCache.delete('__GLOBAL__');
  if (!classId && !departmentId) {
    scopedAssignmentCache.clear();
    return;
  }
  const cleanClass = classId?.trim();
  const normDept = departmentId ? normalizeDeptId(departmentId) : '';
  for (const key of Array.from(scopedAssignmentCache.keys())) {
    if (cleanClass && key.includes(`class:${cleanClass}`)) {
      scopedAssignmentCache.delete(key);
    } else if (normDept && key.includes(`dept:${normDept}`)) {
      scopedAssignmentCache.delete(key);
    }
  }
}

/**
 * Resolves teaching assignments from the scoped in-memory cache if fresh.
 */
export function getCachedAssignments(
  filters?: { departmentId?: string; classId?: string; memberId?: string; semester?: string; academicYear?: string }
): TeachingAssignment[] | null {
  const key = getAssignmentCacheKey(filters);
  const entry = scopedAssignmentCache.get(key);
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
    return entry.data;
  }

  // If a global cache snapshot exists, filter from it safely
  const globalEntry = scopedAssignmentCache.get('__GLOBAL__');
  if (globalEntry && (Date.now() - globalEntry.timestamp < CACHE_TTL_MS)) {
    let list = globalEntry.data;
    if (filters?.departmentId) {
      const targetNorm = normalizeDeptId(filters.departmentId);
      list = list.filter(a => normalizeDeptId(a.departmentId) === targetNorm);
    }
    if (filters?.classId) {
      const targetClass = filters.classId.trim();
      list = list.filter(a => a.classId === targetClass);
    }
    if (filters?.memberId) {
      const targetMember = filters.memberId.trim();
      list = list.filter(a => a.memberId === targetMember);
    }
    if (filters?.semester && filters.semester !== 'ALL') {
      list = list.filter(a => a.semester === filters.semester);
    }
    if (filters?.academicYear) {
      list = list.filter(a => a.academicYear === filters.academicYear);
    }
    return list;
  }

  return null;
}

/**
 * Canonical Teaching Assignment Fetcher:
 * - Reads from scoped cache when fresh.
 * - Deduplicates in-flight simultaneous requests for the identical scope.
 * - Dispatches correctly scoped, indexed Firestore queries (classId, departmentId, memberId).
 * - Avoids full collection scans when scoped queries are available.
 * - Supports forceRefresh to bypass cache and guarantee fresh database truth.
 */
export async function getAssignments(
  filters?: { departmentId?: string; classId?: string; memberId?: string; semester?: string; academicYear?: string },
  forceRefresh = false
): Promise<TeachingAssignment[]> {
  const cacheKey = getAssignmentCacheKey(filters);

  if (!forceRefresh) {
    const cached = getCachedAssignments(filters);
    if (cached) return cached;

    // Deduplicate in-flight concurrent requests for the exact same scope
    const existingPromise = inFlightAssignmentPromises.get(cacheKey);
    if (existingPromise) return await existingPromise;
  }

  const queryPromise = (async () => {
    try {
      let q = query(collection(db, 'teachingAssignments'));

      // Scoped Firestore queries
      if (filters?.classId) {
        q = query(collection(db, 'teachingAssignments'), where('classId', '==', filters.classId.trim()));
      } else if (filters?.departmentId) {
        q = query(collection(db, 'teachingAssignments'), where('departmentId', '==', filters.departmentId.trim()));
      } else if (filters?.memberId) {
        q = query(collection(db, 'teachingAssignments'), where('memberId', '==', filters.memberId.trim()));
      }

      const snap = await getDocs(q);
      let list = snap.docs.map(d => d.data() as TeachingAssignment);

      // Apply secondary filters
      if (filters?.departmentId && filters?.classId) {
        const targetNorm = normalizeDeptId(filters.departmentId);
        list = list.filter(a => normalizeDeptId(a.departmentId) === targetNorm);
      }
      if (filters?.semester && filters.semester !== 'ALL') {
        list = list.filter(a => a.semester === filters.semester);
      }
      if (filters?.academicYear) {
        list = list.filter(a => a.academicYear === filters.academicYear);
      }

      // Store in scoped cache
      scopedAssignmentCache.set(cacheKey, { data: list, timestamp: Date.now() });
      return list;
    } catch (err) {
      console.error('Error fetching teaching assignments:', err);
      const fallback = getCachedAssignments(filters);
      return fallback || [];
    } finally {
      inFlightAssignmentPromises.delete(cacheKey);
    }
  })();

  inFlightAssignmentPromises.set(cacheKey, queryPromise);
  return await queryPromise;
}

/**
 * Canonical Staff Subject Eligibility Validator.
 * Verifies that a staff member is configured and eligible to teach a subject in the relevant department.
 * Rules:
 * 1. Staff must belong to or be validly linked to the relevant Department.
 * 2. Staff must have the selected Subject in their canonical Subject eligibility records.
 * 3. Subject identity must match by Subject ID.
 * 4. Staff identity must match by permanent Member ID.
 * 5. A Staff member without the required Subject eligibility must not be silently assigned.
 */
export async function validateStaffSubjectEligibility(
  memberId: string,
  departmentId: string,
  subjectId: string
): Promise<{ isEligible: boolean; error?: string }> {
  if (!memberId?.trim()) {
    return { isEligible: false, error: 'Faculty member ID is required.' };
  }
  if (!departmentId?.trim()) {
    return { isEligible: false, error: 'Department ID is required.' };
  }
  if (!subjectId?.trim()) {
    return { isEligible: false, error: 'Subject ID is required.' };
  }

  const normDept = normalizeDeptId(departmentId);
  const cleanSubjId = subjectId.trim();

  const [staff, allLinks, allSubjects] = await Promise.all([
    getStaffById(memberId),
    getAllStaffDepartmentLinks(),
    getAllSubjects(departmentId)
  ]);

  if (!staff || staff.status !== 'ACTIVE') {
    return {
      isEligible: false,
      error: `Faculty member [${memberId}] does not exist or is inactive.`
    };
  }

  // 1. Verify Department affiliation (primary department OR active staffDepartmentLink)
  const isPrimaryDept = normalizeDeptId(staff.primaryDepartmentId) === normDept;
  const activeLink = allLinks.find(
    l => l.memberId === memberId && normalizeDeptId(l.departmentId) === normDept && l.status === 'ACTIVE'
  );

  if (!isPrimaryDept && !activeLink) {
    return {
      isEligible: false,
      error: `Faculty member ${staff.displayName || memberId} is not affiliated or linked with department [${departmentId}].`
    };
  }

  // 2. Verify Subject belongs to department
  const subjectExists = allSubjects.some(
    s => s.subjectId === cleanSubjId || s.subjectId.trim() === cleanSubjId
  );
  if (!subjectExists) {
    return {
      isEligible: false,
      error: `Subject [${subjectId}] does not belong to the selected department.`
    };
  }

  // Centralized Allocation Architecture: Any active faculty member can be allocated
  // to an institutional curriculum course. Legacy subjectIds are preserved for backward compatibility
  // but are no longer a mandatory prerequisite blocking assignment.
  return { isEligible: true };
}

export async function createAssignment(
  data: {
    memberId: string;
    departmentId: string;
    subjectId: string;
    classId: string;
    weeklyHours: number;
    type: 'Theory' | 'Lab';
    academicYear?: string;
    semester?: string;
    assignmentId?: string;
  },
  adminUid: string
): Promise<TeachingAssignment> {
  const validation = validateAssignmentInput(data);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid assignment input');
  }

  // Verify Staff exists and is active before saving
  const staff = await getStaffById(data.memberId.trim());
  if (!staff || staff.status !== 'ACTIVE') {
    throw new Error(`Faculty member [${data.memberId}] does not exist or is inactive.`);
  }

  // Deterministic unique slot ID: asgn_{classId}_{cleanSemester}_{cleanSubjectId}
  // Enforces 1 active assignment per subject per class section
  const cleanSem = data.semester ? data.semester.replace(/\s+/g, '-').toLowerCase() : 'sem1';
  const cleanSubj = data.subjectId.trim();
  const assignmentId = data.assignmentId || generateAssignmentSlotId(data.classId, cleanSubj, cleanSem);

  const record: TeachingAssignment = {
    assignmentId,
    memberId: data.memberId.trim(),
    departmentId: data.departmentId,
    subjectId: cleanSubj,
    classId: data.classId,
    weeklyHours: Number(data.weeklyHours),
    type: data.type,
    status: 'ACTIVE',
    ...(data.academicYear ? { academicYear: data.academicYear } : {}),
    ...(data.semester ? { semester: data.semester } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'teachingAssignments', assignmentId), record);
  invalidateAssignmentCache(data.classId, data.departmentId);
  await logAdminAction(adminUid, 'CREATE_ASSIGNMENT', 'teachingAssignments', assignmentId, record);
  return record;
}

export async function deleteAssignment(assignmentId: string, adminUid: string): Promise<void> {
  const asgnRef = doc(db, 'teachingAssignments', assignmentId);
  const snap = await getDoc(asgnRef);
  const existing = snap.exists() ? snap.data() as TeachingAssignment : null;
  await deleteDoc(asgnRef);
  invalidateAssignmentCache(existing?.classId, existing?.departmentId);
  await logAdminAction(adminUid, 'DELETE_ASSIGNMENT', 'teachingAssignments', assignmentId);
}

// ============================================================================
// CANONICAL STAFF–SUBJECT MAPPING & AUTOMATIC RESOLUTION ENGINE
// ============================================================================

/**
 * Maps a faculty member to a specific subject in a teaching department.
 * Authoritative record is saved in staffDepartmentLinks/${memberId}_${departmentId}.
 */
export async function mapStaffToSubject(
  memberId: string,
  departmentId: string,
  subjectId: string,
  adminUid: string
): Promise<void> {
  const linkId = `${memberId}_${departmentId}`;
  const ref = doc(db, 'staffDepartmentLinks', linkId);

  const snap = await getDoc(ref);
  const now = new Date().toISOString();

  if (snap.exists()) {
    const existing = snap.data() as StaffDepartmentLink;
    const currentSubjects = Array.isArray(existing.subjectIds) ? existing.subjectIds : [];
    if (!currentSubjects.includes(subjectId)) {
      currentSubjects.push(subjectId);
    }
    await updateDoc(ref, {
      subjectIds: currentSubjects,
      status: 'ACTIVE',
      updatedAt: now
    });
  } else {
    const record: StaffDepartmentLink = {
      linkId,
      memberId,
      departmentId,
      subjectIds: [subjectId],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };
    await setDoc(ref, record);
  }

  invalidateStaffCache();
  await logAdminAction(adminUid, 'MAP_STAFF_SUBJECT', 'staffDepartmentLinks', linkId, {
    memberId,
    departmentId,
    subjectId
  });
}

/**
 * Removes a subject mapping from a faculty member in a teaching department.
 */
export async function unmapStaffFromSubject(
  memberId: string,
  departmentId: string,
  subjectId: string,
  adminUid: string
): Promise<void> {
  const linkId = `${memberId}_${departmentId}`;
  const ref = doc(db, 'staffDepartmentLinks', linkId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as StaffDepartmentLink;
    const currentSubjects = (existing.subjectIds || []).filter(id => id !== subjectId);
    await updateDoc(ref, {
      subjectIds: currentSubjects,
      updatedAt: new Date().toISOString()
    });
    invalidateStaffCache();
    await logAdminAction(adminUid, 'UNMAP_STAFF_SUBJECT', 'staffDepartmentLinks', linkId, {
      memberId,
      departmentId,
      subjectId
    });
  }
}

/**
 * Copies teaching assignments from one class section to another.
 * Extremely helpful for multi-section departments (e.g. copying from Section A to Section B).
 */
export async function copyAssignmentsBetweenClasses(
  sourceClassId: string,
  targetClassId: string,
  adminUid: string
): Promise<{ copied: number; skipped: number }> {
  if (sourceClassId === targetClassId) return { copied: 0, skipped: 0 };

  const [sourceAsgns, targetAsgns, targetClasses] = await Promise.all([
    getAssignments({ classId: sourceClassId }, true),
    getAssignments({ classId: targetClassId }, true),
    getAllClasses()
  ]);

  const targetClass = targetClasses.find(c => c.classId === targetClassId);
  if (!targetClass) throw new Error(`Target class section ${targetClassId} not found.`);

  const existingSubjectIds = new Set(targetAsgns.map(a => a.subjectId.trim()));
  let copied = 0;
  let skipped = 0;

  for (const asgn of sourceAsgns) {
    if (asgn.status !== 'ACTIVE') continue;
    if (existingSubjectIds.has(asgn.subjectId.trim())) {
      skipped++;
      continue;
    }

    // Ensure staff member is linked to target class department if needed
    const links = await getAllStaffDepartmentLinks();
    const hasLink = links.some(l => l.memberId === asgn.memberId && l.departmentId === targetClass.departmentId && l.status === 'ACTIVE');
    if (!hasLink) {
      await linkStaffToDepartment(asgn.memberId, targetClass.departmentId, adminUid);
    }

    await createAssignment(
      {
        memberId: asgn.memberId,
        departmentId: targetClass.departmentId,
        subjectId: asgn.subjectId,
        classId: targetClassId,
        weeklyHours: asgn.weeklyHours,
        type: asgn.type || 'Theory',
        academicYear: targetClass.academicYear || asgn.academicYear || '2025–2026',
        semester: asgn.semester || 'Semester 1'
      },
      adminUid
    );
    existingSubjectIds.add(asgn.subjectId.trim());
    copied++;
  }

  invalidateAssignmentCache(targetClassId, targetClass.departmentId);
  return { copied, skipped };
}

/**
 * Retrieves all subject IDs that a staff member is authorized/mapped to teach in a department.
 * Derived from staffDepartmentLinks and existing confirmed teaching assignments.
 */
export async function getStaffMappedSubjectIds(
  memberId: string,
  departmentId: string
): Promise<string[]> {
  const [allLinks, staffMember] = await Promise.all([
    getAllStaffDepartmentLinks(),
    getStaffById(memberId)
  ]);
  const link = allLinks.find(l => l.memberId === memberId && l.departmentId === departmentId && l.status === 'ACTIVE');
  const mappedSet = new Set<string>(link?.subjectIds || []);

  // Include canonical subjectIds stored directly on the Staff document
  if (staffMember?.subjectIds && Array.isArray(staffMember.subjectIds)) {
    staffMember.subjectIds.forEach(id => mappedSet.add(id));
  }

  // Also include previously confirmed assignments in this department
  const assignments = await getAssignments({ memberId, departmentId });
  assignments.forEach(asgn => {
    if (asgn.status === 'ACTIVE') {
      mappedSet.add(asgn.subjectId);
    }
  });

  return Array.from(mappedSet);
}

/**
 * Retrieves the authoritative active curriculum subjects for a specific class section.
 */
export async function getClassCurriculumSubjects(classInput: string | ClassSection, semester?: string | number): Promise<Subject[]> {
  let classSection: ClassSection | undefined;

  if (typeof classInput === 'string') {
    const allClasses = await getAllClasses();
    classSection = allClasses.find(c => c.classId === classInput);
  } else {
    classSection = classInput;
  }

  if (!classSection) {
    throw new Error('Class section not found.');
  }

  const allSubjects = await getAllSubjects(classSection.departmentId);

  return allSubjects.filter(subj => {
    if (subj.status !== 'ACTIVE') return false;
    if (subj.departmentId !== classSection!.departmentId) return false;
    // Match yearOfStudy if configured
    if (subj.yearOfStudy && classSection!.yearOfStudy && subj.yearOfStudy !== classSection!.yearOfStudy) {
      return false;
    }
    if (semester && semester !== 'ALL') {
      const targetStr = formatSemesterName(semester);
      const targetNum = getSemesterNumber(semester);
      if (subj.semester && subj.semester !== targetStr) return false;
      if (subj.semesterNumber && subj.semesterNumber !== targetNum) return false;
    }
    return true;
  });
}

/**
 * Automatic Subject Resolution Core:
 * Intersects `Selected Class Curriculum` with `Selected Staff's Active Department Mappings`.
 * Handles Case 1 (Single), Case 2 (Multiple), Case 3 (None), Case 4 (Already Assigned).
 */
export async function resolveSubjectForStaffAndClass(params: {
  memberId: string;
  classId: string;
  semester?: string;
}): Promise<SubjectResolutionResult> {
  const [allClasses, staffMember] = await Promise.all([
    getAllClasses(),
    getStaffById(params.memberId)
  ]);

  const classSection = allClasses.find(c => c.classId === params.classId);
  if (!classSection) {
    throw new Error(`Class section "${params.classId}" does not exist.`);
  }
  if (!staffMember) {
    throw new Error(`Staff member "${params.memberId}" does not exist.`);
  }

  let curriculumSubjects = await getClassCurriculumSubjects(classSection, params.semester);
  if (params.semester && params.semester !== 'ALL') {
    const targetStr = formatSemesterName(params.semester);
    const targetNum = getSemesterNumber(params.semester);
    const semMatches = curriculumSubjects.filter(s => s.semester === targetStr || s.semesterNumber === targetNum);
    if (semMatches.length > 0) {
      curriculumSubjects = semMatches;
    }
  }

  const staffMappedSubjectIds = await getStaffMappedSubjectIds(params.memberId, classSection.departmentId);

  // Intersection: Class Curriculum ∩ Staff's Active Department-Subject Mappings
  const matchingSubjects = curriculumSubjects.filter(s => staffMappedSubjectIds.includes(s.subjectId));

  // Check if an assignment already exists for this class and staff
  const existingAssignments = await getAssignments({
    classId: params.classId,
    memberId: params.memberId
  });

  const activeExisting = existingAssignments.find(a => {
    if (a.status !== 'ACTIVE') return false;
    if (params.semester && a.semester && a.semester !== params.semester) return false;
    return true;
  });

  // Case 4: Already assigned to a subject in this class
  if (activeExisting) {
    const assignedSubj = curriculumSubjects.find(s => s.subjectId === activeExisting.subjectId);
    return {
      status: 'ALREADY_ASSIGNED',
      classSection,
      staff: staffMember,
      matchingSubjects,
      curriculumSubjects,
      selectedSubject: assignedSubj,
      existingAssignment: activeExisting,
      message: `Faculty member is already assigned to ${assignedSubj?.name || activeExisting.subjectId} for this class section${params.semester ? ` in ${params.semester}` : ''}.`
    };
  }

  // Case 1: Exactly One Matching Subject
  if (matchingSubjects.length === 1) {
    return {
      status: 'SINGLE_MATCH',
      classSection,
      staff: staffMember,
      matchingSubjects,
      curriculumSubjects,
      selectedSubject: matchingSubjects[0],
      message: `Automatically resolved: ${matchingSubjects[0].name} (${matchingSubjects[0].weeklyHours} hrs/week ${matchingSubjects[0].type})`
    };
  }

  // Case 2: Multiple Matching Subjects
  if (matchingSubjects.length > 1) {
    return {
      status: 'MULTIPLE_MATCHES',
      classSection,
      staff: staffMember,
      matchingSubjects,
      curriculumSubjects,
      message: `Multiple matching subjects found (${matchingSubjects.length}). Please select the intended course.`
    };
  }

  // Case 3: No Matching Subject
  return {
    status: 'NO_MATCH',
    classSection,
    staff: staffMember,
    matchingSubjects: [],
    curriculumSubjects,
    message: `Faculty member ${staffMember.displayName} is not yet mapped to any subject in ${classSection.yearOfStudy}${params.semester ? ` (${params.semester})` : ''} curriculum. Choose a curriculum course below to establish the mapping.`
  };
}

/**
 * Automatically creates a confirmed Teaching Assignment from resolved relationships.
 * Authoritative weekly hours and type are strictly derived from the Subject Master.
 * Persists mapping to staffDepartmentLinks for future instant resolution.
 */
export async function autoCreateTeachingAssignment(
  params: {
    memberId: string;
    classId: string;
    subjectId?: string;
    semester?: string;
    academicYear?: string;
  },
  adminUid: string
): Promise<TeachingAssignment> {
  let targetSubjectId = params.subjectId;
  let targetClassId = params.classId;
  let targetMemberId = params.memberId;
  let targetSemester = params.semester;

  const resolution = await resolveSubjectForStaffAndClass({
    memberId: targetMemberId,
    classId: targetClassId,
    semester: targetSemester
  });

  if (resolution.status === 'ALREADY_ASSIGNED' && resolution.existingAssignment) {
    return resolution.existingAssignment;
  }

  if (!targetSubjectId) {
    if (resolution.status === 'SINGLE_MATCH' && resolution.selectedSubject) {
      targetSubjectId = resolution.selectedSubject.subjectId;
    } else if (resolution.status === 'MULTIPLE_MATCHES') {
      throw new Error('Multiple matching subjects found. Please specify the target subjectId.');
    } else {
      throw new Error('No matching subject found for faculty member in this class curriculum.');
    }
  }

  // Authoritative Subject lookup for hours and course type
  const allSubjs = await getAllSubjects(resolution.classSection.departmentId);
  const subjObj = allSubjs.find(s => s.subjectId === targetSubjectId);

  if (!subjObj) {
    throw new Error(`Subject "${targetSubjectId}" not found in department curriculum.`);
  }

  if (!targetSemester && subjObj.semester) {
    targetSemester = subjObj.semester;
  }

  // Create canonical teaching assignment with deterministic ID and authoritative hours
  return await createAssignment(
    {
      memberId: targetMemberId,
      departmentId: resolution.classSection.departmentId,
      subjectId: targetSubjectId,
      classId: targetClassId,
      weeklyHours: subjObj.weeklyHours, // Strictly from curriculum Master
      type: subjObj.type,
      academicYear: params.academicYear || resolution.classSection.academicYear,
      semester: targetSemester
    },
    adminUid
  );
}

/**
 * Reassigns an existing teaching assignment slot to a different staff member.
 * In-place update preserving assignment ID, class, subject, weekly hours, and type.
 * Records previousMemberId and reassignedAt for audit trail.
 */
export async function reassignStaff(
  assignmentId: string,
  newMemberId: string,
  adminUid: string
): Promise<TeachingAssignment> {
  if (!assignmentId?.trim()) {
    throw new Error('Assignment ID is required for reassignment.');
  }
  if (!newMemberId?.trim()) {
    throw new Error('New staff member ID is required for reassignment.');
  }

  const asgnRef = doc(db, 'teachingAssignments', assignmentId);
  const snap = await getDoc(asgnRef);
  if (!snap.exists()) {
    throw new Error(`Teaching assignment "${assignmentId}" not found.`);
  }

  const existing = snap.data() as TeachingAssignment;

  if (existing.memberId === newMemberId) {
    throw new Error(`Faculty member ${newMemberId} is already assigned to this slot.`);
  }

  // Verify new staff member exists and is active
  const newStaff = await getStaffById(newMemberId);
  if (!newStaff || newStaff.status !== 'ACTIVE') {
    throw new Error(`Faculty member "${newMemberId}" does not exist or is inactive.`);
  }

  // Ensure new staff is linked to the department
  const links = await getAllStaffDepartmentLinks();
  const hasLink = links.some(l => l.memberId === newMemberId && l.departmentId === existing.departmentId && l.status === 'ACTIVE');
  if (!hasLink) {
    await linkStaffToDepartment(newMemberId, existing.departmentId, adminUid);
  }

  const now = new Date().toISOString();
  const oldMemberId = existing.memberId;

  const updated: TeachingAssignment = {
    ...existing,
    memberId: newMemberId,
    previousMemberId: oldMemberId,
    reassignedAt: now,
    updatedAt: now
  };

  await updateDoc(asgnRef, {
    memberId: newMemberId,
    previousMemberId: oldMemberId,
    reassignedAt: now,
    updatedAt: now
  });
  invalidateAssignmentCache(existing.classId, existing.departmentId);

  await logAdminAction(adminUid, 'REASSIGN_STAFF', 'teachingAssignments', assignmentId, {
    previousMemberId: oldMemberId,
    newMemberId,
    departmentId: existing.departmentId,
    subjectId: existing.subjectId,
    classId: existing.classId
  });

  return updated;
}

// ============================================================================
// CANONICAL ASSIGNMENT METRICS
// ============================================================================

/**
 * Resolves the count of teaching assignments for a department.
 */
export async function getDepartmentAssignmentCount(departmentId: string): Promise<number> {
  const list = await getAssignments({ departmentId });
  return list.length;
}

/**
 * Resolves global total teaching assignments.
 */
export async function getGlobalAssignmentCount(): Promise<number> {
  const list = await getAssignments();
  return list.length;
}

// ============================================================================
// SUBJECT-WISE STAFF VALIDATION ENGINE
// ============================================================================

export type { SubjectStaffValidationResult };

/**
 * Subject-Wise Staff Validation:
 * Validates that every curriculum subject in the selected class/semester scope has an active,
 * eligible Staff assignment. If any subject is missing an assigned Staff member, returns blocking errors.
 * Never creates warnings for faculty members whose subjects are not in the selected scope.
 */
export async function validateSubjectStaffForClass(
  classInput: string | ClassSection,
  semester?: string,
  forceRefresh = false,
  expectedDepartmentId?: string,
  expectedYearOfStudy?: string
): Promise<SubjectStaffValidationResult> {
  // A. SECTION_NOT_SELECTED: Validate presence of selected class section
  if (!classInput || (typeof classInput === 'string' && !classInput.trim())) {
    const err: StructuredValidationError = {
      errorCode: 'SECTION_NOT_SELECTED',
      departmentId: expectedDepartmentId || '',
      classId: '',
      message: 'No class section has been selected. Please choose an Academic Year and Section.',
      recommendedAction: 'Select a valid Section from the Section dropdown selector above.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: [],
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  const [allClasses, allSubjects, allStaff, allDeptLinks] = await Promise.all([
    getAllClasses(undefined, undefined, forceRefresh),
    getAllSubjects(undefined, forceRefresh),
    getAllStaff(forceRefresh),
    getAllStaffDepartmentLinks(forceRefresh)
  ]);

  const cleanClassId = typeof classInput === 'string' ? classInput.trim() : classInput.classId?.trim() || '';
  const classSection = typeof classInput === 'string'
    ? allClasses.find((c: ClassSection) => c.classId === cleanClassId)
    : classInput;

  // B. SECTION_NOT_FOUND: Class does not exist in canonical collection
  if (!classSection) {
    const err: StructuredValidationError = {
      errorCode: 'SECTION_NOT_FOUND',
      departmentId: expectedDepartmentId || '',
      classId: cleanClassId,
      message: `Selected class section "${cleanClassId}" was not found in institutional records.`,
      recommendedAction: 'Verify that the class section exists in Department Academic Years.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: [],
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  // C. SECTION_DEPARTMENT_MISMATCH: Selected section belongs to a different department
  if (expectedDepartmentId && normalizeDeptId(classSection.departmentId) !== normalizeDeptId(expectedDepartmentId)) {
    const err: StructuredValidationError = {
      errorCode: 'SECTION_DEPARTMENT_MISMATCH',
      departmentId: classSection.departmentId,
      classId: classSection.classId,
      message: `Selected section "${classSection.classId}" belongs to department "${classSection.departmentId}", not "${expectedDepartmentId}".`,
      recommendedAction: 'Select a section that belongs to the currently active department.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: [],
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  // D. SECTION_ACADEMIC_YEAR_MISMATCH: Selected section belongs to a different year of study
  if (expectedYearOfStudy && classSection.yearOfStudy !== expectedYearOfStudy) {
    const err: StructuredValidationError = {
      errorCode: 'SECTION_ACADEMIC_YEAR_MISMATCH',
      departmentId: classSection.departmentId,
      classId: classSection.classId,
      message: `Selected section "${classSection.classId}" is in ${classSection.yearOfStudy}, not the active cohort ${expectedYearOfStudy}.`,
      recommendedAction: 'Select a section corresponding to the active Academic Year Cohort.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: [],
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  const targetNormDept = normalizeDeptId(classSection.departmentId);

  // 1. Get curriculum subjects for this class section
  const deptSubjects = allSubjects.filter((s: Subject) => {
    if (s.status !== 'ACTIVE') return false;
    if (normalizeDeptId(s.departmentId) !== targetNormDept) return false;
    if (s.yearOfStudy && classSection.yearOfStudy && s.yearOfStudy !== classSection.yearOfStudy) {
      return false;
    }
    return true;
  });

  // Filter by semester if specified (e.g. 'Semester 1')
  const scopedSubjects = deptSubjects.filter((s: Subject) => {
    if (semester && semester !== 'ALL') {
      const targetStr = formatSemesterName(semester);
      const targetNum = getSemesterNumber(semester);
      if (s.semester && s.semester !== targetStr) return false;
      if (s.semesterNumber && s.semesterNumber !== targetNum) return false;
    }
    return true;
  });

  if (scopedSubjects.length === 0) {
    const err: StructuredValidationError = {
      errorCode: 'NO_CURRICULUM_SUBJECTS',
      departmentId: classSection.departmentId,
      classId: classSection.classId,
      message: `No active curriculum subjects found for ${classSection.yearOfStudy} — Section ${classSection.section}.`,
      recommendedAction: 'Add subjects in Department / Subject Master before attempting timetable generation.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: [],
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  // 2. Get teaching assignments for this class (H. ASSIGNMENT_DATA_LOAD_FAILED protection)
  let assignments: TeachingAssignment[] = [];
  try {
    assignments = await getAssignments({ classId: classSection.classId }, forceRefresh);
    if (semester && semester !== 'ALL') {
      const semAsgns = assignments.filter(a => a.semester === semester);
      if (semAsgns.length > 0) {
        assignments = semAsgns;
      }
    }
  } catch (loadErr: any) {
    console.error('Failed to load teaching assignments for section:', loadErr);
    const err: StructuredValidationError = {
      errorCode: 'ASSIGNMENT_DATA_LOAD_FAILED',
      departmentId: classSection.departmentId,
      classId: classSection.classId,
      message: `Failed to load teaching assignments for Section ${classSection.section} from Firestore: ${loadErr?.message || 'Read error'}.`,
      recommendedAction: 'Check network connectivity and Firestore security permissions. Do not assume assignments are missing.'
    };
    return {
      isValid: false,
      canGenerate: false,
      totalRequiredHours: 0,
      curriculumSubjects: scopedSubjects,
      assignedSubjects: [],
      missingStaffSubjects: [],
      blockingErrors: [err.message],
      structuredErrors: [err]
    };
  }

  // I. ASSIGNMENT_DATA_AMBIGUOUS: Detect multiple conflicting faculty records for the same subject
  const asgnsBySubject = new Map<string, TeachingAssignment[]>();
  assignments.forEach(a => {
    if (a.status === 'ACTIVE' && a.subjectId) {
      const cleanKey = a.subjectId.trim();
      const existing = asgnsBySubject.get(cleanKey) || [];
      existing.push(a);
      asgnsBySubject.set(cleanKey, existing);
    }
  });

  for (const [subjKey, asgnList] of Array.from(asgnsBySubject.entries())) {
    const distinctFaculty = Array.from(new Set(asgnList.map((a: TeachingAssignment) => a.memberId?.trim()).filter(Boolean)));
    if (distinctFaculty.length > 1) {
      const matchedSubj = scopedSubjects.find(s => s.subjectId.trim() === subjKey);
      const err: StructuredValidationError = {
        errorCode: 'ASSIGNMENT_DATA_AMBIGUOUS',
        subjectId: subjKey,
        subjectName: matchedSubj?.name || subjKey,
        departmentId: classSection.departmentId,
        classId: classSection.classId,
        message: `Ambiguous teaching assignments: Subject "${matchedSubj?.name || subjKey}" has conflicting active assignments to faculty [${distinctFaculty.join(', ')}].`,
        recommendedAction: 'Clean up duplicate assignments in Department Teaching Assignments.'
      };
      return {
        isValid: false,
        canGenerate: false,
        totalRequiredHours: 0,
        curriculumSubjects: scopedSubjects,
        assignedSubjects: [],
        missingStaffSubjects: matchedSubj ? [matchedSubj] : [],
        blockingErrors: [err.message],
        structuredErrors: [err]
      };
    }
  }

  const staffMap = new Map<string, Staff>();
  allStaff.forEach((st: Staff) => staffMap.set(st.memberId, st));

  const asgnMap = new Map<string, TeachingAssignment>();
  assignments.forEach(a => {
    if (a.status === 'ACTIVE' && a.subjectId) {
      const keys = [a.subjectId, a.subjectId.trim(), a.subjectId.trim().toUpperCase()];
      keys.forEach(k => {
        const existing = asgnMap.get(k);
        if (!existing || (a.updatedAt && existing.updatedAt && a.updatedAt > existing.updatedAt)) {
          asgnMap.set(k, a);
        }
      });
    }
  });

  const assignedSubjects: { subject: Subject; assignment: TeachingAssignment; staff: Staff }[] = [];
  const missingStaffSubjects: Subject[] = [];
  const structuredErrors: StructuredValidationError[] = [];
  let totalRequiredHours = 0;

  const linkSubjMap = new Map<string, string[]>();
  allDeptLinks.forEach(l => {
    if (l.status === 'ACTIVE') {
      const key = `${l.memberId}_${normalizeDeptId(l.departmentId)}`;
      linkSubjMap.set(key, l.subjectIds || []);
    }
  });

  for (const subj of scopedSubjects) {
    totalRequiredHours += Number(subj.weeklyHours) || (subj.type === 'Lab' ? 4 : 3);
    const cleanSubjId = subj.subjectId.trim();
    const asgn = asgnMap.get(subj.subjectId) || asgnMap.get(cleanSubjId) || asgnMap.get(cleanSubjId.toUpperCase());

    // E. SUBJECT_ASSIGNMENT_MISSING: Genuine missing assignment for this exact section
    if (!asgn || !asgn.memberId?.trim()) {
      missingStaffSubjects.push(subj);
      structuredErrors.push({
        errorCode: 'SUBJECT_ASSIGNMENT_MISSING',
        subjectId: subj.subjectId,
        subjectName: subj.name,
        departmentId: classSection.departmentId,
        classId: classSection.classId,
        message: `Staff assignment is missing for ${subj.name} (${subj.code}) in ${classSection.yearOfStudy} — Section ${classSection.section}.`,
        recommendedAction: 'Assign an active, qualified faculty member in Department Teaching Assignments.'
      });
      continue;
    }

    const staff = staffMap.get(asgn.memberId.trim());
    // F. STAFF_INACTIVE: Assigned staff member is marked inactive or deleted
    if (!staff || staff.status === 'INACTIVE') {
      missingStaffSubjects.push(subj);
      structuredErrors.push({
        errorCode: 'STAFF_INACTIVE',
        subjectId: subj.subjectId,
        subjectName: subj.name,
        departmentId: classSection.departmentId,
        classId: classSection.classId,
        memberId: asgn.memberId,
        staffName: staff?.displayName || asgn.memberId,
        message: `Assigned faculty [${asgn.memberId} - ${staff?.displayName || 'Faculty'}] for ${subj.name} is inactive.`,
        recommendedAction: 'Reactivate this faculty member in the Staff tab or reassign the course to an active faculty member.'
      });
      continue;
    }

    // Valid active assignment in place
    assignedSubjects.push({ subject: subj, assignment: asgn, staff });
  }

  const blockingErrors = structuredErrors.map(e => e.message);
  const isValid = missingStaffSubjects.length === 0 && structuredErrors.length === 0;

  return {
    isValid,
    canGenerate: isValid,
    totalRequiredHours,
    curriculumSubjects: scopedSubjects,
    assignedSubjects,
    missingStaffSubjects,
    blockingErrors,
    structuredErrors
  };
}
