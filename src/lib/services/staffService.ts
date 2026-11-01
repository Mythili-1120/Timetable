import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Staff, StaffDepartmentLink } from '../../types';
import { generateNextMemberId } from './idService';
import { logAdminAction } from './auditService';
import { validatePhoneNumber } from '../utils/phoneValidation';

// In-memory cache for fast responsive navigation
let cachedStaff: Staff[] | null = null;
let staffCacheTime = 0;
let cachedLinks: StaffDepartmentLink[] | null = null;
let linksCacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds (revalidated on mutation or expiration)

export function invalidateStaffCache() {
  cachedStaff = null;
  staffCacheTime = 0;
  cachedLinks = null;
  linksCacheTime = 0;
}

export function getCachedStaff(): Staff[] | null {
  if (cachedStaff && (Date.now() - staffCacheTime < CACHE_TTL_MS)) {
    return cachedStaff;
  }
  return null;
}

export function getCachedStaffDepartmentLinks(): StaffDepartmentLink[] | null {
  if (cachedLinks && (Date.now() - linksCacheTime < CACHE_TTL_MS)) {
    return cachedLinks;
  }
  return null;
}

export function getCachedStaffDepartmentMap(): Map<string, string[]> | null {
  const staff = getCachedStaff();
  const links = getCachedStaffDepartmentLinks();
  if (!staff || !links) return null;

  const map = new Map<string, Set<string>>();
  staff.forEach(s => {
    if (!map.has(s.memberId)) map.set(s.memberId, new Set<string>());
    if (s.primaryDepartmentId) map.get(s.memberId)!.add(s.primaryDepartmentId);
  });
  links.forEach(link => {
    if (link.status === 'ACTIVE') {
      if (!map.has(link.memberId)) map.set(link.memberId, new Set<string>());
      map.get(link.memberId)!.add(link.departmentId);
    }
  });

  const resultMap = new Map<string, string[]>();
  map.forEach((deptSet, memberId) => {
    resultMap.set(memberId, Array.from(deptSet));
  });
  return resultMap;
}

export function getCachedDepartmentStaffCounts(options?: { activeOnly?: boolean }): Map<string, number> | null {
  const allStaff = getCachedStaff();
  const allLinks = getCachedStaffDepartmentLinks();
  if (!allStaff || !allLinks) return null;

  const activeOnly = options?.activeOnly ?? true;
  const counts = new Map<string, Set<string>>();

  allStaff.forEach(s => {
    if (activeOnly && s.status !== 'ACTIVE') return;
    if (s.primaryDepartmentId) {
      if (!counts.has(s.primaryDepartmentId)) {
        counts.set(s.primaryDepartmentId, new Set<string>());
      }
      counts.get(s.primaryDepartmentId)!.add(s.memberId);
    }
  });

  const activeStaffIds = new Set(allStaff.filter(s => !activeOnly || s.status === 'ACTIVE').map(s => s.memberId));
  allLinks.forEach(link => {
    if ((!activeOnly || link.status === 'ACTIVE') && activeStaffIds.has(link.memberId)) {
      if (!counts.has(link.departmentId)) {
        counts.set(link.departmentId, new Set<string>());
      }
      counts.get(link.departmentId)!.add(link.memberId);
    }
  });

  const resultMap = new Map<string, number>();
  counts.forEach((membersSet, deptId) => {
    resultMap.set(deptId, membersSet.size);
  });
  return resultMap;
}

export function getCachedGlobalStaffCounts(): { total: number; active: number; archived: number } | null {
  const staff = getCachedStaff();
  if (!staff) return null;
  let active = 0;
  let archived = 0;
  staff.forEach(s => {
    if (s.status === 'ACTIVE') active++;
    else archived++;
  });
  return { total: staff.length, active, archived };
}

/**
 * Retrieves all registered staff members with in-memory caching.
 */
