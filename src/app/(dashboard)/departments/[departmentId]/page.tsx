'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getDepartmentById, getCachedDepartments, getAllDepartments } from '../../../../lib/services/departmentService';
import {
  getAllStaff,
  getCachedStaff,
  getStaffByDepartment,
  createStaff,
  updateStaff,
  archiveStaff,
  deleteStaff,
  linkStaffToDepartment,
  getCachedStaffDepartmentMap
} from '../../../../lib/services/staffService';
import {
  getAllSubjects,
  getCachedSubjects,
  createSubject,
  updateSubject,
  archiveSubject,
  getSemestersForYear,
  getSemesterNumber,
  formatSemesterName,
  getYearForSemester,
  findDuplicateSubject,
  YEAR_SEMESTERS
} from '../../../../lib/services/subjectService';
import {
  getAllClasses,
  getCachedClasses,
  createClass,
  updateClass,
  archiveClass
} from '../../../../lib/services/classService';
import {
  getAssignments,
  getCachedAssignments,
  createAssignment,
  deleteAssignment,
  reassignStaff,
  copyAssignmentsBetweenClasses
} from '../../../../lib/services/assignmentService';
import {
  getPublishedTimetables,
  getCachedPublishedTimetables,
  getDraft
} from '../../../../lib/services/timetableService';
import {
  Department,
  Staff,
  Subject,
  ClassSection,
  TeachingAssignment,
  PublishedTimetable,
  UndergraduateYear,
  SemesterDefinition
} from '../../../../types';
import { useAuth } from '../../../../lib/context/AuthContext';
import DepartmentIcon from '../../../../components/DepartmentIcon';
import {
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  Briefcase,
  ArrowLeft,
  Plus,
  Search,
  Edit2,
  Archive,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  Trash2,
  Cpu,
  CalendarRange,
  Layers,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  ArrowRightLeft,
  Check,
  Lock,
  Sparkles,
  ArrowRight,
  Phone,
  Mail,
  User,
  Eye,
  X,
  ExternalLink,
  AlertTriangle,
  Copy,
  Clock,
  Info
} from 'lucide-react';

const UNDERGRADUATE_YEARS: ('1st Year' | '2nd Year' | '3rd Year' | '4th Year')[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year'
];

