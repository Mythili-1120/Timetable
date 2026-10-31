import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TeachingAssignment, ClassSection, Staff, Subject, StaffDepartmentLink, SubjectResolutionResult } from '../../types';
import { logAdminAction } from './auditService';
import { getAllStaffDepartmentLinks, getStaffById, linkStaffToDepartment, invalidateStaffCache } from './staffService';
import { getAllSubjects } from './subjectService';
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

// In-memory cache for fast responsive navigation
let cachedAssignments: TeachingAssignment[] | null = null;
let assignmentCacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds (revalidated on mutation or expiration)

export function invalidateAssignmentCache() {
  cachedAssignments = null;
  assignmentCacheTime = 0;
}

export function getCachedAssignments(
  filters?: { departmentId?: string; classId?: string; memberId?: string; semester?: string; academicYear?: string }
): TeachingAssignment[] | null {
  if (cachedAssignments && (Date.now() - assignmentCacheTime < CACHE_TTL_MS)) {
    let list = cachedAssignments;
    if (filters?.departmentId) {
      list = list.filter(a => a.departmentId === filters.departmentId);
    }
    if (filters?.classId) {
      list = list.filter(a => a.classId === filters.classId);
    }
    if (filters?.memberId) {
      list = list.filter(a => a.memberId === filters.memberId);
    }
    if (filters?.semester) {
      list = list.filter(a => a.semester === filters.semester);
    }
    if (filters?.academicYear) {
      list = list.filter(a => a.academicYear === filters.academicYear);
    }
    return list;
  }
  return null;
}

export async function getAssignments(
  filters?: { departmentId?: string; classId?: string; memberId?: string; semester?: string; academicYear?: string },
  forceRefresh = false
): Promise<TeachingAssignment[]> {
  if (!forceRefresh && cachedAssignments && (Date.now() - assignmentCacheTime < CACHE_TTL_MS)) {
    return getCachedAssignments(filters) || [];
  }

  try {
    let q = query(collection(db, 'teachingAssignments'));
    if (!filters && (!cachedAssignments || forceRefresh)) {
      // fetch all into cache
      const snap = await getDocs(q);
      const all = snap.docs.map(d => d.data() as TeachingAssignment);
      cachedAssignments = all;
      assignmentCacheTime = Date.now();
      return all;
    }

    if (filters?.classId && (!cachedAssignments || forceRefresh)) {
      q = query(collection(db, 'teachingAssignments'), where('classId', '==', filters.classId));
    } else if (filters?.departmentId && (!cachedAssignments || forceRefresh)) {
      q = query(collection(db, 'teachingAssignments'), where('departmentId', '==', filters.departmentId));
    } else if (filters?.memberId && (!cachedAssignments || forceRefresh)) {
      q = query(collection(db, 'teachingAssignments'), where('memberId', '==', filters.memberId));
    }

    const snap = await getDocs(q);
    let list = snap.docs.map(d => d.data() as TeachingAssignment);

    if (!filters?.classId && !filters?.departmentId && !filters?.memberId) {
      cachedAssignments = list;
      assignmentCacheTime = Date.now();
    }

    if (filters?.semester) {
      list = list.filter(a => a.semester === filters.semester);
    }
    if (filters?.academicYear) {
      list = list.filter(a => a.academicYear === filters.academicYear);
    }

    return list;
  } catch (err) {
    console.error('Error fetching teaching assignments:', err);
    return cachedAssignments ? getCachedAssignments(filters) || [] : [];
  }
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

  const assignmentId = data.assignmentId || (
    data.semester
      ? generateAssignmentSlotId(data.classId, data.subjectId, data.semester)
      : `asgn_${data.classId}_${data.subjectId}_${data.memberId}`
  );

  const record: TeachingAssignment = {
    assignmentId,
    memberId: data.memberId,
    departmentId: data.departmentId,
    subjectId: data.subjectId,
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
  invalidateAssignmentCache();
  await logAdminAction(adminUid, 'CREATE_ASSIGNMENT', 'teachingAssignments', assignmentId, record);
  return record;
}

export async function deleteAssignment(assignmentId: string, adminUid: string): Promise<void> {
  await deleteDoc(doc(db, 'teachingAssignments', assignmentId));
  invalidateAssignmentCache();
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
 * Retrieves all subject IDs that a staff member is authorized/mapped to teach in a department.
 * Derived from staffDepartmentLinks and existing confirmed teaching assignments.
 */
export async function getStaffMappedSubjectIds(
  memberId: string,
  departmentId: string
): Promise<string[]> {
  const allLinks = await getAllStaffDepartmentLinks();
  const link = allLinks.find(l => l.memberId === memberId && l.departmentId === departmentId && l.status === 'ACTIVE');
  const mappedSet = new Set<string>(link?.subjectIds || []);

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
export async function getClassCurriculumSubjects(classInput: string | ClassSection): Promise<Subject[]> {
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

  let curriculumSubjects = await getClassCurriculumSubjects(classSection);
  if (params.semester) {
    const semMatches = curriculumSubjects.filter(s => s.semester === params.semester);
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

  // 1. Ensure staff-subject mapping is persisted for future auto-resolution
  await mapStaffToSubject(targetMemberId, resolution.classSection.departmentId, targetSubjectId, adminUid);

  // 2. Create canonical teaching assignment with deterministic ID and authoritative hours
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

  // Ensure new staff is mapped to the subject
  await mapStaffToSubject(newMemberId, existing.departmentId, existing.subjectId, adminUid);

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
  invalidateAssignmentCache();

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
