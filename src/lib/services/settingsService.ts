import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CollegeSettings } from '../../types';
import { logAdminAction } from './auditService';

export const DEFAULT_SETTINGS: CollegeSettings = {
  collegeName: 'SSM Institute of Engineering and Technology (Autonomous)',
  collegeShortName: 'SSMIET',
  address: 'Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  startTime: '09:00',
  endTime: '16:00',
  periodDurationMinutes: 50,
  periods: [
    { id: 'P1', name: 'P1', time: '09:00 - 09:50', isBreak: false },
    { id: 'P2', name: 'P2', time: '09:50 - 10:40', isBreak: false },
    { id: 'P3', name: 'P3', time: '10:40 - 11:30', isBreak: false },
    { id: 'BREAK', name: 'TEA BREAK', time: '11:30 - 11:50', isBreak: true },
    { id: 'P4', name: 'P4', time: '11:50 - 12:40', isBreak: false },
    { id: 'P5', name: 'P5', time: '12:40 - 01:30', isBreak: false },
    { id: 'LUNCH', name: 'LUNCH BREAK', time: '01:30 - 02:20', isBreak: true, isLunch: true },
    { id: 'P6', name: 'P6', time: '02:20 - 03:10', isBreak: false },
    { id: 'P7', name: 'P7', time: '03:10 - 04:00', isBreak: false }
  ]
};

let cachedSettings: CollegeSettings | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

export function invalidateSettingsCache() {
  cachedSettings = null;
  cacheTime = 0;
}

export async function getCollegeSettings(forceRefresh = false): Promise<CollegeSettings> {
  if (!forceRefresh && cachedSettings && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return cachedSettings;
  }

  try {
    const snap = await getDoc(doc(db, 'collegeSettings', 'default'));
    if (snap.exists()) {
      const data = snap.data() as CollegeSettings;
      cachedSettings = data;
      cacheTime = Date.now();
      return data;
    }
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Error fetching college settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function updateCollegeSettings(settings: Partial<CollegeSettings>, adminUid: string): Promise<boolean> {
  try {
    const ref = doc(db, 'collegeSettings', 'default');
    await setDoc(ref, {
      ...settings,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid
    }, { merge: true });

    invalidateSettingsCache();
    await logAdminAction(adminUid, 'UPDATE_SETTINGS', 'collegeSettings', 'default', settings);
    return true;
  } catch (err) {
    console.error('Error updating college settings:', err);
    return false;
  }
}
