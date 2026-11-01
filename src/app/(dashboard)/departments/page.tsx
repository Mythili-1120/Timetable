'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAllDepartments,
  getCachedDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  deleteDepartment
} from '../../../lib/services/departmentService';
import {
  getAllDepartmentStaffCounts,
  getCachedDepartmentStaffCounts
} from '../../../lib/services/staffService';
import {
  getAllDepartmentSubjectCounts,
  getCachedDepartmentSubjectCounts
} from '../../../lib/services/subjectService';
import { Department } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import DepartmentIcon from '../../../components/DepartmentIcon';
import {
  Building2,
  Plus,
  Search,
  Users,
  BookOpen,
  ArrowRight,
  Edit2,
  Archive,
  GraduationCap,
  Trash2,
  AlertTriangle
} from 'lucide-react';

export default function DepartmentsPage() {
  // Synchronous cache access: instant 0ms initial render if data was already loaded
  const initialDepts = getCachedDepartments();
  const initialStaffCounts = getCachedDepartmentStaffCounts({ activeOnly: true });
  const initialSubjCounts = getCachedDepartmentSubjectCounts({ activeOnly: true });

  const [departments, setDepartments] = useState<Department[]>(() => initialDepts || []);
  const [deptStaffCounts, setDeptStaffCounts] = useState<Map<string, number>>(() => initialStaffCounts || new Map());
  const [deptSubjectCounts, setDeptSubjectCounts] = useState<Map<string, number>>(() => initialSubjCounts || new Map());
  const [loading, setLoading] = useState(() => !initialDepts);

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

  // Department Delete modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { user } = useAuth();

  const loadData = async (forceRefresh = false) => {
    // Only show loading skeleton if we have no data at all
    if (departments.length === 0 && !getCachedDepartments()) {
      setLoading(true);
    }
    try {
      const [deptData, stCounts, subCounts] = await Promise.all([
        getAllDepartments(forceRefresh),
        getAllDepartmentStaffCounts({ activeOnly: true, forceRefresh }),
        getAllDepartmentSubjectCounts({ activeOnly: true, forceRefresh })
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
    loadData(false);
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
      await loadData(true);
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
          await loadData(true);
        }
      } else {
        await updateDepartment(dept.departmentId, { status: 'ACTIVE' }, user.uid);
        await loadData(true);
      }
    } catch (err: any) {
      alert(`Error updating department status: ${err?.message || 'Permission denied'}`);
    }
  };

  const handleDeleteDept = async () => {
    if (!deptToDelete || !user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDepartment(deptToDelete.departmentId, user.uid);
      setDeleteConfirmOpen(false);
      setDeptToDelete(null);
      await loadData(true);
    } catch (err: any) {
      console.error('Failed to delete department:', err);
      setDeleteError(err?.message || 'Failed to delete department.');
    } finally {
      setDeleting(false);
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-white border border-[#E3E5F0] animate-pulse p-5"
            />
          ))}
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

      {/* 6. MAIN FULL-WIDTH TWO-COLUMN DEPARTMENT GRID */}
      {!loading && filteredDepts.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDepts.map((dept) => {
              const deptStaffCount = deptStaffCounts.get(dept.departmentId) || 0;
              const deptSubjectCount = deptSubjectCounts.get(dept.departmentId) || 0;
              const isArchived = dept.status === 'ARCHIVED';
              const progress = getDeptSetupProgress(deptStaffCount, deptSubjectCount);

              return (
                <div
                  key={dept.departmentId}
                  className={`bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4 ${
                    isArchived ? 'opacity-75' : ''
                  }`}
                >
                  {/* Top Cluster: Department Icon + Details + Progress */}
                  <div className="flex items-start gap-4 min-w-0">
                    {/* Big Department Icon Badge with Automatic Dynamic Icon */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#3B34C4] to-[#251F91] text-white flex items-center justify-center shadow-inner shrink-0 mt-0.5">
                      <DepartmentIcon
                        name={dept.name}
                        code={dept.code}
                        className="w-7 h-7 sm:w-8 sm:h-8 text-white stroke-[2]"
                      />
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
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
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

                  {/* Bottom Action Footer Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        ID: {dept.departmentId}
                      </span>
                      <div className="flex items-center gap-1">
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
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeptToDelete(dept);
                            setDeleteError(null);
                            setDeleteConfirmOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Department Permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <Link
                      href={`/departments/${dept.departmentId}`}
                      prefetch={true}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-all shadow-xs cursor-pointer group"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dashed Add Department Card Button spanning full width */}
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

      {/* 8. PERMANENT DELETE CONFIRMATION DIALOG */}
      {deleteConfirmOpen && deptToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-rose-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900">
                  Delete Department: {deptToDelete.code}
                </h3>
                <p className="text-xs text-slate-500">
                  {deptToDelete.name} ({deptToDelete.departmentId})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 mb-4 leading-relaxed">
              <span className="font-bold">Permanent Operation Warning: </span>
              Deleting a department removes it permanently from Firestore. If this department has registered faculty, subjects, class sections, teaching assignments, or published timetables, deletion will be blocked to preserve institutional integrity.
            </div>

            {deleteError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 whitespace-pre-line leading-relaxed font-medium">
                  {deleteError}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeptToDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDept}
                disabled={deleting}
                className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying & Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Permanent Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