export async function getAllStaff(forceRefresh = false): Promise<Staff[]> {
  if (!forceRefresh && cachedStaff && (Date.now() - staffCacheTime < CACHE_TTL_MS)) {
    return cachedStaff;
  }

  try {
    const snap = await getDocs(collection(db, 'staff'));
    const result = snap.docs.map(d => d.data() as Staff);
    cachedStaff = result;
    staffCacheTime = Date.now();
    return result;
  } catch (err) {
    console.error('Error fetching staff:', err);
    return cachedStaff || [];
  }
}

/**
 * Retrieves all staff-department links across the institution with caching.
 */
export async function getAllStaffDepartmentLinks(forceRefresh = false): Promise<StaffDepartmentLink[]> {
  if (!forceRefresh && cachedLinks && (Date.now() - linksCacheTime < CACHE_TTL_MS)) {
    return cachedLinks;
  }

  try {
    const snap = await getDocs(collection(db, 'staffDepartmentLinks'));
    const result = snap.docs.map(d => d.data() as StaffDepartmentLink);
    cachedLinks = result;
    linksCacheTime = Date.now();
    return result;
  } catch (err) {
    console.error('Error fetching staff department links:', err);
    return cachedLinks || [];
  }
}

/**
 * Retrieves a single staff member by immutable Member ID.
 */
export async function getStaffById(memberId: string): Promise<Staff | null> {
  // Check memory cache first
  if (cachedStaff && (Date.now() - staffCacheTime < CACHE_TTL_MS)) {
    const found = cachedStaff.find(s => s.memberId === memberId);
    if (found) return found;
  }

  try {
    const snap = await getDoc(doc(db, 'staff', memberId));
    if (snap.exists()) {
      return snap.data() as Staff;
    }
    return null;
  } catch (err) {
    console.error('Error fetching staff member:', err);
    return null;
  }
}

/**
 * Creates a new faculty member with an immutable, concurrency-safe Member ID.
 * Automatically links the member to their primary department.
 */
export async function createStaff(
  data: {
    staffName: string;
    initials: string;
    email?: string;
    phone?: string;
    phoneNumber?: string;
    subjectIds?: string[];
    designation: string;
    primaryDepartmentId: string;
  },
  adminUid: string
): Promise<Staff> {
  // 1. Concurrency-safe permanent Member ID generation (e.g. FAC-000101)
  const memberId = await generateNextMemberId();

  const nameClean = data.staffName.trim();
  const initClean = (data.initials || '').trim().toUpperCase();
  const displayName = initClean ? `${nameClean} (${initClean})` : nameClean;

  const rawPhone = (data.phoneNumber || data.phone || '').trim();
  if (rawPhone) {
    const phoneRes = validatePhoneNumber(rawPhone);
    if (!phoneRes.isValid) {
      throw new Error(phoneRes.error || 'Invalid phone number format.');
    }
  }

  const subjectIds = Array.isArray(data.subjectIds)
    ? Array.from(new Set(data.subjectIds.filter(Boolean)))
    : [];

  const staffRecord: Staff = {
    memberId,
    staffName: nameClean,
    initials: initClean,
    displayName,
    email: (data.email || '').trim().toLowerCase(),
    phone: rawPhone,
    phoneNumber: rawPhone,
    subjectIds,
    designation: data.designation.trim() || 'Assistant Professor',
    primaryDepartmentId: data.primaryDepartmentId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 2. Write global staff document
  await setDoc(doc(db, 'staff', memberId), staffRecord);

  // 3. Create primary department link with subjectIds
  const linkId = `${memberId}_${data.primaryDepartmentId}`;
  const linkRecord: StaffDepartmentLink = {
    linkId,
    memberId,
    departmentId: data.primaryDepartmentId,
    subjectIds,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'staffDepartmentLinks', linkId), linkRecord);
  invalidateStaffCache();

  await logAdminAction(adminUid, 'CREATE_STAFF', 'staff', memberId, staffRecord);
  return staffRecord;
}

/**
 * Updates editable staff fields. Member ID and createdAt are strictly immutable.
 */
