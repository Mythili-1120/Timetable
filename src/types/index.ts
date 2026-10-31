export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface PeriodDefinition {
  id: string;
  name: string;
  time: string;
  isBreak: boolean;
  isLunch?: boolean;
}

export interface CollegeSettings {
  collegeName: string;
  collegeShortName: string;
  address: string;
  workingDays: string[];
  startTime: string;
  endTime: string;
  periodDurationMinutes: number;
  periods: PeriodDefinition[];
  updatedAt?: any;
  updatedBy?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'UNAUTHORIZED';
  createdAt?: any;
  lastLoginAt?: any;
}

export interface Department {
  departmentId: string;
  code: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface Staff {
  memberId: string; // Permanent Unique ID e.g. FAC-000101
  staffName: string;
  initials: string;
  displayName: string;
  email: string;
  phone: string;
  designation: string;
  primaryDepartmentId: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface StaffDepartmentLink {
  linkId: string;
  memberId: string;
  departmentId: string;
  subjectIds?: string[]; // IDs of subjects this staff member is authorized/mapped to teach in this department
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt?: string;
}

export interface StaffSubjectMapping {
  memberId: string;
  departmentId: string;
  subjectId: string;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt?: string;
}

export interface SubjectResolutionResult {
  status: 'SINGLE_MATCH' | 'MULTIPLE_MATCHES' | 'NO_MATCH' | 'ALREADY_ASSIGNED';
  classSection: ClassSection;
  staff: Staff;
  matchingSubjects: Subject[];
  curriculumSubjects: Subject[];
  selectedSubject?: Subject;
  existingAssignment?: TeachingAssignment;
  message?: string;
}

export interface Subject {
  subjectId: string;
  code: string;
  name: string;
  type: 'Theory' | 'Lab';
  weeklyHours: number;
  labBlockHours?: number; // e.g. 2, 3, or 4
  departmentId: string;
  academicYear: string;
  yearOfStudy?: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
  semester?: string; // e.g. 'Semester 1', 'Semester 2', etc.
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ClassSection {
  classId: string; // e.g. dept-aids_2025-2026_1st-Year_A
  departmentId: string;
  academicYear: string;
  yearOfStudy: '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
  section: string;
  strength?: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface TeachingAssignment {
  assignmentId: string;
  memberId: string;
  departmentId: string;
  subjectId: string;
  classId: string;
  academicYear?: string;
  semester?: string; // e.g. 'Semester 1', 'Semester 2'
  weeklyHours: number;
  type: 'Theory' | 'Lab';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  previousMemberId?: string; // Tracks previous faculty Member ID upon reassignment
  reassignedAt?: string; // Timestamp of latest staff reassignment
}

export interface ReassignStaffInput {
  assignmentId: string;
  newMemberId: string;
}

export interface TimetableSlot {
  dayIdx: number;
  periodIdx: number;
  memberId: string;
  staffName: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  type: 'Theory' | 'Lab';
  departmentId: string;
  classId: string;
  classLabel: string;
}

export interface ClassTimetableDraft {
  classId: string;
  departmentId: string;
  academicYear: string;
  grid: (TimetableSlot | null)[][];
  totalAllocated: number;
  status: 'DRAFT' | 'GENERATED' | 'PUBLISHED';
  updatedAt: string;
}

export interface PublishedTimetable {
  timetableId: string; // e.g. pub_classId_v1
  versionNumber: number;
  classId: string;
  classLabel: string;
  departmentId: string;
  academicYear: string;
  grid: (TimetableSlot | null)[][];
  allocations: TimetableSlot[];
  totalHours: number;
  publishedAt: string;
  publishedBy: string;
}

export interface AuditLog {
  logId: string;
  adminUid: string;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, any>;
  timestamp: string;
}

