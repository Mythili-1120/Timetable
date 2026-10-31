'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment
} from '../../../lib/services/departmentService';
import { getAllDepartmentStaffCounts } from '../../../lib/services/staffService';
import { getAllDepartmentSubjectCounts } from '../../../lib/services/subjectService';
import { Department } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Building2,
  Plus,
  Search,
  Users,
  BookOpen,
  ArrowRight,
  Edit2,
  Archive,
  CheckCircle2,
  GraduationCap,
  Check,
  Layers,
  Sparkles
} from 'lucide-react';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptStaffCounts, setDeptStaffCounts] = useState<Map<string, number>>(new Map());
  const [deptSubjectCounts, setDeptSubjectCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

  // Modal dialog state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [deptData, stCounts, subCounts] = await Promise.all([
        getAllDepartments(true),
        getAllDepartmentStaffCounts({ activeOnly: true, forceRefresh: true }),
        getAllDepartmentSubjectCounts({ activeOnly: true, forceRefresh: true })
      ]);
      setDepartments(deptData);
      setDeptStaffCounts(stCounts);
      setDeptSubjectCounts(subCounts);
    } catch (err: any) {
      console.error('Failed to load departments data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Department Code and Full Name are required.');
      return;
    }
    if (!user) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingDept) {
        await updateDepartment(
          editingDept.departmentId,
          {
            code: code.toUpperCase().trim(),
            name: name.trim(),
            description: description.trim()
          },
          user.uid
        );
      } else {
        await createDepartment(
          {
            code: code.trim(),
            name: name.trim(),
            description: description.trim()
          },
          user.uid
        );
      }

      setCode('');
      setName('');
      setDescription('');
      setEditingDept(null);
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving department:', err);
      setError(err?.message || 'Failed to save department.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (e: React.MouseEvent, dept: Department) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    try {
      if (dept.status === 'ACTIVE') {
        if (confirm(`Archive ${dept.name}? Historical timetable references will be safely preserved.`)) {
          await archiveDepartment(dept.departmentId, user.uid);
          await loadData();
        }
      } else {
        await updateDepartment(dept.departmentId, { status: 'ACTIVE' }, user.uid);
        await loadData();
      }
    } catch (err: any) {
      alert(`Error updating department status: ${err?.message || 'Permission denied'}`);
    }
  };

  const openEdit = (e: React.MouseEvent, dept: Department) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setDescription(dept.description || '');
    setError(null);
    setModalOpen(true);
  };

  // Filter departments
  const filteredDepts = departments.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      (d.description && d.description.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate setup progress for a department
  const getDeptSetupProgress = (staffCount: number, subjectCount: number) => {
    let completed = 0;
    let nextStep = 'Add faculty';

    if (staffCount > 0) {
      completed++;
      nextStep = 'Add subjects';
    }
    if (subjectCount > 0) {
      completed++;
      nextStep = 'Create class sections';
    }
    if (staffCount > 0 && subjectCount > 0) {
      completed++;
      nextStep = 'Map faculty to subjects';
    }
    if (staffCount >= 2 && subjectCount >= 3) {
      completed++;
      nextStep = 'Timetable ready';
    }

    return { completed, total: 4, nextStep };
  };

  // Global guide calculations
  const totalFacultyCount = Array.from(deptStaffCounts.values()).reduce((a, b) => a + b, 0);
  const totalSubjectCount = Array.from(deptSubjectCounts.values()).reduce((a, b) => a + b, 0);

  const guideSteps = [
    {
      num: 1,
      title: 'Add faculty',
      desc: 'Create faculty profiles and assign their primary departments',
      done: totalFacultyCount > 0
    },
    {
      num: 2,
      title: 'Add subjects',
      desc: 'Define curriculum with theory, lab, and elective subjects',
      done: totalSubjectCount > 0
    },
    {
      num: 3,
      title: 'Create class sections',
      desc: 'Set up academic years, semesters, and student batches',
      done: departments.length > 0 && totalSubjectCount > 0
    },
    {
      num: 4,
      title: 'Map faculty to subjects',
      desc: 'Assign faculty members to their respective subjects and classes',
      done: totalFacultyCount > 0 && totalSubjectCount > 0
    },
    {
      num: 5,
      title: 'Generate timetable',
      desc: 'Run conflict-free scheduling and publish semester timetables',
      done: totalFacultyCount >= 4 && totalSubjectCount >= 6
    }
  ];

  const guideCompletedCount = guideSteps.filter((s) => s.done).length;
  const activeDeptsCount = departments.filter((d) => d.status === 'ACTIVE').length;
  const completedDeptsCount = departments.filter((d) => {
    const st = deptStaffCounts.get(d.departmentId) || 0;
    const sub = deptSubjectCounts.get(d.departmentId) || 0;
    return st > 0 && sub > 0;
  }).length;

  return (
    <div className="space-y-6">
      {/* 1. HERO BANNER - Exact SSM Reference Style */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#29229D] via-[#322BB7] to-[#3F35C8] p-6 sm:p-7 text-white shadow-sm">
        {/* Subtle decorative pills in top right */}
        <div className="absolute top-5 right-6 hidden md:flex items-center gap-1.5 opacity-60">
          <div className="h-1.5 w-7 rounded-full bg-white/40" />
          <div className="h-1.5 w-7 rounded-full bg-white/40" />
          <div className="h-1.5 w-7 rounded-full bg-white/40" />
          <div className="h-1.5 w-7 rounded-full bg-white/40" />
          <div className="h-1.5 w-7 rounded-full bg-white/40" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80 mb-1">
              <span>SSM Institute of Engineering and Technology (Autonomous)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Departments
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-white/85 leading-relaxed">
              Select a department to manage its faculty, curriculum, academic years and class sections.
            </p>
          </div>

          <button
            onClick={() => {
              setEditingDept(null);
              setCode('');
              setName('');
              setDescription('');
              setError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#322BB7] bg-white hover:bg-slate-50 transition-all shadow-sm shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Department</span>
          </button>
        </div>
      </div>

      {/* 2. SEARCH & STATUS SEGMENTED CONTROL BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input Box */}
        <div className="relative flex-1 bg-white border border-[#E3E5F0] rounded-2xl shadow-xs">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search departments by code, title, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-xs sm:text-sm rounded-2xl bg-transparent focus:outline-none text-slate-800 placeholder-slate-400"
          />
        </div>

        {/* Status Segmented Pill Control */}
        <div className="bg-white border border-[#E3E5F0] rounded-2xl p-1 flex items-center shadow-xs self-start sm:self-auto shrink-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#28229E] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            All Statuses
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-[#28229E] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('ARCHIVED')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ARCHIVED'
                ? 'bg-[#28229E] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {/* 3. LOADING SKELETONS */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-36 rounded-2xl bg-white border border-[#E3E5F0] animate-pulse p-6"
              />
            ))}
          </div>
          <div className="lg:col-span-4 space-y-4">
            <div className="h-64 rounded-2xl bg-white border border-[#E3E5F0] animate-pulse p-6" />
            <div className="h-28 rounded-2xl bg-white border border-[#E3E5F0] animate-pulse p-6" />
          </div>
        </div>
      )}

      {/* 4. EMPTY STATE */}
      {!loading && departments.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-[#D2D6EC] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#EEF0FA] text-[#3431B7] flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Academic Departments</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
            Get started by creating your college&apos;s first department (e.g. CSE, ECE, MECH, AIDS).
            All faculty, subjects, and timetables are organized within each department.
          </p>
          <button
            onClick={() => {
              setEditingDept(null);
              setCode('');
              setName('');
              setDescription('');
              setError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Department</span>
          </button>
        </div>
      )}

      {/* 5. NO RESULTS FROM FILTER */}
      {!loading && departments.length > 0 && filteredDepts.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E3E5F0] p-8 text-center text-slate-500 text-sm">
          No departments match your search & filter criteria.
        </div>
      )}

      {/* 6. MAIN 2-COLUMN BODY LAYOUT */}
      {!loading && filteredDepts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Department Cards List + Add Card */}
          <div className="lg:col-span-8 space-y-4">
            {filteredDepts.map((dept) => {
              const deptStaffCount = deptStaffCounts.get(dept.departmentId) || 0;
              const deptSubjectCount = deptSubjectCounts.get(dept.departmentId) || 0;
              const isArchived = dept.status === 'ARCHIVED';
              const progress = getDeptSetupProgress(deptStaffCount, deptSubjectCount);

              return (
                <div
                  key={dept.departmentId}
                  className={`bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-5 ${
                    isArchived ? 'opacity-75' : ''
                  }`}
                >
                  {/* Left Cluster: Icon + Details + Progress */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* Big Department Icon Badge */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#3B34C4] to-[#251F91] text-white flex items-center justify-center font-extrabold text-sm sm:text-base tracking-wider shadow-inner shrink-0 mt-0.5">
                      {dept.code.slice(0, 4)}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Department Title + Code Badge + Status Pill */}
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                          {dept.name}
                        </h2>
                        <span className="font-mono text-xs font-bold text-slate-700 bg-[#EEF0FA] border border-[#E3E5F0] px-2 py-0.5 rounded-md">
                          {dept.code}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            !isArchived
                              ? 'bg-[#EBF8F0] text-[#137A3C] border border-[#CDEED8]'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              !isArchived ? 'bg-[#137A3C]' : 'bg-slate-400'
                            }`}
                          />
                          {dept.status}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-500 line-clamp-1 mb-3">
                        {dept.description ||
                          'Undergraduate and postgraduate engineering degree programs with autonomous curriculum.'}
                      </p>

                      {/* Metric Chips Row */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F5FB] border border-[#E3E5F0] text-xs font-semibold text-slate-700">
                          <Users className="w-3.5 h-3.5 text-[#3431B7]" />
                          <span>{deptStaffCount} Faculty</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F5FB] border border-[#E3E5F0] text-xs font-semibold text-slate-700">
                          <BookOpen className="w-3.5 h-3.5 text-[#3431B7]" />
                          <span>{deptSubjectCount} Subjects</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F5FB] border border-[#E3E5F0] text-xs font-semibold text-slate-700">
                          <GraduationCap className="w-3.5 h-3.5 text-[#3431B7]" />
                          <span>4 Years</span>
                        </span>
                      </div>

                      {/* Setup Progress Capsules Row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-bold text-slate-700 text-xs">Setup</span>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4].map((stepIdx) => {
                            const isFilled = stepIdx <= progress.completed;
                            return (
                              <div
                                key={stepIdx}
                                className={`h-1.5 w-7 sm:w-8 rounded-full transition-colors ${
                                  isFilled ? 'bg-[#3431B7]' : 'bg-[#E3E5F0]'
                                }`}
                              />
                            );
                          })}
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {progress.completed} of 4 done •{' '}
                          <span className="text-slate-700 font-semibold">{progress.nextStep}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Action Side: Open Button + Edit/Archive + ID */}
                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <Link
                      href={`/departments/${dept.departmentId}`}
                      prefetch={true}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-all shadow-xs cursor-pointer group"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => openEdit(e, dept)}
                        className="p-1.5 text-slate-400 hover:text-[#3431B7] hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Department"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleToggleStatus(e, dept)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        title={!isArchived ? 'Archive Department' : 'Reactivate Department'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="font-mono text-[10px] text-slate-400">
                      ID: {dept.departmentId}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Dashed Add Department Card Button */}
            <button
              onClick={() => {
                setEditingDept(null);
                setCode('');
                setName('');
                setDescription('');
                setError(null);
                setModalOpen(true);
              }}
              className="w-full border-2 border-dashed border-[#D2D6EC] hover:border-[#3431B7] bg-[#F7F8FD]/60 hover:bg-[#F2F4FD] rounded-2xl p-4 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm font-bold text-[#3431B7]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add another department</span>
            </button>
          </div>

          {/* RIGHT COLUMN: Guide & Summary Stats (32% width on desktop) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Card 1: Set up in 5 easy steps */}
            <div className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[#3431B7]" />
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  Set up in 5 easy steps
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Follow them in order to create your first timetable.
              </p>

              {/* Step Items List */}
              <div className="space-y-3.5">
                {guideSteps.map((step) => (
                  <div key={step.num} className="flex items-start gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        step.done
                          ? 'bg-[#EBF8F0] text-[#137A3C] border border-[#CDEED8]'
                          : 'bg-[#F4F5FB] text-slate-500 border border-[#E3E5F0]'
                      }`}
                    >
                      {step.done ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : step.num}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">{step.title}</div>
                      <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                        {step.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Summary */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span>Overall Setup Progress</span>
                  <span className="text-[#3431B7] font-bold">
                    {guideCompletedCount} of 5 done
                  </span>
                </div>
                <div className="h-2 w-full bg-[#E3E5F0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3431B7] rounded-full transition-all duration-300"
                    style={{ width: `${(guideCompletedCount / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Quick Summary Stats */}
            <div className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Overview
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 rounded-xl bg-[#F4F5FB] border border-[#E3E5F0]">
                  <div className="text-xl font-extrabold text-slate-900">
                    {departments.length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                    Departments
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F4F5FB] border border-[#E3E5F0]">
                  <div className="text-xl font-extrabold text-[#137A3C]">
                    {activeDeptsCount}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Active</div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F4F5FB] border border-[#E3E5F0]">
                  <div className="text-xl font-extrabold text-[#3431B7]">
                    {completedDeptsCount}/{departments.length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                    Setup Done
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. ADD / EDIT DEPARTMENT MODAL DIALOG */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E3E5F0] animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingDept ? 'Edit Department' : 'Add New Department'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure department code, institutional name, and optional description.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Department Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE, AIDS, ECE, MECH"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-[#E3E5F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3431B7] uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Department Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science and Engineering"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-[#E3E5F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Department of Computer Science and Engineering offering B.E. & M.E. programs."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-[#E3E5F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3431B7] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  {saving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
