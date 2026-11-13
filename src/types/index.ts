export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface PeriodDefinition {
  id: string;
  name: string;
  time: string;
  isBreak: boolean;
  isLunch?: boolean;
  startTime?: string;
  endTime?: string;
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
  phoneNumber?: string; // Canonical alias for phone number
  subjectIds?: string[]; // Canonical array of Subject Master IDs this faculty is eligible to teach
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

export type UndergraduateYear = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';

export interface SemesterDefinition {
  name: string; // e.g. 'Semester 1'
  number: number; // e.g. 1
  label: string; // e.g. 'Semester 1'
}

export const YEAR_SEMESTERS: Record<UndergraduateYear, SemesterDefinition[]> = {
  '1st Year': [
    { name: 'Semester 1', number: 1, label: 'Semester 1' },
    { name: 'Semester 2', number: 2, label: 'Semester 2' }
  ],
  '2nd Year': [
    { name: 'Semester 3', number: 3, label: 'Semester 3' },
    { name: 'Semester 4', number: 4, label: 'Semester 4' }
  ],
  '3rd Year': [
    { name: 'Semester 5', number: 5, label: 'Semester 5' },
    { name: 'Semester 6', number: 6, label: 'Semester 6' }
  ],
  '4th Year': [
    { name: 'Semester 7', number: 7, label: 'Semester 7' },
    { name: 'Semester 8', number: 8, label: 'Semester 8' }
  ]
};

export interface Subject {
  subjectId: string;
  code: string;
  name: string;
  type: 'Theory' | 'Lab';
  weeklyHours: number;
  labBlockHours?: number; // e.g. 2, 3, or 4
  departmentId: string;
  academicYear: string;
  yearOfStudy?: UndergraduateYear;
  semester?: string; // e.g. 'Semester 1', 'Semester 2', etc.
  semesterNumber?: number; // Canonical semester number: 1 to 8
  requiresSemesterReview?: boolean; // Set when an existing subject has no semester assigned
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

export type AssignmentValidationErrorCode =
  | 'SECTION_NOT_SELECTED'
  | 'SECTION_NOT_FOUND'
  | 'SECTION_DEPARTMENT_MISMATCH'
  | 'SECTION_ACADEMIC_YEAR_MISMATCH'
  | 'SUBJECT_ASSIGNMENT_MISSING'
  | 'STAFF_INACTIVE'
  | 'STAFF_SUBJECT_INELIGIBLE'
  | 'ASSIGNMENT_DATA_LOAD_FAILED'
  | 'ASSIGNMENT_DATA_AMBIGUOUS'
  | 'NO_CURRICULUM_SUBJECTS'
  | 'MISSING_ASSIGNMENT' // backward compatibility alias
  | 'INACTIVE_STAFF' // backward compatibility alias
  | 'INELIGIBLE_STAFF' // backward compatibility alias
  | 'SCOPE_MISMATCH' // backward compatibility alias
  | 'CLASS_NOT_FOUND'; // backward compatibility alias

export interface StructuredValidationError {
  errorCode: AssignmentValidationErrorCode;
  subjectId?: string;
  subjectName?: string;
  departmentId: string;
  classId: string;
  memberId?: string;
  staffName?: string;
  message: string;
  recommendedAction: string;
}

export interface SubjectStaffValidationResult {
  isValid: boolean;
  canGenerate: boolean;
  totalRequiredHours: number;
  curriculumSubjects: Subject[];
  assignedSubjects: {
    subject: Subject;
    assignment: TeachingAssignment;
    staff: Staff;
  }[];
  missingStaffSubjects: Subject[];
  blockingErrors: string[];
  structuredErrors: StructuredValidationError[];
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
  gridJson?: string;
  allocations?: TimetableSlot[];
  totalAllocated: number;
  status: 'DRAFT' | 'GENERATED' | 'PUBLISHED';
  updatedAt: string;
  generationMetadata?: {
    variantIndex?: number;
    totalCandidates?: number;
    qualityScore?: number;
    generatedAt?: string;
  };
}

export interface PublishedTimetable {
  timetableId: string; // e.g. pub_classId_v1
  versionNumber: number;
  classId: string;
  classLabel: string;
  departmentId: string;
  academicYear: string;
  grid: (TimetableSlot | null)[][];
  gridJson?: string;
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

