import { collection, doc, getDocs, getDoc, setDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ClassTimetableDraft, PublishedTimetable, TimetableSlot } from '../../types';
import { logAdminAction } from './auditService';

export async function saveDraft(draft: ClassTimetableDraft, adminUid: string): Promise<void> {
  const ref = doc(db, 'timetables', draft.classId);
  await setDoc(ref, {
    ...draft,
    updatedAt: new Date().toISOString()
  });
  await logAdminAction(adminUid, 'SAVE_DRAFT_TIMETABLE', 'timetables', draft.classId);
}

export async function getDraft(classId: string): Promise<ClassTimetableDraft | null> {
  try {
    const snap = await getDoc(doc(db, 'timetables', classId));
    if (snap.exists()) {
      return snap.data() as ClassTimetableDraft;
    }
    return null;
  } catch (err) {
    console.error('Error fetching timetable draft:', err);
    return null;
  }
}

/**
 * Builds O(1) college-wide busy slots map from ALL published timetables
 * Key: `${memberId}_${dayIdx}_${periodIdx}`
 */
export async function getGlobalBusySlots(academicYear: string, excludeClassId?: string): Promise<Map<string, TimetableSlot>> {
  const busyMap = new Map<string, TimetableSlot>();

  try {
    const q = query(
      collection(db, 'publishedTimetables'),
      where('academicYear', '==', academicYear)
    );
    const snap = await getDocs(q);

    // Group by classId to take only the latest version per class
    const latestVersions = new Map<string, PublishedTimetable>();
    snap.docs.forEach(d => {
      const item = d.data() as PublishedTimetable;
      if (excludeClassId && item.classId === excludeClassId) return;

      const current = latestVersions.get(item.classId);
      if (!current || item.versionNumber > current.versionNumber) {
        latestVersions.set(item.classId, item);
      }
    });

    latestVersions.forEach(tt => {
      if (Array.isArray(tt.allocations)) {
        tt.allocations.forEach(slot => {
          if (slot.memberId) {
            const key = `${slot.memberId}_${slot.dayIdx}_${slot.periodIdx}`;
            busyMap.set(key, slot);
          }
        });
      }
    });
  } catch (err) {
    console.warn('⚠️ Warning reading global busy slots:', err);
  }

  return busyMap;
}

export async function publishTimetable(
  data: {
    classId: string;
    classLabel: string;
    departmentId: string;
    academicYear: string;
    grid: (TimetableSlot | null)[][];
    totalHours: number;
  },
  adminUid: string
): Promise<PublishedTimetable> {
  // 1. Determine next version number for this class
  const existingQuery = query(
    collection(db, 'publishedTimetables'),
    where('classId', '==', data.classId)
  );
  const existingSnap = await getDocs(existingQuery);
  let nextVersion = 1;
  existingSnap.docs.forEach(d => {
    const v = d.data().versionNumber;
    if (typeof v === 'number' && v >= nextVersion) {
      nextVersion = v + 1;
    }
  });

  // Extract flat allocations list
  const allocations: TimetableSlot[] = [];
  data.grid.forEach(day => {
    day.forEach(slot => {
      if (slot) allocations.push(slot);
    });
  });

  const timetableId = `pub_${data.classId}_v${nextVersion}`;
  const publishedRecord: PublishedTimetable = {
    timetableId,
    versionNumber: nextVersion,
    classId: data.classId,
    classLabel: data.classLabel,
    departmentId: data.departmentId,
    academicYear: data.academicYear,
    grid: data.grid,
    allocations,
    totalHours: data.totalHours,
    publishedAt: new Date().toISOString(),
    publishedBy: adminUid
  };

  // 2. Write immutable published record
  await setDoc(doc(db, 'publishedTimetables', timetableId), publishedRecord);

  // 3. Update working draft state to PUBLISHED
  await setDoc(doc(db, 'timetables', data.classId), {
    classId: data.classId,
    departmentId: data.departmentId,
    academicYear: data.academicYear,
    grid: data.grid,
    totalAllocated: data.totalHours,
    status: 'PUBLISHED',
    updatedAt: new Date().toISOString()
  });

  await logAdminAction(adminUid, 'PUBLISH_TIMETABLE', 'publishedTimetables', timetableId, {
    classId: data.classId,
    versionNumber: nextVersion,
    totalHours: data.totalHours
  });

  invalidateTimetableCache();
  return publishedRecord;
}

// In-memory cache for fast responsive navigation
let cachedPublished: PublishedTimetable[] | null = null;
let publishedCacheTime = 0;
const CACHE_TTL_MS = 60000; // 60 seconds

export function invalidateTimetableCache() {
  cachedPublished = null;
  publishedCacheTime = 0;
}