export async function updateStaff(
  memberId: string,
  updates: Partial<Omit<Staff, 'memberId' | 'createdAt'>> & {
    phoneNumber?: string;
    subjectIds?: string[];
  },
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'staff', memberId);
  const existing = await getStaffById(memberId);
  if (!existing) throw new Error('Staff record not found');

  const nameClean = updates.staffName !== undefined ? updates.staffName.trim() : existing.staffName;
  const initClean = updates.initials !== undefined ? updates.initials.trim().toUpperCase() : existing.initials;
  const displayName = initClean ? `${nameClean} (${initClean})` : nameClean;

  const rawPhone = updates.phoneNumber !== undefined
    ? updates.phoneNumber.trim()
    : updates.phone !== undefined
    ? updates.phone.trim()
    : (existing.phoneNumber || existing.phone || '').trim();

  if (rawPhone) {
    const phoneRes = validatePhoneNumber(rawPhone);
    if (!phoneRes.isValid) {
      throw new Error(phoneRes.error || 'Invalid phone number format.');
    }
  }

  const subjectIds = updates.subjectIds !== undefined
    ? Array.from(new Set(updates.subjectIds.filter(Boolean)))
    : existing.subjectIds || [];

  const cleanUpdates: Record<string, any> = {
    ...updates,
    staffName: nameClean,
    initials: initClean,
    displayName,
    phone: rawPhone,
    phoneNumber: rawPhone,
    subjectIds,
    updatedAt: new Date().toISOString()
  };

  await updateDoc(ref, cleanUpdates);

  // Synchronize subjectIds to the primary department link
  const targetDeptId = updates.primaryDepartmentId || existing.primaryDepartmentId;
  if (targetDeptId) {
    const linkId = `${memberId}_${targetDeptId}`;
    const linkRef = doc(db, 'staffDepartmentLinks', linkId);
    const linkSnap = await getDoc(linkRef);
    if (linkSnap.exists()) {
      await updateDoc(linkRef, {
        subjectIds,
        updatedAt: new Date().toISOString()
      });
    } else {
      await setDoc(linkRef, {
        linkId,
        memberId,
        departmentId: targetDeptId,
        subjectIds,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  invalidateStaffCache();
  await logAdminAction(adminUid, 'UPDATE_STAFF', 'staff', memberId, cleanUpdates);
}

/**
 * Soft-Deactivation: Never deletes Firestore document.
 * Marks status as INACTIVE to permanently preserve historical timetable references.
 */
export async function archiveStaff(memberId: string, adminUid: string): Promise<void> {
  const ref = doc(db, 'staff', memberId);
  const now = new Date().toISOString();

  await updateDoc(ref, {
    status: 'INACTIVE',
    archivedAt: now,
    updatedAt: now
  });

  // Also deactivate all associated department links
  const linksSnap = await getDocs(query(collection(db, 'staffDepartmentLinks'), where('memberId', '==', memberId)));
  for (const linkDoc of linksSnap.docs) {
    await updateDoc(doc(db, 'staffDepartmentLinks', linkDoc.id), { status: 'INACTIVE' });
  }
  invalidateStaffCache();

  await logAdminAction(adminUid, 'ARCHIVE_STAFF', 'staff', memberId);
}

export interface StaffDeletionSafetyCheck {
  canDelete: boolean;
  blockingReasons: string[];
}

/**
 * Validates whether a staff member can be permanently deleted without breaking
 * referential integrity, active teaching assignments, or published timetable history.
 */
export async function checkStaffDeletionSafety(memberId: string): Promise<StaffDeletionSafetyCheck> {
  const blockingReasons: string[] = [];

  // 1. Check Active & Historical Teaching Assignments
  try {
    const asgnSnap = await getDocs(
      query(collection(db, 'teachingAssignments'), where('memberId', '==', memberId))
    );
    if (!asgnSnap.empty) {
      const activeCount = asgnSnap.docs.filter(d => (d.data() as any).status !== 'INACTIVE').length;
      blockingReasons.push(
        `Faculty member is referenced in ${asgnSnap.size} teaching assignment(s) (${activeCount} currently active). Please remove or reassign these teaching assignments first.`
      );
    }
  } catch (err) {
    console.error('Error checking teaching assignments during staff delete safety check:', err);
  }

  // 2. Check Draft & Working Timetables
  try {
    const ttSnap = await getDocs(collection(db, 'timetables'));
    let draftOccurrences = 0;
    const affectedClasses: string[] = [];
    ttSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (Array.isArray(data.grid)) {
        let hasMember = false;
        data.grid.forEach((day: any) => {
          if (Array.isArray(day)) {
            day.forEach((slot: any) => {
              if (slot && (slot.memberId === memberId || slot.assignedStaffId === memberId)) {
                draftOccurrences++;
                hasMember = true;
              }
            });
          }
        });
        if (hasMember) {
          affectedClasses.push(data.classId || docSnap.id);
        }
      }
    });
    if (draftOccurrences > 0) {
      blockingReasons.push(
        `Faculty member is scheduled in ${draftOccurrences} slot(s) across draft timetable(s) for class(es): ${affectedClasses.slice(0, 3).join(', ')}${affectedClasses.length > 3 ? '...' : ''}. Clear these slots or regenerate the timetables before deletion.`
      );
    }
  } catch (err) {
    console.error('Error checking draft timetables during staff delete safety check:', err);
  }

  // 3. Check Published Timetable Historical Snapshots
  try {
    const pubSnap = await getDocs(collection(db, 'publishedTimetables'));
    let pubOccurrences = 0;
    pubSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (Array.isArray(data.allocations)) {
        const found = data.allocations.some((slot: any) => slot && slot.memberId === memberId);
        if (found) pubOccurrences++;
      } else if (Array.isArray(data.grid)) {
        let found = false;
        data.grid.forEach((day: any) => {
          if (Array.isArray(day)) {
            day.forEach((slot: any) => {
              if (slot && slot.memberId === memberId) found = true;
            });
          }
        });
        if (found) pubOccurrences++;
      }
    });
    if (pubOccurrences > 0) {
      blockingReasons.push(
        `Faculty member is referenced in ${pubOccurrences} published historical timetable snapshot(s). Published timetables are immutable historical records. Deleting this member would invalidate academic history. Please use 'Deactivate' (Archive) instead of permanent deletion.`
      );
    }
  } catch (err) {
    console.error('Error checking published timetables during staff delete safety check:', err);
  }

  return {
    canDelete: blockingReasons.length === 0,
    blockingReasons
  };
}

