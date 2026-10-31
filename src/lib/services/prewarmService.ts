import { getAllDepartments } from './departmentService';
import { getAllStaff, getAllStaffDepartmentLinks } from './staffService';
import { getAllSubjects } from './subjectService';
import { getAllClasses } from './classService';
import { getAssignments } from './assignmentService';
import { getCollegeSettings } from './settingsService';

let prewarmStarted = false;

/**
 * Pre-warms in-memory cache for smooth, instant page transitions.
 * Runs non-blocking background queries.
 */
export async function prewarmCoreData(force = false): Promise<void> {
  if (prewarmStarted && !force) return;
  prewarmStarted = true;

  try {
    await Promise.all([
      getAllDepartments(),
      getAllStaff(),
      getAllStaffDepartmentLinks(),
      getAllSubjects(),
      getAllClasses(),
      getAssignments(),
      getCollegeSettings()
    ]);
  } catch (err) {
    // Non-blocking background catch
    console.debug('Background cache prewarm completed with non-fatal status.');
  }
}