export function getCachedPublishedTimetables(academicYear?: string): PublishedTimetable[] | null {
  if (cachedPublished && (Date.now() - publishedCacheTime < CACHE_TTL_MS)) {
    if (academicYear) {
      return cachedPublished.filter(t => t.academicYear === academicYear);
    }
    return cachedPublished;
  }
  return null;
}

export function getCachedPublishedTimetableStats(academicYear?: string): {
  totalPublishedVersions: number;
  uniqueClassesWithTimetable: number;
} | null {
  const published = getCachedPublishedTimetables(academicYear);
  if (!published) return null;
  const latestMap = new Map<string, PublishedTimetable>();
  published.forEach(tt => {
    const cur = latestMap.get(tt.classId);
    if (!cur || tt.versionNumber > cur.versionNumber) {
      latestMap.set(tt.classId, tt);
    }
  });
  return {
    totalPublishedVersions: published.length,
    uniqueClassesWithTimetable: latestMap.size
  };
}

export async function getPublishedTimetables(academicYear?: string, forceRefresh = false): Promise<PublishedTimetable[]> {
  if (!forceRefresh && cachedPublished && (Date.now() - publishedCacheTime < CACHE_TTL_MS)) {
    if (academicYear) {
      return cachedPublished.filter(t => t.academicYear === academicYear);
    }
    return cachedPublished;
  }

  try {
    let q = query(collection(db, 'publishedTimetables'));
    if (academicYear && (!cachedPublished || forceRefresh)) {
      q = query(collection(db, 'publishedTimetables'), where('academicYear', '==', academicYear));
    }
    const snap = await getDocs(q);
    const result = snap.docs.map(d => d.data() as PublishedTimetable);
    if (!academicYear) {
      cachedPublished = result;
      publishedCacheTime = Date.now();
    }
    return result;
  } catch (err) {
    console.error('Error fetching published timetables:', err);
    return cachedPublished ? getCachedPublishedTimetables(academicYear) || [] : [];
  }
}

/**
 * Canonical published timetable statistics:
 * Resolves unique classes that have a published timetable and extracts the latest version snapshot per class.
 */
export async function getPublishedTimetableStats(academicYear?: string): Promise<{
  totalPublishedVersions: number;
  uniqueClassesWithTimetable: number;
  latestSnapshots: PublishedTimetable[];
}> {
  const allPublished = await getPublishedTimetables(academicYear);

  const latestMap = new Map<string, PublishedTimetable>();
  allPublished.forEach(tt => {
    const cur = latestMap.get(tt.classId);
    if (!cur || tt.versionNumber > cur.versionNumber) {
      latestMap.set(tt.classId, tt);
    }
  });

  return {
    totalPublishedVersions: allPublished.length,
    uniqueClassesWithTimetable: latestMap.size,
    latestSnapshots: Array.from(latestMap.values())
  };
}

/**
 * Derives comprehensive staff schedule aggregated across ALL departments
 * strictly filtered by permanent `memberId`.
 */
export async function getStaffSchedule(
  memberId: string,
  academicYear: string,
  workingDaysCount = 6,
  periodsPerDay = 7
): Promise<{
  memberId: string;
  grid: (TimetableSlot | null)[][];
  totalHours: number;
  classesTaught: { classLabel: string; departmentId: string; subjectName: string; hours: number }[];
}> {
  const staffGrid: (TimetableSlot | null)[][] = Array.from({ length: workingDaysCount }, () =>
    Array(periodsPerDay).fill(null)
  );

  const classesMap = new Map<string, { classLabel: string; departmentId: string; subjectName: string; hours: number }>();
  let totalHours = 0;

  try {
    const allPublished = await getPublishedTimetables(academicYear);

    // Latest version per class
    const latestMap = new Map<string, PublishedTimetable>();
    allPublished.forEach(tt => {
      const cur = latestMap.get(tt.classId);
      if (!cur || tt.versionNumber > cur.versionNumber) {
        latestMap.set(tt.classId, tt);
      }
    });

    latestMap.forEach(tt => {
      if (Array.isArray(tt.allocations)) {
        tt.allocations.forEach(slot => {
          if (slot.memberId === memberId) {
            staffGrid[slot.dayIdx][slot.periodIdx] = slot;
            totalHours++;

            const mapKey = `${slot.classId}_${slot.subjectId}`;
            if (!classesMap.has(mapKey)) {
              classesMap.set(mapKey, {
                classLabel: slot.classLabel,
                departmentId: slot.departmentId,
                subjectName: slot.subjectName || slot.subjectCode,
                hours: 0
              });
            }
            classesMap.get(mapKey)!.hours++;
          }
        });
      }
    });
  } catch (err) {
    console.error('Error compiling staff schedule:', err);
  }

  return {
    memberId,
    grid: staffGrid,
    totalHours,
    classesTaught: Array.from(classesMap.values())
  };
}