export default function DepartmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = typeof params.departmentId === 'string' ? params.departmentId : '';
  const { user } = useAuth();

  // Instant SWR memory cache resolution
  const cachedDepts = getCachedDepartments();
  const initialDept = cachedDepts ? cachedDepts.find(d => d.departmentId === departmentId) || null : null;
  const initialStaff = getCachedStaff() || [];
  const initialSubjs = getCachedSubjects(departmentId) || [];
  const initialClasses = getCachedClasses(departmentId) || [];
  const initialAsgns = getCachedAssignments({ departmentId }) || [];
  const initialPub = getCachedPublishedTimetables('2025–2026') || [];

  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'subjects' | 'years' | 'assignments'>('overview');
  const [loading, setLoading] = useState(() => !initialDept);

  // Master Data States
  const [department, setDepartment] = useState<Department | null>(() => initialDept);
  const [allDepartments, setAllDepartments] = useState<Department[]>(() => cachedDepts || []);
  const [deptStaff, setDeptStaff] = useState<Staff[]>(() => {
    if (!initialDept || initialStaff.length === 0) return [];
    const deptMap = getCachedStaffDepartmentMap();
    return initialStaff.filter(s => {
      const depts = deptMap ? deptMap.get(s.memberId) || [] : (s.primaryDepartmentId ? [s.primaryDepartmentId] : []);
      return depts.includes(departmentId) || s.primaryDepartmentId === departmentId;
    });
  });
  const [allCollegeStaff, setAllCollegeStaff] = useState<Staff[]>(() => initialStaff);
  const [subjects, setSubjects] = useState<Subject[]>(() => initialSubjs);
  const [allCollegeSubjects, setAllCollegeSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>(() => initialClasses);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>(() => initialAsgns);
  const [publishedTimetables, setPublishedTimetables] = useState<PublishedTimetable[]>(() => initialPub);
  const [draftStatusMap, setDraftStatusMap] = useState<Map<string, string>>(new Map());

  // Year-wise and Semester-wise Subjects drilldown state
  const [selectedSubjectYear, setSelectedSubjectYear] = useState<UndergraduateYear | null>(null);
  const [selectedSubjectSemester, setSelectedSubjectSemester] = useState<string>('Semester 1');
  const [selectedSemesterTab, setSelectedSemesterTab] = useState<string>('Semester 1');

  // Staff Profile Popup modal state (Phase 3)
  const [selectedProfileStaff, setSelectedProfileStaff] = useState<Staff | null>(null);

  // Section-wise Timetable Setup Modal state (Workstream B2)
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupSelectedYear, setSetupSelectedYear] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [setupSelectedClassId, setSetupSelectedClassId] = useState('');

  // Search & Filters
  const [staffSearch, setStaffSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>('ALL');
  const [assignmentSemesterFilter, setAssignmentSemesterFilter] = useState<string>('ALL');
  const [assignSemester, setAssignSemester] = useState<string>('Semester 1');
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTargetAsgn, setReassignTargetAsgn] = useState<TeachingAssignment | null>(null);
  const [reassignNewMemberId, setReassignNewMemberId] = useState('');

  // Modal Dialog States
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffAddMode, setStaffAddMode] = useState<'new' | 'link'>('new');
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffInitials, setStaffInitials] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffDesignation, setStaffDesignation] = useState('');
  const [selectedExistingStaffId, setSelectedExistingStaffId] = useState('');

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjCode, setSubjCode] = useState('');
  const [subjName, setSubjName] = useState('');
  const [subjType, setSubjType] = useState<'Theory' | 'Lab'>('Theory');
  const [subjHours, setSubjHours] = useState(4);
  const [subjLabBlock, setSubjLabBlock] = useState(4);
  const [subjYearOfStudy, setSubjYearOfStudy] = useState<UndergraduateYear>('1st Year');
  const [subjSemester, setSubjSemester] = useState<string>('Semester 1');
  const [subjAllowChangeSemester, setSubjAllowChangeSemester] = useState<boolean>(false);

  // Academic Years & Sections Modal (Phase 5: Student Strength completely eliminated)
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [secYear, setSecYear] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [secName, setSecName] = useState('A');

  // Teaching Assignment Modal (Phase 6)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignSubjId, setAssignSubjId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignHours, setAssignHours] = useState(4);
  const [showCrossDeptStaff, setShowCrossDeptStaff] = useState(false);
  const [autoMatchInfo, setAutoMatchInfo] = useState<{
    type: 'STAFF' | 'SUBJECT' | 'NONE';
    message: string;
    count?: number;
  } | null>(null);

  // Common UI State
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadAll = async (forceRefresh = false) => {
    if (!departmentId) return;
    if (!department && !getCachedDepartments()) {
      setLoading(true);
    }
    try {
      const [dept, allDepts, dStaff, allSt, subjs, allSubjs, cls, asgns, pub] = await Promise.all([
        getDepartmentById(departmentId),
        getAllDepartments(forceRefresh),
        getStaffByDepartment(departmentId),
        getAllStaff(forceRefresh),
        getAllSubjects(departmentId, forceRefresh),
        getAllSubjects(undefined, forceRefresh),
        getAllClasses(departmentId, undefined, forceRefresh),
        getAssignments({ departmentId }, forceRefresh),
        getPublishedTimetables('2025–2026', forceRefresh)
      ]);

      setDepartment(dept);
      setAllDepartments(allDepts);

      // Include any staff whose primary department is this department
      const combinedStaffMap = new Map<string, Staff>();
      dStaff.forEach(s => combinedStaffMap.set(s.memberId, s));
      allSt.filter(s => s.primaryDepartmentId === departmentId).forEach(s => combinedStaffMap.set(s.memberId, s));
      setDeptStaff(Array.from(combinedStaffMap.values()));

      setAllCollegeStaff(allSt);
      setSubjects(subjs);
      setAllCollegeSubjects(allSubjs);
      setClasses(cls);
      setAssignments(asgns);
      setPublishedTimetables(pub);

      // Check draft states for department classes in parallel
      const draftMap = new Map<string, string>();
      await Promise.all(
        cls.map(async (c) => {
          const draft = await getDraft(c.classId);
          if (draft && draft.status) {
            draftMap.set(c.classId, draft.status);
          }
        })
      );
      setDraftStatusMap(draftMap);

      if (cls.length > 0) {
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const classIdParam = urlParams?.get('classId');
        const defaultClass = (classIdParam && cls.some(c => c.classId === classIdParam)) ? classIdParam : cls[0].classId;
        if (!assignClassId || classIdParam) setAssignClassId(defaultClass);
        if (classIdParam) setAssignmentClassFilter(classIdParam);

        if (!setupSelectedClassId) {
          const firstYearCls = cls.find(c => c.yearOfStudy === setupSelectedYear) || cls[0];
          setSetupSelectedClassId(firstYearCls.classId);
        }
      }
      if (subjs.length > 0) {
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const subjIdParam = urlParams?.get('subjectId');
        const tabParam = urlParams?.get('tab');
        const targetSubj = (subjIdParam && subjs.find(s => s.subjectId === subjIdParam)) || subjs[0];
        if (!assignSubjId || subjIdParam) {
          setAssignSubjId(targetSubj.subjectId);
          setAssignHours(targetSubj.weeklyHours || 4);
        }

        // Select active faculty member if not already selected
        const activeFaculty = dStaff.filter(s => s.status === 'ACTIVE');
        if (activeFaculty.length > 0 && !assignMemberId) {
          setAssignMemberId(activeFaculty[0].memberId);
        }
        setAutoMatchInfo(null);

        if (tabParam === 'assignments' && subjIdParam) {
          setAssignModalOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Failed to load department workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  // Parse URL deep-link query params on client mount (e.g. from Timetable Generator)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const classIdParam = urlParams.get('classId');
    const subjectIdParam = urlParams.get('subjectId');

    if (tabParam === 'assignments' || tabParam === 'staff' || tabParam === 'subjects' || tabParam === 'years') {
      setActiveTab(tabParam as any);
    }
    if (classIdParam) {
      setAssignmentClassFilter(classIdParam);
      setAssignClassId(classIdParam);
    }
    if (subjectIdParam) {
      setAssignSubjId(subjectIdParam);
      if (tabParam === 'assignments') {
        setAssignModalOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [departmentId]);

  // Sync section selector when setup year changes in generator modal
  useEffect(() => {
    const yearClasses = classes.filter(c => c.yearOfStudy === setupSelectedYear);
    if (yearClasses.length > 0) {
      setSetupSelectedClassId(yearClasses[0].classId);
    } else {
      setSetupSelectedClassId('');
    }
  }, [setupSelectedYear, classes]);

  // Helper: Section Timetable Status
  const getSectionTimetableStatus = (classId: string): 'LOCKED' | 'DRAFT' | 'NOT_GENERATED' => {
    const isLocked = publishedTimetables.some(p => p.classId === classId);
    if (isLocked) return 'LOCKED';
    const draftStatus = draftStatusMap.get(classId);
    if (draftStatus === 'GENERATED' || draftStatus === 'DRAFT') return 'DRAFT';
    return 'NOT_GENERATED';
  };

  // Helper: Academic Year Progress Status
  const getYearProgress = (year: '1st Year' | '2nd Year' | '3rd Year' | '4th Year') => {
    const yearClasses = classes.filter(c => c.yearOfStudy === year);
    if (yearClasses.length === 0) return { status: 'NO_SECTIONS', text: 'No Sections', lockedCount: 0, total: 0 };

    const lockedCount = yearClasses.filter(c => getSectionTimetableStatus(c.classId) === 'LOCKED').length;
    const draftCount = yearClasses.filter(c => getSectionTimetableStatus(c.classId) === 'DRAFT').length;

    if (lockedCount === yearClasses.length) {
      return { status: 'COMPLETED', text: 'Completed', lockedCount, total: yearClasses.length };
    }
    if (lockedCount > 0 || draftCount > 0) {
      return { status: 'IN_PROGRESS', text: `In Progress (${lockedCount} of ${yearClasses.length} Locked)`, lockedCount, total: yearClasses.length };
    }
    return { status: 'NOT_STARTED', text: 'Not Started', lockedCount: 0, total: yearClasses.length };
  };

  // -------------------------------------------------------------
  // STAFF HANDLERS (Create / Link / Edit / Archive / Delete)
  // -------------------------------------------------------------
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setModalError(null);

    try {
      if (editingStaff) {
        await updateStaff(
          editingStaff.memberId,
          {
            staffName: staffName.trim(),
            initials: staffInitials.trim().toUpperCase(),
            email: staffEmail.trim().toLowerCase(),
            phone: staffPhone.trim(),
            designation: staffDesignation.trim()
          },
          user.uid
        );
      } else if (staffAddMode === 'new') {
        if (!staffName.trim()) {
          setModalError('Faculty name is required.');
          setSaving(false);
          return;
        }
        await createStaff(
          {
            staffName: staffName.trim(),
            initials: staffInitials.trim().toUpperCase(),
            email: staffEmail.trim().toLowerCase(),
            phone: staffPhone.trim(),
            designation: staffDesignation.trim(),
            primaryDepartmentId: departmentId
          },
          user.uid
        );
      } else {
        // Link existing faculty member
        if (!selectedExistingStaffId) {
          setModalError('Please select a faculty member to link.');
          setSaving(false);
          return;
        }
        await linkStaffToDepartment(selectedExistingStaffId, departmentId, user.uid);
      }

      setStaffModalOpen(false);
      setEditingStaff(null);
      setStaffName('');
      setStaffInitials('');
      setStaffEmail('');
      setStaffPhone('');
      setStaffDesignation('');
      setSelectedExistingStaffId('');
      await loadAll(true);
    } catch (err: any) {
      console.error('Error saving staff member:', err);
      setModalError(err?.message || 'Failed to save staff record.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStaffStatus = async (member: Staff) => {
    if (!user) return;
    try {
      if (member.status === 'ACTIVE') {
        if (confirm(`Deactivate ${member.displayName} (${member.memberId})? Historical timetables will remain intact.`)) {
          await archiveStaff(member.memberId, user.uid);
          await loadAll(true);
        }
      } else {
        await updateStaff(member.memberId, { status: 'ACTIVE' }, user.uid);
        await loadAll(true);
      }
    } catch (err: any) {
      alert(`Error updating staff: ${err?.message || 'Permission denied'}`);
    }
  };

  const handleDeleteStaff = async (member: Staff) => {
    if (!user) return;
    if (
      !confirm(
        `Permanently delete faculty member ${member.displayName} (${member.memberId})?\n\nThis will remove their profile and all department links from Cloud Firestore. If active teaching assignments, draft slots, or published timetables exist, deletion will be blocked to protect institutional academic records.`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await deleteStaff(member.memberId, user.uid);
      setSelectedProfileStaff(null);
      await loadAll(true);
      alert(`Successfully deleted faculty member ${member.displayName} (${member.memberId}).`);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete faculty member. Permission denied.');
    } finally {
      setSaving(false);
    }
  };

  const openEditStaffModal = (member: Staff) => {
    setEditingStaff(member);
    setStaffAddMode('new');
    setStaffName(member.staffName);
    setStaffInitials(member.initials || '');
    setStaffEmail(member.email || '');
    setStaffPhone(member.phoneNumber || member.phone || '');
    setStaffDesignation(member.designation || '');
    setModalError(null);
    setStaffModalOpen(true);
  };

  const openAddStaffModal = () => {
    setEditingStaff(null);
    setStaffAddMode('new');
    setStaffName('');
    setStaffInitials('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffDesignation('');
    setModalError(null);
    setStaffModalOpen(true);
  };

  // -------------------------------------------------------------
  // SUBJECT HANDLERS (Create / Edit / Archive / Quick Assign)
  // -------------------------------------------------------------
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!subjCode.trim() || !subjName.trim()) {
      setModalError('Subject code and title are required.');
      return;
    }

    const cleanCode = subjCode.trim().toUpperCase();
    const targetSemName = formatSemesterName(subjSemester);
    const targetSemNum = getSemesterNumber(subjSemester);

    // Required uniqueness check within applicable Department + Year + Semester scope
    const duplicate = findDuplicateSubject(
      subjects,
      cleanCode,
      departmentId,
      subjYearOfStudy,
      subjSemester,
      editingSubject?.subjectId
    );
    if (duplicate) {
      setModalError(
        `Course code "${cleanCode}" already exists in ${subjYearOfStudy} — ${targetSemName} (${duplicate.name}). Please use a unique course code or edit the existing course.`
      );
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      if (editingSubject) {
        await updateSubject(
          editingSubject.subjectId,
          {
            code: cleanCode,
            name: subjName.trim(),
            type: subjType,
            weeklyHours: Number(subjHours),
            ...(subjType === 'Lab' ? { labBlockHours: Number(subjLabBlock) || 4 } : {}),
            ...(subjYearOfStudy ? { yearOfStudy: subjYearOfStudy } : {}),
            semester: targetSemName,
            semesterNumber: targetSemNum,
            requiresSemesterReview: false
          },
          user.uid
        );
      } else {
        await createSubject(
          {
            code: cleanCode,
            name: subjName.trim(),
            type: subjType,
            weeklyHours: Number(subjHours),
            ...(subjType === 'Lab' ? { labBlockHours: Number(subjLabBlock) || 4 } : {}),
            departmentId,
            academicYear: '2025–2026',
            yearOfStudy: subjYearOfStudy,
            semester: targetSemName,
            semesterNumber: targetSemNum
          },
          user.uid
        );
      }

      setSubjectModalOpen(false);
      setEditingSubject(null);
      setSubjCode('');
      setSubjName('');
      setSubjHours(4);
      setSubjLabBlock(4);
      await loadAll(true);
    } catch (err: any) {
      console.error('Error saving subject:', err);
      setModalError(err?.message || 'Failed to save subject.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAssignSemester = async (subj: Subject, targetSemester: string) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateSubject(
        subj.subjectId,
        {
          semester: formatSemesterName(targetSemester),
          semesterNumber: getSemesterNumber(targetSemester),
          requiresSemesterReview: false
        },
        user.uid
      );
      await loadAll(true);
    } catch (err: any) {
      console.error('Error assigning semester:', err);
      alert(`Failed to assign semester: ${err?.message || 'Permission denied'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubjectStatus = async (s: Subject) => {
    if (!user) return;
    try {
      if (s.status === 'ACTIVE') {
        if (confirm(`Archive subject ${s.name} (${s.code})? Historical timetable references remain intact.`)) {
          await archiveSubject(s.subjectId, user.uid);
          await loadAll(true);
        }
      } else {
        await updateSubject(s.subjectId, { status: 'ACTIVE' }, user.uid);
        await loadAll(true);
      }
    } catch (err: any) {
      alert(`Error updating subject: ${err?.message || 'Permission denied'}`);
    }
  };

  // -------------------------------------------------------------
  // CLASS / SECTION HANDLERS (Create / Archive) — NO STRENGTH
  // -------------------------------------------------------------
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!secName.trim()) {
      setModalError('Section letter/code is required.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await createClass(
        {
          departmentId,
          academicYear: '2025–2026',
          yearOfStudy: secYear,
          section: secName.trim().toUpperCase()
        },
        user.uid
      );

      setSectionModalOpen(false);
      setSecName('A');
      await loadAll(true);
    } catch (err: any) {
      console.error('Error saving section:', err);
      setModalError(err?.message || 'Failed to create section.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClassStatus = async (cls: ClassSection) => {
    if (!user) return;
    try {
      if (cls.status === 'ACTIVE') {
        if (confirm(`Archive Section ${cls.section} (${cls.yearOfStudy})? Historical timetables will remain intact.`)) {
          await archiveClass(cls.classId, user.uid);
          await loadAll(true);
        }
      } else {
        await updateClass(cls.classId, { status: 'ACTIVE' }, user.uid);
        await loadAll(true);
      }
    } catch (err: any) {
      alert(`Error updating class: ${err?.message || 'Permission denied'}`);
    }
  };

  // -------------------------------------------------------------
  // INTELLIGENT AUTO-MAPPING & TEACHING ASSIGNMENTS HANDLERS
  // -------------------------------------------------------------
  const handleAssignClassChange = (newClassId: string) => {
    setAssignClassId(newClassId);
    setModalError(null);
    const newClass = classes.find(c => c.classId === newClassId);
    if (!newClass) return;

    const classSems = getSemestersForYear(newClass.yearOfStudy);
    let targetSem = assignSemester;
    if (!classSems.some(s => s.name === targetSem)) {
      targetSem = classSems[0].name;
      setAssignSemester(targetSem);
    }

    // Filter available subjects for this cohort and semester
    const cohortSubjects = subjects.filter(
      s => (!s.yearOfStudy || s.yearOfStudy === newClass.yearOfStudy) &&
           (!s.semester || s.semester === targetSem || s.semesterNumber === getSemesterNumber(targetSem))
    );
    const availableSubjs = cohortSubjects.length > 0 ? cohortSubjects : subjects;

    // Retain current subject if it belongs to this cohort, else default to first cohort subject
    const isCurrentInCohort = cohortSubjects.some(s => s.subjectId === assignSubjId);
    if (!isCurrentInCohort && availableSubjs.length > 0) {
      setAssignSubjId(availableSubjs[0].subjectId);
      setAssignHours(availableSubjs[0].weeklyHours);
    }
  };

  const handleAssignSemesterChange = (newSem: string) => {
    setAssignSemester(newSem);
    setModalError(null);
    const selClass = classes.find(c => c.classId === assignClassId);
    const cohortSubjects = subjects.filter(
      s => (!selClass || !s.yearOfStudy || s.yearOfStudy === selClass.yearOfStudy) &&
           (!s.semester || s.semester === newSem || s.semesterNumber === getSemesterNumber(newSem))
    );
    const availableSubjs = cohortSubjects.length > 0 ? cohortSubjects : subjects;
    if (availableSubjs.length > 0 && !cohortSubjects.some(s => s.subjectId === assignSubjId)) {
      handleAssignSubjectChange(availableSubjs[0].subjectId);
    }
  };

  const handleAssignSubjectChange = (newSubjId: string) => {
    setAssignSubjId(newSubjId);
    setModalError(null);
    const subj = subjects.find(s => s.subjectId === newSubjId);
    if (subj) {
      setAssignHours(subj.weeklyHours);
    }
  };

  const handleAssignFacultyChange = (newMemberId: string) => {
    setAssignMemberId(newMemberId);
    setModalError(null);
  };

  const handleToggleCrossDept = () => {
    setShowCrossDeptStaff(!showCrossDeptStaff);
    setModalError(null);
  };

  const openMapFacultyModal = (initialClassId?: string, initialSubjId?: string, initialMemberId?: string) => {
    if (classes.length === 0) {
      alert('Please configure at least one class section in Academic Years first.');
      return;
    }
    if (subjects.length === 0) {
      alert('Please configure at least one subject in Subjects first.');
      return;
    }
    if (deptStaff.length === 0 && allCollegeStaff.length === 0) {
      alert('Please link at least one faculty member in Staff first.');
      return;
    }

    // 1. Class Section selection
    const targetClsId = (initialClassId && classes.some(c => c.classId === initialClassId))
      ? initialClassId
      : (assignmentClassFilter !== 'ALL' && classes.some(c => c.classId === assignmentClassFilter))
        ? assignmentClassFilter
        : classes[0].classId;
    setAssignClassId(targetClsId);

    const selectedCls = classes.find(c => c.classId === targetClsId);
    const cohortSubjs = selectedCls
      ? subjects.filter(s => !s.yearOfStudy || s.yearOfStudy === selectedCls.yearOfStudy)
      : subjects;
    const availableSubjs = cohortSubjs.length > 0 ? cohortSubjs : subjects;

    // 2. Subject selection
    const targetSubjId = (initialSubjId && subjects.some(s => s.subjectId === initialSubjId))
      ? initialSubjId
      : availableSubjs[0].subjectId;
    setAssignSubjId(targetSubjId);

    const targetSubj = subjects.find(s => s.subjectId === targetSubjId) || availableSubjs[0];
    setAssignHours(targetSubj?.weeklyHours || 4);

    // 3. Faculty selection
    setShowCrossDeptStaff(false);
    setModalError(null);

    if (initialMemberId) {
      setAssignMemberId(initialMemberId);
    } else {
      const activeDeptStaff = deptStaff.filter(s => s.status === 'ACTIVE');
      if (activeDeptStaff.length > 0) {
        setAssignMemberId(activeDeptStaff[0].memberId);
      } else {
        const activeCollegeStaff = allCollegeStaff.filter(s => s.status === 'ACTIVE');
        setAssignMemberId(activeCollegeStaff[0]?.memberId || '');
      }
    }

    setAutoMatchInfo(null);
    setAssignModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!assignClassId || !assignSubjId || !assignMemberId) {
      setModalError('Please select a class section, subject, and faculty member.');
      return;
    }

    const selectedSubj = subjects.find(s => s.subjectId === assignSubjId);
    const selectedClass = classes.find(c => c.classId === assignClassId);
    const selectedFaculty = allCollegeStaff.find(s => s.memberId === assignMemberId) || deptStaff.find(s => s.memberId === assignMemberId);

    if (!selectedSubj) {
      setModalError('Selected subject course could not be found.');
      return;
    }
    if (!selectedFaculty) {
      setModalError('Selected faculty member could not be found.');
      return;
    }

    // Canonical weekly hours directly from Subject Master
    const canonicalWeeklyHours = Number(selectedSubj.weeklyHours) || (selectedSubj.type === 'Lab' ? 4 : 3);

    setSaving(true);
    setModalError(null);
    try {
      // Auto-link staff member if they belong to another department
      const isMemberInDept = deptStaff.some(s => s.memberId === assignMemberId);
      if (!isMemberInDept) {
        await linkStaffToDepartment(assignMemberId, departmentId, user.uid);
      }

      // DO NOT call mapStaffToSubject here! Qualifications must never be silently mutated!

      await createAssignment(
        {
          memberId: assignMemberId,
          departmentId,
          subjectId: assignSubjId,
          classId: assignClassId,
          weeklyHours: canonicalWeeklyHours,
          type: selectedSubj.type || 'Theory',
          academicYear: selectedClass?.academicYear || '2025–2026',
          semester: selectedSubj.semester || 'Semester 1'
        },
        user.uid
      );

      setAssignModalOpen(false);
      await loadAll(true);
    } catch (err: any) {
      console.error('Error saving assignment:', err);
      setModalError(err?.message || 'Failed to create teaching assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (asgnId: string) => {
    if (!user) return;
    if (!confirm('Remove this teaching assignment?')) return;
    try {
      await deleteAssignment(asgnId, user.uid);
      await loadAll(true);
    } catch (err: any) {
      alert(`Error deleting assignment: ${err?.message || 'Permission denied'}`);
    }
  };

  const openReassignModal = (asgn: TeachingAssignment) => {
    setReassignTargetAsgn(asgn);
    const otherStaff = deptStaff.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE')
      || allCollegeStaff.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE');
    setReassignNewMemberId(otherStaff?.memberId || '');
    setModalError(null);
    setReassignModalOpen(true);
  };

  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reassignTargetAsgn || !reassignNewMemberId) return;
    setSaving(true);
    setModalError(null);
    try {
      await reassignStaff(reassignTargetAsgn.assignmentId, reassignNewMemberId, user.uid);
      setReassignModalOpen(false);
      setReassignTargetAsgn(null);
      await loadAll(true);
    } catch (err: any) {
      console.error('Error reassigning faculty:', err);
      setModalError(err?.message || 'Failed to reassign faculty.');
    } finally {
      setSaving(false);
    }
  };

  // Candidates for linking (college staff not yet in this department)
  const existingDeptMemberIds = new Set(deptStaff.map(s => s.memberId));
  const linkableStaff = allCollegeStaff.filter(s => !existingDeptMemberIds.has(s.memberId) && s.status === 'ACTIVE');

  // Filtered lists
  const filteredStaff = deptStaff.filter(
    s =>
      s.staffName.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.memberId.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.displayName.toLowerCase().includes(staffSearch.toLowerCase())
  );

  // Subject filtering for Year + Semester drilldown
  const subjectsForActiveYear = selectedSubjectYear
    ? subjects.filter(s => s.yearOfStudy === selectedSubjectYear)
    : subjects;

  const activeYearSemesters = selectedSubjectYear ? getSemestersForYear(selectedSubjectYear) : [];
  const unassignedActiveYearSubjects = selectedSubjectYear
    ? subjectsForActiveYear.filter(s => s.requiresSemesterReview || (!s.semester && s.semesterNumber === undefined))
    : [];

  const subjectsForActiveSemester = selectedSubjectYear
    ? selectedSemesterTab === 'REVIEW'
      ? unassignedActiveYearSubjects
      : subjectsForActiveYear.filter(s => {
          const targetSemNum = getSemesterNumber(selectedSemesterTab);
          const targetSemName = formatSemesterName(selectedSemesterTab);
          return (
            (s.semester && s.semester === targetSemName) ||
            (s.semesterNumber !== undefined && s.semesterNumber === targetSemNum)
          );
        })
    : subjects;

  const filteredSubjects = subjectsForActiveSemester.filter(s => {
    return (
      s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      s.code.toLowerCase().includes(subjectSearch.toLowerCase())
    );
  });

  const filteredAssignments = assignments.filter(a => {
    const matchesClass = assignmentClassFilter === 'ALL' || a.classId === assignmentClassFilter;
    const matchesSemester = assignmentSemesterFilter === 'ALL' || a.semester === assignmentSemesterFilter;
    return matchesClass && matchesSemester;
  });

  const subjectMap = new Map<string, Subject>();
  subjects.forEach(s => subjectMap.set(s.subjectId, s));
  allCollegeSubjects.forEach(s => {
    if (!subjectMap.has(s.subjectId)) subjectMap.set(s.subjectId, s);
  });

  const deptMap = new Map<string, Department>();
  allDepartments.forEach(d => deptMap.set(d.departmentId, d));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
        <div className="h-96 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
      </div>
    );
  }

  if (!department) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">Department Not Found</h2>
        <p className="text-sm text-slate-500 mb-6">
          The requested department ID <span className="font-mono font-bold text-slate-800">{departmentId}</span> does not exist in Cloud Firestore.
        </p>
        <Link
          href="/departments"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Department Master</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. DEPARTMENT HERO BANNER — Royal Indigo Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#29229D] via-[#322BB7] to-[#3F35C8] p-6 sm:p-7 text-white shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/departments"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Departments</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 opacity-60">
              <div className="h-1.5 w-6 rounded-full bg-white/40" />
              <div className="h-1.5 w-6 rounded-full bg-white/40" />
              <div className="h-1.5 w-6 rounded-full bg-white/40" />
              <div className="h-1.5 w-6 rounded-full bg-white/40" />
              <div className="h-1.5 w-6 rounded-full bg-white/40" />
            </div>
            <span className="font-mono text-xs text-white/60">
              ID: {department.departmentId}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3B34C4] to-[#251F91] text-white flex items-center justify-center shadow-inner shrink-0">
              <DepartmentIcon
                name={department.name}
                code={department.code}
                className="w-8 h-8 text-white stroke-[2]"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {department.name}
                </h1>
                <span className="font-mono text-xs font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-md backdrop-blur-xs">
                  {department.code}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    department.status === 'ACTIVE'
                      ? 'bg-[#137A3C]/40 text-emerald-300 border border-emerald-400/30'
                      : 'bg-white/20 text-white/70 border border-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      department.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-white/60'
                    }`}
                  />
                  {department.status}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/85 max-w-2xl leading-relaxed">
                {department.description ||
                  'Undergraduate and postgraduate degree programs with autonomous curriculum and laboratory facilities.'}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons Group */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAddStaffModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/20 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Faculty</span>
              </button>

              <button
                onClick={() => {
                  setEditingSubject(null);
                  setSubjCode('');
                  setSubjName('');
                  setSubjHours(4);
                  setSubjLabBlock(4);
                  setSubjYearOfStudy('1st Year');
                  setModalError(null);
                  setSubjectModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/20 transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subject</span>
              </button>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <button
                onClick={() => {
                  setSetupSelectedYear('1st Year');
                  setSetupModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#3431B7] bg-white hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#3431B7]" />
                <span>Generate Timetable</span>
              </button>
              <span className="text-[10px] text-white/70 mt-1">
                Section-wise generation across undergraduate years
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="border-b border-[#E3E5F0]">
        <nav className="flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-sm font-bold transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'overview'
                ? 'border-[#3431B7] text-[#3431B7]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-3 text-sm font-bold transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'staff'
                ? 'border-[#3431B7] text-[#3431B7]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Staff{' '}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-[#EEF0FA] text-[#3431B7]">
              {deptStaff.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            className={`py-3 text-sm font-bold transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'subjects'
                ? 'border-[#3431B7] text-[#3431B7]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Subjects{' '}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-[#EEF0FA] text-[#3431B7]">
              {subjects.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('years')}
            className={`py-3 text-sm font-bold transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'years'
                ? 'border-[#3431B7] text-[#3431B7]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Academic Years & Sections{' '}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-[#EEF0FA] text-[#3431B7]">
              {classes.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`py-3 text-sm font-bold transition-all border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'assignments'
                ? 'border-[#3431B7] text-[#3431B7]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Teaching Assignments{' '}
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-[#EEF0FA] text-[#3431B7]">
              {assignments.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ========================================================= */}
      {/* 3. TAB 1: OVERVIEW — EXACTLY FOUR SUMMARY CARDS           */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Exactly Four Department Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Summary Card 1: Total Staff */}
            <div
              onClick={() => setActiveTab('staff')}
              className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:border-[#3431B7] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Staff</span>
                  <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] group-hover:bg-[#3431B7] text-[#3431B7] group-hover:text-white flex items-center justify-center transition-colors">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                  {deptStaff.length}
                </div>
                <p className="text-xs text-slate-500">
                  {deptStaff.filter(s => s.status === 'ACTIVE').length} active faculty in {department.code}
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3431B7]">
                <span>View Faculty Directory</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Summary Card 2: Total Subjects */}
            <div
              onClick={() => setActiveTab('subjects')}
              className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:border-[#3431B7] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Subjects</span>
                  <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] group-hover:bg-[#3431B7] text-[#3431B7] group-hover:text-white flex items-center justify-center transition-colors">
                    <BookOpen className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                  {subjects.filter(s => s.status !== 'INACTIVE').length}
                </div>
                <p className="text-xs text-slate-500">
                  Curriculum courses across all academic years
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3431B7]">
                <span>Manage Subjects</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Summary Card 3: Academic Years */}
            <div
              onClick={() => setActiveTab('years')}
              className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:border-[#3431B7] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Academic Years</span>
                  <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] group-hover:bg-[#3431B7] text-[#3431B7] group-hover:text-white flex items-center justify-center transition-colors">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                  {UNDERGRADUATE_YEARS.length} Years
                </div>
                <p className="text-xs text-slate-500">
                  {UNDERGRADUATE_YEARS.filter(y => getYearProgress(y).status === 'COMPLETED').length} of 4 Years Completed
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3431B7]">
                <span>View Year Levels</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Summary Card 4: Total Sections */}
            <div
              onClick={() => setActiveTab('years')}
              className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:border-[#3431B7] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sections</span>
                  <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] group-hover:bg-[#3431B7] text-[#3431B7] group-hover:text-white flex items-center justify-center transition-colors">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight mb-1">
                  {classes.length}
                </div>
                <p className="text-xs text-slate-500">
                  {classes.filter(c => getSectionTimetableStatus(c.classId) === 'LOCKED').length} of {classes.length} Sections Locked
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3431B7]">
                <span>Manage Sections</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Department Workflow Status Card */}
          <div className="rounded-2xl bg-gradient-to-r from-[#29229D] via-[#322BB7] to-[#3F35C8] p-6 text-white shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span>Department Workflow Status</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                {deptStaff.length === 0
                  ? 'Step 1: Add faculty members to this department'
                  : subjects.length === 0
                  ? 'Step 2: Add subjects for academic curriculum'
                  : classes.length === 0
                  ? 'Step 3: Create class sections in Academic Years & Sections'
                  : assignments.length === 0
                  ? 'Step 4: Map teaching assignments'
                  : 'All prerequisites complete! Ready for Section-wise Timetable Generation.'}
              </h3>
              <p className="text-xs text-white/80 mt-1 max-w-xl">
                {deptStaff.length === 0
                  ? 'Create or link faculty profiles to begin scheduling courses.'
                  : subjects.length === 0
                  ? 'Define theory and laboratory subjects across undergraduate years.'
                  : classes.length === 0
                  ? 'Configure section cohorts (Section A, B, etc.) for each academic year.'
                  : assignments.length === 0
                  ? 'Allocate subjects to faculty members for each class section.'
                  : 'Select an Academic Year and Section to generate, preview, adjust, and lock conflict-free timetables.'}
              </p>
            </div>
            <div className="shrink-0">
              <button
                onClick={() => {
                  setSetupSelectedYear('1st Year');
                  setSetupModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[#322BB7] bg-white hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>Generate Timetable</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. TAB 2: STAFF (DEPARTMENT FACULTY DIRECTORY)            */}
      {/* WORKSTREAM A: Match Global Directory Plain-Text Styling  */}
      {/* ========================================================= */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search department faculty by name or Member ID..."
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openAddStaffModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Faculty</span>
              </button>

              {linkableStaff.length > 0 && (
                <button
                  onClick={() => {
                    setEditingStaff(null);
                    setStaffAddMode('link');
                    setSelectedExistingStaffId(linkableStaff[0]?.memberId || '');
                    setModalError(null);
                    setStaffModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Link Existing Faculty ({linkableStaff.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Faculty Table — Workstream A: Plain Text Department & Qualified Subjects (NO badges/chips) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Permanent ID</th>
                    <th className="py-3 px-4">Faculty Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Qualified Subjects</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        No faculty members linked to {department.name}. Click "Create New Faculty" to add staff.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((member) => {
                      const qSubjIds = Array.isArray(member.subjectIds) ? member.subjectIds : [];
                      const isPrimaryHere = member.primaryDepartmentId === departmentId;

                      return (
                        <tr
                          key={member.memberId}
                          onClick={() => setSelectedProfileStaff(member)}
                          className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                        >
                          {/* Permanent Member ID */}
                          <td className="py-3 px-4 font-mono text-xs font-bold text-[#3431B7] bg-[#F4F5FB]/60 w-32 whitespace-nowrap">
                            {member.memberId}
                          </td>

                          {/* Profile Picture thumbnail + Staff Name */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3431B7] to-[#251F91] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                {member.initials || member.staffName?.charAt(0)?.toUpperCase() || 'F'}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 group-hover:text-[#3431B7] transition-colors">
                                  {member.displayName}
                                </div>
                                <div className="text-[10px] text-slate-400">Click to view profile</div>
                              </div>
                            </div>
                          </td>

                          {/* Department Column — Plain Colored Text (NO background badge) matching Global Directory */}
                          <td className="py-3 px-4 text-slate-800 text-xs font-medium">
                            <span>
                              {department.name} ({department.code})
                            </span>
                            {!isPrimaryHere && (
                              <span className="text-slate-500 text-[11px] ml-1">
                                (Cross-Dept Link)
                              </span>
                            )}
                          </td>

                          {/* Qualified Subjects Column — Plain Text (NO background chips/pills) matching Global Directory */}
                          <td className="py-3 px-4 text-slate-700 text-xs">
                            {qSubjIds.length > 0 ? (
                              <span>
                                {qSubjIds.map((sId, idx) => {
                                  const subj = subjectMap.get(sId);
                                  const label = subj ? subj.name : sId;
                                  return (
                                    <React.Fragment key={sId}>
                                      {idx > 0 && <span className="text-slate-400 mx-1">•</span>}
                                      <span title={subj ? `${subj.code} (${subj.type}, ${subj.weeklyHours}h/wk)` : sId}>
                                        {label}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No subjects linked</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                member.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {member.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {member.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedProfileStaff(member)}
                              className="p-1.5 text-slate-400 hover:text-[#3431B7] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="View Faculty Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditStaffModal(member)}
                              className="p-1.5 text-slate-400 hover:text-[#3431B7] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Edit Faculty Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStaffStatus(member)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title={member.status === 'ACTIVE' ? 'Deactivate (Soft-Archive)' : 'Reactivate'}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(member)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Permanently Delete Faculty"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 3: SUBJECTS (YEAR + SEMESTER-WISE SUBJECT WORKSPACE)*/}
      {/* ========================================================= */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          {selectedSubjectYear === null ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    Academic Year Curriculum & Subjects
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select an academic year level to view, add, or edit curriculum courses by semester
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingSubject(null);
                    setSubjCode('');
                    setSubjName('');
                    setSubjHours(4);
                    setSubjLabBlock(4);
                    setSubjYearOfStudy('1st Year');
                    setSubjSemester('Semester 1');
                    setSubjAllowChangeSemester(false);
                    setModalError(null);
                    setSubjectModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Subject</span>
                </button>
              </div>

              {/* 4 Academic Year Level Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {UNDERGRADUATE_YEARS.map((yr, idx) => {
                  const sems = getSemestersForYear(yr);
                  const yearSubjs = subjects.filter(s => s.yearOfStudy === yr && s.status !== 'INACTIVE');
                  const sem1Subjs = yearSubjs.filter(s => s.semester === sems[0].name || s.semesterNumber === sems[0].number);
                  const sem2Subjs = yearSubjs.filter(s => s.semester === sems[1].name || s.semesterNumber === sems[1].number);
                  const unassignedSubjs = yearSubjs.filter(s => s.requiresSemesterReview || (!s.semester && s.semesterNumber === undefined));
                  const totalHours = yearSubjs.reduce((sum, s) => sum + (s.weeklyHours || 0), 0);

                  return (
                    <div
                      key={yr}
                      className="bg-white border border-[#E3E5F0] rounded-2xl p-5 shadow-xs hover:border-[#3431B7] transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-[#28229E] text-white flex items-center justify-center font-black text-sm shrink-0">
                            {idx + 1}
                          </div>
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                            {totalHours} hrs/week
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 mb-1 group-hover:text-[#3431B7] transition-colors">
                          {yr}
                        </h3>
                        <p className="text-xs text-slate-500 mb-3">
                          {yearSubjs.length} configured {yearSubjs.length === 1 ? 'course' : 'courses'} across 2 semesters
                        </p>

                        {/* Semester Breakdown Box */}
                        <div className="p-3 rounded-xl bg-[#F4F5FB] border border-[#E3E5F0] space-y-2 mb-4 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{sems[0].name}:</span>
                            <span className="font-bold text-slate-900">
                              {sem1Subjs.length} courses ({sem1Subjs.reduce((acc, s) => acc + (s.weeklyHours || 0), 0)} hrs)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{sems[1].name}:</span>
                            <span className="font-bold text-slate-900">
                              {sem2Subjs.length} courses ({sem2Subjs.reduce((acc, s) => acc + (s.weeklyHours || 0), 0)} hrs)
                            </span>
                          </div>

                          {unassignedSubjs.length > 0 && (
                            <div className="pt-1.5 border-t border-amber-200/60 flex items-center justify-between text-amber-700 font-bold">
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Needs Review:</span>
                              </span>
                              <span>{unassignedSubjs.length} unassigned</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setSelectedSubjectYear(yr);
                            setSelectedSubjectSemester(sems[0].name);
                            setSelectedSemesterTab(sems[0].name);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors cursor-pointer shadow-xs"
                        >
                          <span>View {yr} Semesters & Subjects</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingSubject(null);
                            setSubjCode('');
                            setSubjName('');
                            setSubjHours(4);
                            setSubjLabBlock(4);
                            setSubjYearOfStudy(yr);
                            setSubjSemester(sems[0].name);
                            setSubjAllowChangeSemester(false);
                            setModalError(null);
                            setSubjectModalOpen(true);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl text-xs font-semibold text-[#3431B7] bg-white hover:bg-[#F4F5FB] border border-slate-200 hover:border-[#3431B7] transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Subject to {yr}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header Bar with Back Button, Title, Search, and Add Subject */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedSubjectYear(null);
                      setSubjectSearch('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#3431B7] bg-[#EEF0FA] hover:bg-[#E0E4F7] transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>All Academic Years</span>
                  </button>

                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                      {selectedSubjectYear} Curriculum & Subjects
                    </h2>
                    <p className="text-xs text-slate-500">
                      Manage Semester-wise courses for {department.name} ({department.code})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder={`Search ${selectedSubjectYear} courses...`}
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setEditingSubject(null);
                      setSubjCode('');
                      setSubjName('');
                      setSubjHours(4);
                      setSubjLabBlock(4);
                      setSubjYearOfStudy(selectedSubjectYear);
                      setSubjSemester(
                        selectedSemesterTab !== 'REVIEW'
                          ? selectedSemesterTab
                          : activeYearSemesters[0]?.name || 'Semester 1'
                      );
                      setSubjAllowChangeSemester(false);
                      setModalError(null);
                      setSubjectModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      Add Subject to {selectedSemesterTab !== 'REVIEW' ? selectedSemesterTab : activeYearSemesters[0]?.name}
                    </span>
                  </button>
                </div>
              </div>

              {/* SEMESTER TABS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    {activeYearSemesters.map((sem) => {
                      const semCount = subjectsForActiveYear.filter(
                        s => s.status !== 'INACTIVE' && (s.semester === sem.name || s.semesterNumber === sem.number)
                      ).length;
                      const isSelected = selectedSemesterTab === sem.name;

                      return (
                        <button
                          key={sem.name}
                          type="button"
                          onClick={() => {
                            setSelectedSemesterTab(sem.name);
                            setSelectedSubjectSemester(sem.name);
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#3431B7] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span>{sem.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {semCount}
                          </span>
                        </button>
                      );
                    })}

                    {unassignedActiveYearSubjects.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSemesterTab('REVIEW')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          selectedSemesterTab === 'REVIEW'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Needs Review</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            selectedSemesterTab === 'REVIEW' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'
                          }`}
                        >
                          {unassignedActiveYearSubjects.length}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 font-medium px-3">
                    Active Scope: <strong className="text-slate-800">{selectedSubjectYear} — {selectedSemesterTab !== 'REVIEW' ? selectedSemesterTab : 'Unassigned Review'}</strong>
                  </div>
                </div>
              </div>

              {/* REVIEW TAB CONTENT (If 'REVIEW' is selected) */}
              {selectedSemesterTab === 'REVIEW' && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-950">
                        Semester Assignment Required ({unassignedActiveYearSubjects.length} {unassignedActiveYearSubjects.length === 1 ? 'Course' : 'Courses'})
                      </h4>
                      <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                        These courses are part of {selectedSubjectYear} curriculum but have not yet been assigned to a specific semester. Assign each course to its correct semester below:
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Subject ID</th>
                          <th className="py-2.5 px-4">Code</th>
                          <th className="py-2.5 px-4">Course Title</th>
                          <th className="py-2.5 px-4">Type</th>
                          <th className="py-2.5 px-4">Weekly Hours</th>
                          <th className="py-2.5 px-4 text-right">Assign Semester</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {unassignedActiveYearSubjects.map((s) => (
                          <tr key={s.subjectId} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{s.subjectId}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">{s.code}</td>
                            <td className="py-2.5 px-4 font-semibold text-slate-800">{s.name}</td>
                            <td className="py-2.5 px-4 text-xs font-semibold">{s.type}</td>
                            <td className="py-2.5 px-4 text-xs font-bold text-slate-700">{s.weeklyHours} hrs</td>
                            <td className="py-2.5 px-4 text-right space-x-2">
                              {activeYearSemesters.map((sem) => (
                                <button
                                  key={sem.name}
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleQuickAssignSemester(s, sem.name)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Assign to {sem.name}</span>
                                </button>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REGULAR SEMESTER SUBJECTS TABLE */}
              {selectedSemesterTab !== 'REVIEW' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Subject ID</th>
                          <th className="py-3 px-4">Code</th>
                          <th className="py-3 px-4">Course Title</th>
                          <th className="py-3 px-4">Semester</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Weekly Hours</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSubjects.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                              <p className="font-semibold text-slate-700">
                                No subjects configured for {selectedSubjectYear} — {selectedSemesterTab}.
                              </p>
                              <p className="text-slate-400 mt-0.5 mb-3">
                                Create courses for this semester using the button below.
                              </p>
                              <button
                                onClick={() => {
                                  setEditingSubject(null);
                                  setSubjCode('');
                                  setSubjName('');
                                  setSubjHours(4);
                                  setSubjLabBlock(4);
                                  setSubjYearOfStudy(selectedSubjectYear);
                                  setSubjSemester(selectedSemesterTab);
                                  setSubjAllowChangeSemester(false);
                                  setModalError(null);
                                  setSubjectModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                                <span>Add Subject to {selectedSemesterTab}</span>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          filteredSubjects.map((s) => (
                            <tr key={s.subjectId} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4 font-mono text-xs text-slate-500">{s.subjectId}</td>
                              <td className="py-3 px-4 font-bold text-slate-900">{s.code}</td>
                              <td className="py-3 px-4 font-semibold text-slate-800">{s.name}</td>
                              <td className="py-3 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {s.semester || (s.semesterNumber ? `Semester ${s.semesterNumber}` : 'Unassigned')}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                    s.type === 'Lab'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {s.type} {s.type === 'Lab' && s.labBlockHours ? `(${s.labBlockHours}h block)` : ''}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-700">{s.weeklyHours} hrs</td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    s.status === 'ACTIVE'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                  }`}
                                >
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right space-x-1.5">
                                <button
                                  onClick={() => {
                                    setEditingSubject(s);
                                    setSubjCode(s.code);
                                    setSubjName(s.name);
                                    setSubjType(s.type);
                                    setSubjHours(s.weeklyHours);
                                    setSubjLabBlock(s.labBlockHours || 4);
                                    setSubjYearOfStudy(s.yearOfStudy || selectedSubjectYear);
                                    setSubjSemester(s.semester || (s.semesterNumber ? `Semester ${s.semesterNumber}` : selectedSemesterTab));
                                    setSubjAllowChangeSemester(false);
                                    setModalError(null);
                                    setSubjectModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-[#3431B7] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                  title="Edit Subject"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleToggleSubjectStatus(s)}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                  title={s.status === 'ACTIVE' ? 'Archive Subject' : 'Reactivate'}
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. TAB 4: ACADEMIC YEARS & SECTIONS (Phase 5: NO STRENGTH) */}
      {/* ========================================================= */}
      {activeTab === 'years' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Undergraduate Year Cohorts & Sections
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {classes.length} Total Sections
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure student class divisions (Sections A, B, C) for each academic level
              </p>
            </div>

            <button
              onClick={() => {
                setSecYear('1st Year');
                setSecName('A');
                setModalError(null);
                setSectionModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create New Section</span>
            </button>
          </div>

          {/* 4 Column Cohort Board */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {UNDERGRADUATE_YEARS.map((yr, idx) => {
              const yearClasses = classes.filter(c => c.yearOfStudy === yr);
              const yearSubjects = subjects.filter(s => s.yearOfStudy === yr && s.status !== 'INACTIVE');
              const progress = getYearProgress(yr);

              return (
                <div
                  key={yr}
                  className="bg-white border border-[#E3E5F0] rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#28229E] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{yr}</h4>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                progress.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : progress.status === 'IN_PROGRESS'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {progress.text}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-medium">Academic Year 2025–2026</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSecYear(yr);
                          setSecName(String.fromCharCode(65 + yearClasses.length));
                          setModalError(null);
                          setSectionModalOpen(true);
                        }}
                        className="w-7 h-7 rounded-lg bg-[#F4F5FB] hover:bg-[#EEF0FA] text-[#3431B7] flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                        title={`Add section to ${yr}`}
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Section Cards List */}
                    {yearClasses.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {yearClasses.map(cls => {
                          const ttStatus = getSectionTimetableStatus(cls.classId);

                          return (
                            <div
                              key={cls.classId}
                              onClick={() => {
                                setSetupSelectedYear(yr);
                                setSetupSelectedClassId(cls.classId);
                                setSetupModalOpen(true);
                              }}
                              className="bg-[#F4F5FB] border border-[#E3E5F0] rounded-xl p-3 flex items-center justify-between hover:bg-[#EEF0FA] transition-colors cursor-pointer group"
                              title="Click to view timetable or manage this section"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-white border border-[#E3E5F0] text-[#3431B7] font-bold text-xs flex items-center justify-center shrink-0">
                                  {cls.section}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>Section {cls.section}</span>
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                                        ttStatus === 'LOCKED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : ttStatus === 'DRAFT'
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : 'bg-slate-200 text-slate-600'
                                      }`}
                                    >
                                      {ttStatus === 'LOCKED' ? 'Locked' : ttStatus === 'DRAFT' ? 'Draft' : 'Not Gen'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    Tap to open section generator
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleClassStatus(cls);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-white transition-colors"
                                  title="Archive Section"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => {
                            setSecYear(yr);
                            setSecName(String.fromCharCode(65 + yearClasses.length));
                            setModalError(null);
                            setSectionModalOpen(true);
                          }}
                          className="w-full border border-slate-200 hover:border-[#3431B7] rounded-xl py-2 text-xs font-bold text-[#3431B7] bg-white hover:bg-[#F4F5FB] transition-colors cursor-pointer"
                        >
                          + Add another section
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 mb-3">
                        <div className="border border-dashed border-[#D2D6EC] bg-[#F7F8FD]/60 rounded-xl p-5 text-center">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-1.5 text-xs font-bold">
                            +
                          </div>
                          <div className="text-xs font-bold text-slate-700">No sections yet</div>
                          <div className="text-[11px] text-slate-400">Add Section A for {yr}</div>
                        </div>

                        <button
                          onClick={() => {
                            setSecYear(yr);
                            setSecName('A');
                            setModalError(null);
                            setSectionModalOpen(true);
                          }}
                          className="w-full border border-slate-200 hover:border-[#3431B7] rounded-xl py-2 text-xs font-bold text-[#3431B7] bg-white hover:bg-[#F4F5FB] transition-colors cursor-pointer"
                        >
                          + Add Section
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 font-medium pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-slate-400">Tagged subjects</span>
                    <span className="font-bold text-slate-800">{yearSubjects.length} courses</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. TAB 5: TEACHING ASSIGNMENTS                            */}
      {/* ========================================================= */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Section:</span>
                <select
                  value={assignmentClassFilter}
                  onChange={(e) => setAssignmentClassFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7] min-w-48"
                >
                  <option value="ALL">All Sections</option>
                  {classes.map(c => (
                    <option key={c.classId} value={c.classId}>
                      {c.yearOfStudy} — Section {c.section}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Semester:</span>
                <select
                  value={assignmentSemesterFilter}
                  onChange={(e) => setAssignmentSemesterFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                >
                  <option value="ALL">All Semesters</option>
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                  <option value="Semester 3">Semester 3</option>
                  <option value="Semester 4">Semester 4</option>
                  <option value="Semester 5">Semester 5</option>
                  <option value="Semester 6">Semester 6</option>
                  <option value="Semester 7">Semester 7</option>
                  <option value="Semester 8">Semester 8</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Optional 1-Click Copy from Another Section button */}
              {assignmentClassFilter !== 'ALL' && (
                (() => {
                  const currentClass = classes.find(c => c.classId === assignmentClassFilter);
                  const siblingClasses = classes.filter(c => c.classId !== assignmentClassFilter && c.yearOfStudy === currentClass?.yearOfStudy);
                  if (siblingClasses.length === 0) return null;
                  return (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        const source = siblingClasses[0];
                        if (!user || !currentClass) return;
                        if (!confirm(`Copy all subject assignments from Section ${source.section} to Section ${currentClass.section}? Existing assignments will not be overwritten.`)) return;
                        setSaving(true);
                        try {
                          const res = await copyAssignmentsBetweenClasses(source.classId, currentClass.classId, user.uid);
                          await loadAll(true);
                          alert(`Successfully copied ${res.copied} assignment(s) from Section ${source.section} to Section ${currentClass.section}.${res.skipped > 0 ? ` (${res.skipped} already assigned)` : ''}`);
                        } catch (err: any) {
                          alert(`Error copying assignments: ${err?.message || 'Failed'}`);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy from Sec {siblingClasses[0].section}</span>
                    </button>
                  );
                })()
              )}

              <button
                onClick={() => openMapFacultyModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Map Faculty to Subject</span>
              </button>
            </div>
          </div>

          {/* Assignments Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Class Section</th>
                    <th className="py-3 px-4">Semester</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Assigned Faculty</th>
                    <th className="py-3 px-4">Member ID</th>
                    <th className="py-3 px-4">Hours/Wk</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                        No teaching assignments created for {department.name}. Click "Map Faculty to Subject" to allocate teaching hours.
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((asgn) => {
                      const staffObj = deptStaff.find(s => s.memberId === asgn.memberId) || allCollegeStaff.find(s => s.memberId === asgn.memberId);
                      const subjObj = subjects.find(s => s.subjectId === asgn.subjectId);
                      const classObj = classes.find(c => c.classId === asgn.classId);

                      return (
                        <tr key={asgn.assignmentId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {classObj ? `${classObj.yearOfStudy} — Sec ${classObj.section}` : asgn.classId}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700">
                            <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                              {asgn.semester || 'Semester 1'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {subjObj ? `${subjObj.name} (${subjObj.code})` : asgn.subjectId}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#3431B7]">
                              {staffObj?.displayName || asgn.memberId}
                            </div>
                            {asgn.previousMemberId && (
                              <div className="text-[11px] text-amber-700 font-medium">
                                Reassigned from {asgn.previousMemberId}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">
                            {asgn.memberId}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {asgn.weeklyHours} hrs
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                                asgn.type === 'Lab'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {asgn.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openReassignModal(asgn)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer"
                                title="Reassign Faculty"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Reassign</span>
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(asgn.assignmentId)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                title="Delete Assignment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SECTION-WISE TIMETABLE SETUP FLOW (Workstream B2)  */}
      {/* ========================================================= */}
      {setupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EEF0FA] text-[#3431B7] flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Section-wise Timetable Generator
                  </h3>
                  <p className="text-xs text-slate-500">
                    Department: <span className="font-semibold text-slate-800">{department.name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSetupModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Step 1: Academic Year Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Step 1: Which Academic Year do you want to generate a timetable for?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {UNDERGRADUATE_YEARS.map(yr => {
                    const prog = getYearProgress(yr);
                    const isSelected = setupSelectedYear === yr;

                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setSetupSelectedYear(yr)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#3431B7] bg-[#EEF0FA]/60 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold ${isSelected ? 'text-[#3431B7]' : 'text-slate-900'}`}>
                            {yr}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              prog.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : prog.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {prog.text}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {classes.filter(c => c.yearOfStudy === yr).length} Sections configured
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Section Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Step 2: Select Section ({setupSelectedYear})
                </label>
                {(() => {
                  const yearClasses = classes.filter(c => c.yearOfStudy === setupSelectedYear);

                  if (yearClasses.length === 0) {
                    return (
                      <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 text-center text-amber-900">
                        <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                        <p className="font-bold">No sections configured for {setupSelectedYear}.</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Please go to the "Academic Years & Sections" tab to add Section A first.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {yearClasses.map(cls => {
                        const status = getSectionTimetableStatus(cls.classId);
                        const isSelected = setupSelectedClassId === cls.classId;

                        return (
                          <div
                            key={cls.classId}
                            onClick={() => setSetupSelectedClassId(cls.classId)}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#3431B7] bg-[#EEF0FA]/60 shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-white border border-[#E3E5F0] text-[#3431B7] font-bold text-xs flex items-center justify-center">
                                {cls.section}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">
                                  Section {cls.section}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {cls.classId}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                status === 'LOCKED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : status === 'DRAFT'
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {status === 'LOCKED' ? 'Locked / Published' : status === 'DRAFT' ? 'Draft Available' : 'Not Generated'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setSetupModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!setupSelectedClassId}
                onClick={() => {
                  setSetupModalOpen(false);
                  router.push(
                    `/generator?departmentId=${departmentId}&classId=${encodeURIComponent(setupSelectedClassId)}&academicYear=2025–2026&yearOfStudy=${encodeURIComponent(setupSelectedYear)}&autoGenerate=true`
                  );
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <span>Open Timetable Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: ADD / EDIT STAFF                                 */}
      {/* ========================================================= */}
      {staffModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingStaff ? `Edit Faculty — ${editingStaff.memberId}` : 'Add Department Faculty'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {editingStaff
                ? 'Update contact details, designation, or qualified subjects. Member ID remains permanent.'
                : 'Create a new faculty profile or link an existing faculty member from another department.'}
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            {!editingStaff && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStaffAddMode('new')}
                  className={`py-2 px-3 rounded-lg transition-all cursor-pointer ${
                    staffAddMode === 'new'
                      ? 'bg-white text-[#3431B7] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 inline mr-1.5" />
                  New Faculty Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffAddMode('link');
                    if (linkableStaff.length > 0 && !selectedExistingStaffId) {
                      setSelectedExistingStaffId(linkableStaff[0].memberId);
                    }
                  }}
                  className={`py-2 px-3 rounded-lg transition-all cursor-pointer ${
                    staffAddMode === 'link'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5 inline mr-1.5" />
                  Link Existing ({linkableStaff.length})
                </button>
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="space-y-4">
              {staffAddMode === 'new' || editingStaff ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ramesh, Priya, Suresh"
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Initials
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. R, K"
                        value={staffInitials}
                        onChange={(e) => setStaffInitials(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7] uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Designation <span className="text-[10px] text-slate-400 font-normal lowercase">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Professor, Assistant Professor, Lecturer"
                        value={staffDesignation}
                        onChange={(e) => setStaffDesignation(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        value={staffPhone}
                        onChange={(e) => setStaffPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="faculty@ssmiet.ac.in"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                    />
                  </div>
                </>
              ) : (
                /* Mode: Link Existing Faculty */
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Select Existing College Faculty Member
                  </label>
                  {linkableStaff.length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                      All existing faculty members in the college are already linked to {department.code}.
                    </div>
                  ) : (
                    <select
                      value={selectedExistingStaffId}
                      onChange={(e) => setSelectedExistingStaffId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                    >
                      {linkableStaff.map(s => (
                        <option key={s.memberId} value={s.memberId}>
                          {s.displayName} ({s.memberId}) — Primary: {s.primaryDepartmentId.replace('dept-', '').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-slate-500 mt-2">
                    Linking an existing faculty member retains their permanent ID (<span className="font-mono font-bold text-slate-700">FAC-XXXXXX</span>) and enforces college-wide clash detection.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStaffModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (staffAddMode === 'link' && linkableStaff.length === 0)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingStaff ? 'Save Changes' : staffAddMode === 'new' ? 'Generate ID & Save' : 'Link Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: ADD / EDIT SUBJECT                               */}
      {/* ========================================================= */}
      {subjectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingSubject ? `Edit Subject: ${editingSubject.code}` : `Add Subject to ${department.code}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure curriculum course code, required weekly hours, and semester association.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSubject} className="space-y-4">
              {/* Year & Semester Context Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Year Level</span>
                    <span className="font-bold text-slate-800">{subjYearOfStudy}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Semester</span>
                    {editingSubject && !subjAllowChangeSemester ? (
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#3431B7]">{subjSemester}</span>
                        <button
                          type="button"
                          onClick={() => setSubjAllowChangeSemester(true)}
                          className="text-[11px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <select
                        value={subjSemester}
                        onChange={(e) => setSubjSemester(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-bold text-[#3431B7] focus:outline-none focus:ring-1 focus:ring-[#3431B7]"
                      >
                        {getSemestersForYear(subjYearOfStudy).map(sem => (
                          <option key={sem.name} value={sem.name}>
                            {sem.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {editingSubject && subjAllowChangeSemester && (
                  <p className="text-[11px] text-amber-700 pt-1 border-t border-amber-200/60 leading-tight">
                    * Changing semester reassigns this course's curriculum scope. Active teaching assignments in other semesters will need to be re-evaluated.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Course Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS201, MA101"
                    value={subjCode}
                    onChange={(e) => setSubjCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7] uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Course Type
                  </label>
                  <select
                    value={subjType}
                    onChange={(e) => setSubjType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Laboratory</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures & Algorithms"
                  value={subjName}
                  onChange={(e) => setSubjName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Weekly Hours
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={subjHours}
                    onChange={(e) => setSubjHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                  />
                </div>
                {subjType === 'Lab' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Lab Block (Hours)
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="4"
                      value={subjLabBlock}
                      onChange={(e) => setSubjLabBlock(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubjectModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: ADD CLASS SECTION (Phase 5: NO STRENGTH FIELD)   */}
      {/* ========================================================= */}
      {sectionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Add Class Section
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure student class cohort section for {department.code}.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSection} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Academic Level
                  </label>
                  <select
                    value={secYear}
                    onChange={(e) => setSecYear(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                  >
                    {UNDERGRADUATE_YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Section Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A, B, C"
                    value={secName}
                    onChange={(e) => setSecName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3431B7] uppercase font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSectionModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: TEACHING ASSIGNMENT (SIMPLIFIED CLEAN POPUP)    */}
      {/* ========================================================= */}
      {assignModalOpen && (() => {
        const modalSelectedClass = classes.find(c => c.classId === assignClassId);
        const modalCohortSubjects = modalSelectedClass
          ? subjects.filter(
              s =>
                (!s.yearOfStudy || s.yearOfStudy === modalSelectedClass.yearOfStudy) &&
                (!s.semester || s.semester === assignSemester || s.semesterNumber === getSemesterNumber(assignSemester))
            )
          : subjects;
        const modalOtherSubjects = modalSelectedClass
          ? subjects.filter(
              s =>
                s.yearOfStudy &&
                (s.yearOfStudy !== modalSelectedClass.yearOfStudy ||
                 (s.semester && s.semester !== assignSemester && s.semesterNumber !== getSemesterNumber(assignSemester)))
            )
          : [];
        const modalSelectedSubj = subjects.find(s => s.subjectId === assignSubjId);
        const modalSelectedFaculty = (showCrossDeptStaff ? allCollegeStaff : deptStaff).find(s => s.memberId === assignMemberId)
          || allCollegeStaff.find(s => s.memberId === assignMemberId);
        const isReadyToSave = !!(assignClassId && assignSubjId && assignMemberId);

        // Active faculty sorted alphabetically
        const deptActiveStaff = deptStaff.filter(s => s.status === 'ACTIVE');
        const sortedDeptStaff = [...deptActiveStaff].sort((a, b) => a.displayName.localeCompare(b.displayName));

        const crossActiveStaff = allCollegeStaff.filter(s => !existingDeptMemberIds.has(s.memberId) && s.status === 'ACTIVE');
        const sortedCrossStaff = [...crossActiveStaff].sort((a, b) => a.displayName.localeCompare(b.displayName));

        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Map Faculty to Subject
                  </h3>
                  <p className="text-xs text-slate-500">
                    Assign a faculty member to teach a curriculum subject for this section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Error Alert */}
              {modalError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveAssignment} className="space-y-4">
                {/* SECTION 1: ASSIGNMENT CONTEXT */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Assignment Context
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Department</span>
                      <span className="font-bold text-slate-800 truncate block">{department.name}</span>
                    </div>
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Academic Year</span>
                      <span className="font-bold text-slate-800 block">{modalSelectedClass?.academicYear || '2025–2026'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Section
                      </label>
                      <select
                        value={assignClassId}
                        onChange={(e) => handleAssignClassChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                      >
                        {classes.map(c => (
                          <option key={c.classId} value={c.classId}>
                            {c.yearOfStudy} — Section {c.section}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Semester
                      </label>
                      <select
                        value={assignSemester}
                        onChange={(e) => handleAssignSemesterChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-bold text-[#3431B7] focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                      >
                        {getSemestersForYear(modalSelectedClass?.yearOfStudy).map(s => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SUBJECT COURSE */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Subject Course
                  </label>
                  <select
                    value={assignSubjId}
                    onChange={(e) => handleAssignSubjectChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                  >
                    <optgroup label={`Cohort Subjects (${modalSelectedClass?.yearOfStudy || 'Curriculum'} — ${assignSemester})`}>
                      {modalCohortSubjects.map(s => (
                        <option key={s.subjectId} value={s.subjectId}>
                          {s.name} ({s.type}, {s.weeklyHours} hrs/wk)
                        </option>
                      ))}
                    </optgroup>
                    {modalOtherSubjects.length > 0 && (
                      <optgroup label="Other Department Subjects">
                        {modalOtherSubjects.map(s => (
                          <option key={s.subjectId} value={s.subjectId}>
                            {s.name} ({s.type}, {s.weeklyHours} hrs/wk)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Selected Subject Display: Only Subject Name, Subject Type, Weekly Hours */}
                  {modalSelectedSubj && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">Subject Name</span>
                        <span className="font-bold text-slate-900 text-sm">{modalSelectedSubj.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Type</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            modalSelectedSubj.type === 'Lab'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {modalSelectedSubj.type}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Weekly Hours</span>
                          <span className="font-bold text-[#3431B7]">{modalSelectedSubj.weeklyHours} hrs/wk</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 3: FACULTY */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Faculty Member
                    </label>
                    <button
                      type="button"
                      onClick={handleToggleCrossDept}
                      className="text-xs font-bold text-[#3431B7] hover:underline cursor-pointer"
                    >
                      {showCrossDeptStaff ? '← Same Department Only' : '+ Find Faculty from Other Departments'}
                    </button>
                  </div>

                  <select
                    value={assignMemberId}
                    onChange={(e) => handleAssignFacultyChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                  >
                    <option value="" disabled>-- Select Faculty Member --</option>
                    <optgroup label={`${department.name} Faculty`}>
                      {sortedDeptStaff.map(st => (
                        <option key={st.memberId} value={st.memberId}>
                          {st.displayName} ({st.memberId}){st.designation ? ` — ${st.designation}` : ''}
                        </option>
                      ))}
                    </optgroup>

                    {showCrossDeptStaff && (
                      <optgroup label="Other Departments">
                        {sortedCrossStaff.map(st => (
                          <option key={st.memberId} value={st.memberId}>
                            {st.displayName} ({st.memberId}) — [{st.primaryDepartmentId.replace('dept-', '').toUpperCase()}]{st.designation ? ` (${st.designation})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Selected Faculty Display: Only Faculty Name, Member ID, Designation */}
                  {modalSelectedFaculty && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">Faculty Name</span>
                        <span className="font-bold text-slate-900 text-sm">{modalSelectedFaculty.displayName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Member ID</span>
                          <span className="font-mono font-bold text-[#3431B7] text-xs">{modalSelectedFaculty.memberId}</span>
                        </div>
                        {modalSelectedFaculty.designation && (
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Designation</span>
                            <span className="font-semibold text-slate-700">{modalSelectedFaculty.designation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 4: ACTIONS */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setAssignModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isReadyToSave || saving}
                    className="px-5 py-2 text-sm font-semibold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    {saving ? 'Saving...' : 'Save Assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL 5: REASSIGN FACULTY MEMBER                          */}
      {/* ========================================================= */}
      {reassignModalOpen && reassignTargetAsgn && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Reassign Faculty Member
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Replace the faculty member assigned to this curriculum slot without affecting subject or class identity.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleConfirmReassign} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Class Section:</span>
                  <span className="font-bold text-slate-800">
                    {(() => {
                      const c = classes.find(cl => cl.classId === reassignTargetAsgn.classId);
                      return c ? `${c.yearOfStudy} — Sec ${c.section}` : reassignTargetAsgn.classId;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Semester:</span>
                  <span className="font-semibold text-slate-800">{reassignTargetAsgn.semester || 'Semester 1'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Curriculum Subject:</span>
                  <span className="font-bold text-slate-900">
                    {(() => {
                      const s = subjects.find(sub => sub.subjectId === reassignTargetAsgn.subjectId);
                      return s ? `${s.name} (${s.code})` : reassignTargetAsgn.subjectId;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Currently Assigned:</span>
                  <span className="font-bold text-[#3431B7]">
                    {(() => {
                      const st = allCollegeStaff.find(s => s.memberId === reassignTargetAsgn.memberId) || deptStaff.find(s => s.memberId === reassignTargetAsgn.memberId);
                      return `${st?.displayName || reassignTargetAsgn.memberId} (${reassignTargetAsgn.memberId})`;
                    })()}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Select Replacement Faculty Member
                </label>
                <select
                  value={reassignNewMemberId}
                  onChange={(e) => setReassignNewMemberId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                >
                  <optgroup label="Department Faculty">
                    {deptStaff.filter(st => st.memberId !== reassignTargetAsgn.memberId).map(st => (
                      <option key={st.memberId} value={st.memberId}>
                        {st.displayName} ({st.memberId})
                      </option>
                    ))}
                  </optgroup>
                  {allCollegeStaff.filter(s => !deptStaff.some(ds => ds.memberId === s.memberId) && s.memberId !== reassignTargetAsgn.memberId).length > 0 && (
                    <optgroup label="Cross-Department Faculty (College Directory)">
                      {allCollegeStaff
                        .filter(s => !deptStaff.some(ds => ds.memberId === s.memberId) && s.memberId !== reassignTargetAsgn.memberId)
                        .map(st => (
                          <option key={st.memberId} value={st.memberId}>
                            {st.displayName} ({st.memberId}) — Cross-Dept Link
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Reassignment updates the active teaching slot in-place. Previously published timetables remain immutable in history.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setReassignModalOpen(false);
                    setReassignTargetAsgn(null);
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !reassignNewMemberId || reassignNewMemberId === reassignTargetAsgn.memberId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{saving ? 'Reassigning...' : 'Confirm Reassignment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: STAFF PROFILE POPUP (Phase 3 & Workstream A2)    */}
      {/* ========================================================= */}
      {selectedProfileStaff && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header / Avatar / Identity */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#29229D] via-[#322BB7] to-[#3F35C8] text-white flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
                  {selectedProfileStaff.initials || selectedProfileStaff.staffName?.charAt(0)?.toUpperCase() || 'F'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                      {selectedProfileStaff.displayName}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        selectedProfileStaff.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {selectedProfileStaff.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {selectedProfileStaff.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-mono text-xs font-bold text-[#3431B7] bg-[#EEF0FA] px-2.5 py-0.5 rounded-md">
                      {selectedProfileStaff.memberId}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {selectedProfileStaff.designation || 'Assistant Professor'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedProfileStaff(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Information Cards */}
            <div className="space-y-3 py-2 border-y border-slate-100 my-4 text-xs">
              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Phone Number</span>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selectedProfileStaff.phoneNumber || selectedProfileStaff.phone || 'Not configured'}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Email Address</span>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{selectedProfileStaff.email || 'Not configured'}</span>
                  </div>
                </div>
              </div>

              {/* Department Affiliation */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Department Affiliation</span>
                <div className="font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-[#3431B7]" />
                  <span>
                    Primary Department: {department.name} ({department.code})
                  </span>
                </div>
              </div>

              {/* Qualified Subjects List */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Qualified Subjects</span>
                  <span className="text-[10px] font-bold text-[#3431B7]">
                    {(selectedProfileStaff.subjectIds || []).length} Courses Eligible
                  </span>
                </div>
                {(() => {
                  const qSubjIds = Array.isArray(selectedProfileStaff.subjectIds) ? selectedProfileStaff.subjectIds : [];
                  if (qSubjIds.length === 0) {
                    return <p className="text-slate-400 italic">No qualified curriculum subjects linked to this faculty profile.</p>;
                  }
                  return (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {qSubjIds.map((sId) => {
                        const subj = subjectMap.get(sId);
                        return (
                          <div
                            key={sId}
                            className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-[#3431B7] shrink-0">{subj ? subj.code : sId}</span>
                              <span className="font-semibold text-slate-800 truncate">{subj ? subj.name : 'Curriculum Course'}</span>
                            </div>
                            {subj && (
                              <span className="text-[11px] text-slate-500 shrink-0 ml-2">
                                {subj.type} • {subj.weeklyHours}h/wk
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                onClick={() => handleDeleteStaff(selectedProfileStaff)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Faculty</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const m = selectedProfileStaff;
                    setSelectedProfileStaff(null);
                    handleToggleStaffStatus(m);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{selectedProfileStaff.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</span>
                </button>

                <button
                  onClick={() => {
                    const m = selectedProfileStaff;
                    setSelectedProfileStaff(null);
                    openEditStaffModal(m);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
