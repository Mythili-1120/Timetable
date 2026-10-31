'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getDepartmentById } from '../../../../lib/services/departmentService';
import {
  getAllStaff,
  getStaffByDepartment,
  createStaff,
  updateStaff,
  archiveStaff,
  linkStaffToDepartment
} from '../../../../lib/services/staffService';
import {
  getAllSubjects,
  createSubject,
  updateSubject,
  archiveSubject
} from '../../../../lib/services/subjectService';
import {
  getAllClasses,
  createClass,
  updateClass
} from '../../../../lib/services/classService';
import {
  getAssignments,
  createAssignment,
  deleteAssignment,
  reassignStaff,
  getSemestersForYear
} from '../../../../lib/services/assignmentService';
import {
  Department,
  Staff,
  Subject,
  ClassSection,
  TeachingAssignment
} from '../../../../types';
import { useAuth } from '../../../../lib/context/AuthContext';
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
  ArrowRightLeft
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

  const [activeTab, setActiveTab] = useState<'overview' | 'staff' | 'subjects' | 'years' | 'assignments'>('overview');
  const [loading, setLoading] = useState(true);

  // Master Data States
  const [department, setDepartment] = useState<Department | null>(null);
  const [deptStaff, setDeptStaff] = useState<Staff[]>([]);
  const [allCollegeStaff, setAllCollegeStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);

  // Search & Filters
  const [staffSearch, setStaffSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectYearFilter, setSubjectYearFilter] = useState<string>('ALL');
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
  const [staffDesignation, setStaffDesignation] = useState('Assistant Professor');
  const [selectedExistingStaffId, setSelectedExistingStaffId] = useState('');

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjCode, setSubjCode] = useState('');
  const [subjName, setSubjName] = useState('');
  const [subjType, setSubjType] = useState<'Theory' | 'Lab'>('Theory');
  const [subjHours, setSubjHours] = useState(4);
  const [subjLabBlock, setSubjLabBlock] = useState(4);
  const [subjYearOfStudy, setSubjYearOfStudy] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [secYear, setSecYear] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [secName, setSecName] = useState('A');
  const [secStrength, setSecStrength] = useState(60);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignSubjId, setAssignSubjId] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignHours, setAssignHours] = useState(4);

  // Common UI State
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadAll = async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [dept, dStaff, allSt, subjs, cls, asgns] = await Promise.all([
        getDepartmentById(departmentId),
        getStaffByDepartment(departmentId),
        getAllStaff(true),
        getAllSubjects(departmentId, true),
        getAllClasses(departmentId, undefined, true),
        getAssignments({ departmentId })
      ]);

      setDepartment(dept);
      // Include any staff whose primary department is this department
      const combinedStaffMap = new Map<string, Staff>();
      dStaff.forEach(s => combinedStaffMap.set(s.memberId, s));
      allSt.filter(s => s.primaryDepartmentId === departmentId).forEach(s => combinedStaffMap.set(s.memberId, s));
      setDeptStaff(Array.from(combinedStaffMap.values()));

      setAllCollegeStaff(allSt);
      setSubjects(subjs);
      setClasses(cls);
      setAssignments(asgns);

      if (cls.length > 0 && !assignClassId) setAssignClassId(cls[0].classId);
      if (subjs.length > 0 && !assignSubjId) setAssignSubjId(subjs[0].subjectId);
    } catch (err: any) {
      console.error('Failed to load department workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [departmentId]);

  // -------------------------------------------------------------
  // STAFF HANDLERS (Create / Link / Edit / Archive)
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
      setSelectedExistingStaffId('');
      await loadAll();
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
          await loadAll();
        }
      } else {
        await updateStaff(member.memberId, { status: 'ACTIVE' }, user.uid);
        await loadAll();
      }
    } catch (err: any) {
      alert(`Error updating staff: ${err?.message || 'Permission denied'}`);
    }
  };

  // -------------------------------------------------------------
  // SUBJECT HANDLERS (Create / Edit / Archive)
  // -------------------------------------------------------------
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!subjCode.trim() || !subjName.trim()) {
      setModalError('Subject code and title are required.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      if (editingSubject) {
        await updateSubject(
          editingSubject.subjectId,
          {
            code: subjCode.toUpperCase().trim(),
            name: subjName.trim(),
            type: subjType,
            weeklyHours: Number(subjHours),
            labBlockHours: subjType === 'Lab' ? Number(subjLabBlock) : undefined,
            yearOfStudy: subjYearOfStudy
          },
          user.uid
        );
      } else {
        await createSubject(
          {
            code: subjCode.trim().toUpperCase(),
            name: subjName.trim(),
            type: subjType,
            weeklyHours: Number(subjHours),
            labBlockHours: subjType === 'Lab' ? Number(subjLabBlock) : undefined,
            departmentId,
            academicYear: '2025–2026',
            yearOfStudy: subjYearOfStudy
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
      await loadAll();
    } catch (err: any) {
      console.error('Error saving subject:', err);
      setModalError(err?.message || 'Failed to save subject.');
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
          await loadAll();
        }
      } else {
        await updateSubject(s.subjectId, { status: 'ACTIVE' }, user.uid);
        await loadAll();
      }
    } catch (err: any) {
      alert(`Error updating subject: ${err?.message || 'Permission denied'}`);
    }
  };

  // -------------------------------------------------------------
  // CLASS / SECTION HANDLERS (Create / Toggle)
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
          section: secName.trim().toUpperCase(),
          strength: Number(secStrength) || 60
        },
        user.uid
      );

      setSectionModalOpen(false);
      setSecName('A');
      await loadAll();
    } catch (err: any) {
      console.error('Error saving section:', err);
      setModalError(err?.message || 'Failed to create section.');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // TEACHING ASSIGNMENTS HANDLERS (Create / Delete)
  // -------------------------------------------------------------
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!assignClassId || !assignSubjId || !assignMemberId) {
      setModalError('Please select a class section, subject, and faculty member.');
      return;
    }

    const selectedSubj = subjects.find(s => s.subjectId === assignSubjId);
    setSaving(true);
    setModalError(null);
    try {
      await createAssignment(
        {
          memberId: assignMemberId,
          departmentId,
          subjectId: assignSubjId,
          classId: assignClassId,
          weeklyHours: Number(assignHours) || selectedSubj?.weeklyHours || 4,
          type: selectedSubj?.type || 'Theory'
        },
        user.uid
      );

      setAssignModalOpen(false);
      await loadAll();
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
      await loadAll();
    } catch (err: any) {
      alert(`Error deleting assignment: ${err?.message || 'Permission denied'}`);
    }
  };

  const openReassignModal = (asgn: TeachingAssignment) => {
    setReassignTargetAsgn(asgn);
    const otherStaff = allCollegeStaff.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE')
      || deptStaff.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE');
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
      await loadAll();
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

  const filteredSubjects = subjects.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      s.code.toLowerCase().includes(subjectSearch.toLowerCase());
    const matchesYear = subjectYearFilter === 'ALL' || s.yearOfStudy === subjectYearFilter;
    return matchesSearch && matchesYear;
  });

  const filteredAssignments = assignments.filter(a => {
    const matchesClass = assignmentClassFilter === 'ALL' || a.classId === assignmentClassFilter;
    const matchesSemester = assignmentSemesterFilter === 'ALL' || a.semester === assignmentSemesterFilter;
    return matchesClass && matchesSemester;
  });

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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Department Master</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex items-center justify-between no-print">
        <Link
          href="/departments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Departments</span>
        </Link>
        <span className="font-mono text-xs font-semibold text-slate-400">
          ID: {department.departmentId}
        </span>
      </div>

      {/* Department Hero Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
            {department.code}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-md border border-brand-200">
                {department.code}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  department.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {department.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {department.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              {department.name}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              {department.description || 'Undergraduate and postgraduate degree programs with autonomous curriculum and laboratory facilities.'}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              setEditingStaff(null);
              setStaffAddMode('new');
              setStaffName('');
              setStaffInitials('');
              setStaffEmail('');
              setStaffPhone('');
              setModalError(null);
              setStaffModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-brand-600" />
            <span>Add Faculty</span>
          </button>
          <button
            onClick={() => {
              setEditingSubject(null);
              setSubjCode('');
              setSubjName('');
              setSubjHours(4);
              setSubjLabBlock(4);
              setModalError(null);
              setSubjectModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span>Add Subject</span>
          </button>
          <button
            onClick={() => {
              setSecYear('1st Year');
              setSecName('A');
              setSecStrength(60);
              setModalError(null);
              setSectionModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Section</span>
          </button>
          <Link
            href="/generator"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Generate Timetable</span>
          </Link>
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 py-3 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 py-3 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'staff'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff ({deptStaff.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 py-3 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'subjects'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Subjects ({subjects.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('years')}
            className={`flex items-center gap-2 py-3 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'years'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Academic Years & Sections ({classes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex items-center gap-2 py-3 border-b-2 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'assignments'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Teaching Assignments ({assignments.length})</span>
          </button>
        </nav>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Faculty Members</span>
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{deptStaff.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                Canonical department faculty
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Subjects Master</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{subjects.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                Theory & laboratory courses
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Class Sections</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{classes.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                Across 4 undergraduate years
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Teaching Mappings</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900">{assignments.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                Faculty-subject allocations
              </div>
            </div>
          </div>

          {/* Academic Years Cohort Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Academic Year Levels & Cohorts</h3>
                <p className="text-xs text-slate-500">
                  Four-year undergraduate degree progression for {department.name}
                </p>
              </div>
              <button
                onClick={() => setActiveTab('years')}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Manage Sections</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {UNDERGRADUATE_YEARS.map((yr) => {
                const yearClasses = classes.filter(c => c.yearOfStudy === yr);
                const yearSubjects = subjects.filter(s => s.yearOfStudy === yr);

                return (
                  <div key={yr} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-sm">{yr}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                        {yearClasses.length} {yearClasses.length === 1 ? 'Section' : 'Sections'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sections:</span>
                        <span className="font-bold text-slate-800">
                          {yearClasses.length > 0
                            ? yearClasses.map(c => `Sec ${c.section}`).join(', ')
                            : 'None configured'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tagged Subjects:</span>
                        <span className="font-medium text-slate-800">{yearSubjects.length} courses</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSecYear(yr);
                        setSecName('A');
                        setSecStrength(60);
                        setModalError(null);
                        setSectionModalOpen(true);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors text-center cursor-pointer"
                    >
                      + Add Section
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: STAFF (DEPARTMENT FACULTY DIRECTORY) */}
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
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingStaff(null);
                  setStaffAddMode('new');
                  setStaffName('');
                  setStaffInitials('');
                  setStaffEmail('');
                  setStaffPhone('');
                  setModalError(null);
                  setStaffModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
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

          {/* Faculty Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Permanent ID</th>
                    <th className="py-3 px-4">Faculty Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Contact</th>
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
                    filteredStaff.map((member) => (
                      <tr key={member.memberId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-bold text-brand-700 bg-brand-50/40 w-36">
                          {member.memberId}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {member.displayName}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{member.designation}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">
                          {member.email || member.phone || '—'}
                        </td>
                        <td className="py-3 px-4">
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
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => {
                              setEditingStaff(member);
                              setStaffAddMode('new');
                              setStaffName(member.staffName);
                              setStaffInitials(member.initials || '');
                              setStaffEmail(member.email || '');
                              setStaffPhone(member.phone || '');
                              setStaffDesignation(member.designation);
                              setModalError(null);
                              setStaffModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
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
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: SUBJECTS */}
      {/* ========================================================= */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by code or title..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <select
                value={subjectYearFilter}
                onChange={(e) => setSubjectYearFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="ALL">All Academic Years</option>
                {UNDERGRADUATE_YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setEditingSubject(null);
                setSubjCode('');
                setSubjName('');
                setSubjHours(4);
                setSubjLabBlock(4);
                setModalError(null);
                setSubjectModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Subject</span>
            </button>
          </div>

          {/* Subjects Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Subject ID</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Course Title</th>
                    <th className="py-3 px-4">Year Level</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Weekly Hours</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                        No subjects configured for {department.name}. Click "Add Subject" to create curriculum courses.
                      </td>
                    </tr>
                  ) : (
                    filteredSubjects.map((s) => (
                      <tr key={s.subjectId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{s.subjectId}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{s.code}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{s.name}</td>
                        <td className="py-3 px-4 text-slate-600 text-xs">{s.yearOfStudy || 'General'}</td>
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
                              setSubjYearOfStudy(s.yearOfStudy || '1st Year');
                              setModalError(null);
                              setSubjectModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
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
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: ACADEMIC YEARS & SECTIONS */}
      {/* ========================================================= */}
      {activeTab === 'years' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Undergraduate Year Cohorts & Sections</h3>
              <p className="text-xs text-slate-500">
                Configure student class divisions (Sections A, B, C) for each academic level
              </p>
            </div>
            <button
              onClick={() => {
                setSecYear('1st Year');
                setSecName('A');
                setSecStrength(60);
                setModalError(null);
                setSectionModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Section</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {UNDERGRADUATE_YEARS.map((yr) => {
              const yearClasses = classes.filter(c => c.yearOfStudy === yr);

              return (
                <div key={yr} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-sm">
                        {yr[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{yr}</h4>
                        <span className="text-xs text-slate-400">Academic Year 2025–2026</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSecYear(yr);
                        setSecName(String.fromCharCode(65 + yearClasses.length));
                        setSecStrength(60);
                        setModalError(null);
                        setSectionModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Section</span>
                    </button>
                  </div>

                  {yearClasses.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                      No sections configured for {yr}. Click "Add Section" above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {yearClasses.map((cls) => {
                        const classAssignments = assignments.filter(a => a.classId === cls.classId);
                        const totalHours = classAssignments.reduce((acc, a) => acc + (a.weeklyHours || 0), 0);

                        return (
                          <div
                            key={cls.classId}
                            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 flex items-center justify-between transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 text-sm">
                                  Section {cls.section}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">
                                  ({cls.strength} Students)
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Allocated Workload: <span className="font-bold text-brand-700">{totalHours} hrs/week</span> across {classAssignments.length} courses
                              </div>
                            </div>

                            <Link
                              href="/generator"
                              className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs hover:border-brand-300 transition-colors"
                            >
                              <Cpu className="w-3.5 h-3.5" />
                              <span>Generate</span>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: TEACHING ASSIGNMENTS */}
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
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-48"
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
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            <button
              onClick={() => {
                if (classes.length === 0) {
                  alert('Please configure at least one class section in Academic Years first.');
                  return;
                }
                if (subjects.length === 0) {
                  alert('Please configure at least one subject in Subjects first.');
                  return;
                }
                if (deptStaff.length === 0) {
                  alert('Please link at least one faculty member in Staff first.');
                  return;
                }
                setAssignClassId(classes[0].classId);
                setAssignSubjId(subjects[0].subjectId);
                setAssignMemberId(deptStaff[0].memberId);
                setAssignHours(subjects[0].weeklyHours || 4);
                setModalError(null);
                setAssignModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Map Faculty to Subject</span>
            </button>
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
                            <div className="font-bold text-brand-700">
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
      {/* MODAL 1: ADD / EDIT STAFF */}
      {/* ========================================================= */}
      {staffModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingStaff ? `Edit Faculty — ${editingStaff.memberId}` : 'Add Department Faculty'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {editingStaff
                ? 'Update contact details or designation. Member ID remains permanent.'
                : 'Create a new faculty profile or link an existing faculty member from another department.'}
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            {/* Mode Selector for Add */}
            {!editingStaff && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStaffAddMode('new')}
                  className={`py-2 px-3 rounded-lg transition-all cursor-pointer ${
                    staffAddMode === 'new'
                      ? 'bg-white text-brand-700 shadow-xs'
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
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ramesh, Priya, Suresh"
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Designation
                      </label>
                      <input
                        type="text"
                        value={staffDesignation}
                        onChange={(e) => setStaffDesignation(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        value={staffPhone}
                        onChange={(e) => setStaffPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="faculty@ssmiet.ac.in"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingStaff ? 'Save Changes' : staffAddMode === 'new' ? 'Generate ID & Save' : 'Link Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: ADD / EDIT SUBJECT */}
      {/* ========================================================= */}
      {subjectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingSubject ? 'Edit Subject' : `Add Subject to ${department.code}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure curriculum course code, required weekly hours, and laboratory blocks.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSubject} className="space-y-4">
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Year Level
                  </label>
                  <select
                    value={subjYearOfStudy}
                    onChange={(e) => setSubjYearOfStudy(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {UNDERGRADUATE_YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Course Type
                  </label>
                  <select
                    value={subjType}
                    onChange={(e) => setSubjType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Laboratory</option>
                  </select>
                </div>
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {subjType === 'Lab' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Continuous Lab Block (Hours)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="4"
                    value={subjLabBlock}
                    onChange={(e) => setSubjLabBlock(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Placed continuously in the schedule without bell break splits.
                  </p>
                </div>
              )}

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
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: ADD CLASS SECTION */}
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Student Strength
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={secStrength}
                  onChange={(e) => setSecStrength(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
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
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: TEACHING ASSIGNMENT */}
      {/* ========================================================= */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Map Faculty to Subject
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Allocate weekly teaching hours to department faculty member.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Class Section
                </label>
                <select
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {classes.map(c => (
                    <option key={c.classId} value={c.classId}>
                      {c.yearOfStudy} — Section {c.section}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Subject Course
                </label>
                <select
                  value={assignSubjId}
                  onChange={(e) => {
                    setAssignSubjId(e.target.value);
                    const s = subjects.find(sub => sub.subjectId === e.target.value);
                    if (s) setAssignHours(s.weeklyHours);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {subjects.map(s => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.code} — {s.name} ({s.type}, {s.weeklyHours}h)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Faculty Member
                </label>
                <select
                  value={assignMemberId}
                  onChange={(e) => setAssignMemberId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {deptStaff.map(st => (
                    <option key={st.memberId} value={st.memberId}>
                      {st.displayName} ({st.memberId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Weekly Teaching Hours
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={assignHours}
                  onChange={(e) => setAssignHours(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Mapping...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================= */}
      {/* MODAL 5: REASSIGN FACULTY MEMBER */}
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
                  <span className="font-bold text-brand-700">
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
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
    </div>
  );
}