/**
 * Permanently deletes a staff member and their associated department links from Firestore.
 * Strictly verifies referential integrity and blocks deletion if protected dependencies exist.
 */
export async function deleteStaff(memberId: string, adminUid: string): Promise<void> {
  const safety = await checkStaffDeletionSafety(memberId);
  if (!safety.canDelete) {
    const reasonText = safety.blockingReasons.join('\n• ');
    throw new Error(
      `Cannot delete staff member (${memberId}):\n• ${reasonText}`
    );
  }

  try {
    const batch = writeBatch(db);

    // 1. Queue deletion of associated department links
    const linksSnap = await getDocs(
      query(collection(db, 'staffDepartmentLinks'), where('memberId', '==', memberId))
    );
    linksSnap.docs.forEach(linkDoc => {
      batch.delete(doc(db, 'staffDepartmentLinks', linkDoc.id));
    });

    // 2. Queue deletion of canonical staff document
    batch.delete(doc(db, 'staff', memberId));

    // 3. Atomically commit all deletions
    await batch.commit();

    // 4. Invalidate caches and log audit
    invalidateStaffCache();
    await logAdminAction(adminUid, 'DELETE_STAFF', 'staff', memberId);
  } catch (err: any) {
    console.error('Error during staff deletion:', err);
    if (err?.code === 'permission-denied' || err?.message?.toLowerCase().includes('permissions')) {
      throw new Error(
        `Cloud Firestore permission-denied: The live security rules on project 'timetable-76d9f' disallow permanent deletion of /staff documents ('allow delete: if false;').\n\n` +
        `ROOT CAUSE:\n` +
        `The project's local firestore.rules has been updated with 'allow delete: if isAdmin();', but the live Cloud Firestore database is still running the old deployed rules.\n\n` +
        `PERMANENT FIX:\n` +
        `1. Open Firebase Console Rules: https://console.firebase.google.com/project/timetable-76d9f/firestore/rules\n` +
        `2. In match /staff/{memberId}, update to 'allow delete: if isAdmin();' (or paste the contents of your local firestore.rules).\n` +
        `3. Click 'Publish'.\n\n` +
        `Alternative: Use 'Deactivate Staff (Archive)' from the directory table to soft-archive this faculty member without requiring hard Firestore document deletion.`
      );
    }
    throw err;
  }
}

