import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Staff, StaffDepartmentLink } from '../../types';
import { generateNextMemberId } from './idService';
import { logAdminAction } from './auditService';

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

  const staffRecord: Staff = {
    memberId,
    staffName: nameClean,
    initials: initClean,
    displayName,
    email: (data.email || '').trim().toLowerCase(),
    phone: (data.phone || '').trim(),
    designation: data.designation.trim() || 'Assistant Professor',
    primaryDepartmentId: data.primaryDepartmentId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 2. Write global staff document
  await setDoc(doc(db, 'staff', memberId), staffRecord);

  // 3. Create primary department link
  const linkId = `${memberId}_${data.primaryDepartmentId}`;
  const linkRecord: StaffDepartmentLink = {
    linkId,
    memberId,
    departmentId: data.primaryDepartmentId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
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
  updates: Partial<Omit<Staff, 'memberId' | 'createdAt'>>,
  adminUid: string
): Promise<void> {
  const ref = doc(db, 'staff', memberId);
  const existing = await getStaffById(memberId);
  if (!existing) throw new Error('Staff record not found');

  const nameClean = updates.staffName !== undefined ? updates.staffName.trim() : existing.staffName;
  const initClean = updates.initials !== undefined ? updates.initials.trim().toUpperCase() : existing.initials;
  const displayName = initClean ? `${nameClean} (${initClean})` : nameClean;

  const cleanUpdates = {
    ...updates,
    staffName: nameClean,
    initials: initClean,
    displayName,
    updatedAt: new Date().toISOString()
  };

  await updateDoc(ref, cleanUpdates);
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