/**
 * Establishes an additional department link for cross-department teaching.
 */
export async function linkStaffToDepartment(
  memberId: string,
  departmentId: string,
  adminUid: string
): Promise<StaffDepartmentLink> {
  const linkId = `${memberId}_${departmentId}`;
  const linkRecord: StaffDepartmentLink = {
    linkId,
    memberId,
    departmentId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'staffDepartmentLinks', linkId), linkRecord);
  invalidateStaffCache();
  await logAdminAction(adminUid, 'LINK_STAFF_DEPARTMENT', 'staffDepartmentLinks', linkId);
  return linkRecord;
}

/**
 * Deactivates an additional department link without deleting historical references.
 */
export async function unlinkStaffFromDepartment(
  memberId: string,
  departmentId: string,
  adminUid: string
): Promise<void> {
  const linkId = `${memberId}_${departmentId}`;
  await updateDoc(doc(db, 'staffDepartmentLinks', linkId), { status: 'INACTIVE' });
  invalidateStaffCache();
  await logAdminAction(adminUid, 'UNLINK_STAFF_DEPARTMENT', 'staffDepartmentLinks', linkId);
}

// ============================================================================
// CANONICAL BUSINESS LOGIC & COUNT RESOLUTION
// ============================================================================

/**
 * Canonical helper: Resolves all unique Staff members belonging to a department.
 * A faculty member belongs to a department if:
 * 1. Their primaryDepartmentId matches the department, OR
 * 2. They have an ACTIVE link in staffDepartmentLinks for that department.
 * Deduplicated strictly by permanent Member ID.
 */
export async function getDepartmentStaff(
  departmentId: string,
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<Staff[]> {
  const [allStaff, allLinks] = await Promise.all([
    getAllStaff(options.forceRefresh),
    getAllStaffDepartmentLinks(options.forceRefresh)
  ]);

  const activeOnly = options.activeOnly !== false;

  // Set of member IDs linked via staffDepartmentLinks
  const linkedMemberIds = new Set<string>();
  allLinks.forEach(link => {
    if (link.departmentId === departmentId && (!activeOnly || link.status === 'ACTIVE')) {
      linkedMemberIds.add(link.memberId);
    }
  });

  const staffMap = new Map<string, Staff>();
  allStaff.forEach(s => {
    if (activeOnly && s.status !== 'ACTIVE') return;

    if (s.primaryDepartmentId === departmentId || linkedMemberIds.has(s.memberId)) {
      staffMap.set(s.memberId, s);
    }
  });

  return Array.from(staffMap.values());
}

/**
 * Backwards-compatible alias for getDepartmentStaff.
 */
export async function getStaffByDepartment(departmentId: string): Promise<Staff[]> {
  return getDepartmentStaff(departmentId, { activeOnly: true });
}

/**
 * Canonical calculation: Count of unique staff members in a specific department.
 */
export async function getDepartmentStaffCount(
  departmentId: string,
  options: { activeOnly?: boolean } = { activeOnly: true }
): Promise<number> {
  const members = await getDepartmentStaff(departmentId, options);
  return members.length;
}

/**
 * High-performance batch calculation:
 * Resolves the canonical unique staff count for ALL departments in a single pass.
 * Returns Map<departmentId, count>.
 */
export async function getAllDepartmentStaffCounts(
  options: { activeOnly?: boolean; forceRefresh?: boolean } = { activeOnly: true }
): Promise<Map<string, number>> {
  const [allStaff, allLinks] = await Promise.all([
    getAllStaff(options.forceRefresh),
    getAllStaffDepartmentLinks(options.forceRefresh)
  ]);

  const activeOnly = options.activeOnly !== false;
  const counts = new Map<string, Set<string>>();

  // 1. Index primary departments
  allStaff.forEach(s => {
    if (activeOnly && s.status !== 'ACTIVE') return;
    if (s.primaryDepartmentId) {
      if (!counts.has(s.primaryDepartmentId)) {
        counts.set(s.primaryDepartmentId, new Set<string>());
      }
      counts.get(s.primaryDepartmentId)!.add(s.memberId);
    }
  });

  // 2. Index active secondary links
  const activeStaffIds = new Set(allStaff.filter(s => !activeOnly || s.status === 'ACTIVE').map(s => s.memberId));
  allLinks.forEach(link => {
    if ((!activeOnly || link.status === 'ACTIVE') && activeStaffIds.has(link.memberId)) {
      if (!counts.has(link.departmentId)) {
        counts.set(link.departmentId, new Set<string>());
      }
      counts.get(link.departmentId)!.add(link.memberId);
    }
  });

  const resultMap = new Map<string, number>();
  counts.forEach((membersSet, deptId) => {
    resultMap.set(deptId, membersSet.size);
  });

  return resultMap;
}

/**
 * Canonical global staff counts:
 * Every individual faculty member counts ONCE globally, regardless of multi-department links.
 */
export async function getGlobalStaffCounts(forceRefresh = false): Promise<{
  total: number;
  active: number;
  archived: number;
}> {
  const allStaff = await getAllStaff(forceRefresh);
  let active = 0;
  let archived = 0;

  allStaff.forEach(s => {
    if (s.status === 'ACTIVE') active++;
    else archived++;
  });

  return {
    total: allStaff.length,
    active,
    archived
  };
}

/**
 * Returns all unique department IDs (primary + linked) associated with a staff member.
 */
export async function getStaffDepartmentIds(memberId: string, forceRefresh = false): Promise<string[]> {
  const [staffMember, allLinks] = await Promise.all([
    getStaffById(memberId),
    getAllStaffDepartmentLinks(forceRefresh)
  ]);

  const deptSet = new Set<string>();
  if (staffMember?.primaryDepartmentId) {
    deptSet.add(staffMember.primaryDepartmentId);
  }

  allLinks.forEach(link => {
    if (link.memberId === memberId && link.status === 'ACTIVE') {
      deptSet.add(link.departmentId);
    }
  });

  return Array.from(deptSet);
}

/**
 * High-performance batch map of all linked department IDs per faculty member.
 * Returns Map<memberId, string[]>.
 */
export async function getAllStaffDepartmentMap(forceRefresh = false): Promise<Map<string, string[]>> {
  const [allStaff, allLinks] = await Promise.all([
    getAllStaff(forceRefresh),
    getAllStaffDepartmentLinks(forceRefresh)
  ]);

  const map = new Map<string, Set<string>>();

  allStaff.forEach(s => {
    if (!map.has(s.memberId)) map.set(s.memberId, new Set<string>());
    if (s.primaryDepartmentId) map.get(s.memberId)!.add(s.primaryDepartmentId);
  });

  allLinks.forEach(link => {
    if (link.status === 'ACTIVE') {
      if (!map.has(link.memberId)) map.set(link.memberId, new Set<string>());
      map.get(link.memberId)!.add(link.departmentId);
    }
  });

  const resultMap = new Map<string, string[]>();
  map.forEach((deptSet, memberId) => {
    resultMap.set(memberId, Array.from(deptSet));
  });

  return resultMap;
}
