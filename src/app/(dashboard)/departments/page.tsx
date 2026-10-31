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
  XCircle,
  GraduationCap
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

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Department Master</h1>
          <p className="text-sm text-slate-500">
            Select a department to manage its faculty, curriculum, academic years, and class sections
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
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Department</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search departments by code, title, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active Only</option>
          <option value="ARCHIVED">Archived Only</option>
        </select>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && departments.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Academic Departments</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Get started by creating your college's first department (e.g. CSE, ECE, MECH, AIDS).
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Department</span>
          </button>
        </div>
      )}

      {/* No Results from Filter */}
      {!loading && departments.length > 0 && filteredDepts.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          No departments match your filter criteria.
        </div>
      )}

      {/* EXACT 2-COLUMN DEPARTMENT CARDS GRID */}
      {!loading && filteredDepts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredDepts.map((dept) => {
            // Canonical staff count (including multi-dept links) and subject count
            const deptStaffCount = deptStaffCounts.get(dept.departmentId) || 0;
            const deptSubjectCount = deptSubjectCounts.get(dept.departmentId) || 0;

            const isArchived = dept.status === 'ARCHIVED';

            return (
              <div
                key={dept.departmentId}
                className={`relative group bg-white rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden ${
                  isArchived
                    ? 'border-slate-200 opacity-75'
                    : 'border-slate-200 hover:border-brand-300'
                }`}
              >
                {/* Card Top / Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                        {dept.code.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                            {dept.code}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              !isArchived
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {!isArchived ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {dept.status}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mt-1 leading-snug group-hover:text-brand-600 transition-colors">
                          {dept.name}
                        </h3>
                      </div>
                    </div>

                    {/* Quick Action Icons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => openEdit(e, dept)}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit Department"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleToggleStatus(e, dept)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title={!isArchived ? 'Archive Department' : 'Reactivate Department'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 line-clamp-2 min-h-8 mb-4">
                    {dept.description || 'Undergraduate and postgraduate engineering degree programs with autonomous curriculum.'}
                  </p>

                  {/* Stats Badges */}
                  <div className="grid grid-cols-3 gap-2 py-3 px-3.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-600 shrink-0" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Faculty</div>
                        <div className="font-bold text-slate-800">{deptStaffCount}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Subjects</div>
                        <div className="font-bold text-slate-800">{deptSubjectCount}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Levels</div>
                        <div className="font-bold text-slate-800">4 Years</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer / Detail Navigation Link */}
                <div className="px-6 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    ID: {dept.departmentId}
                  </span>
                  <Link
                    href={`/departments/${dept.departmentId}`}
                    prefetch={true}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors cursor-pointer group-hover:translate-x-0.5 duration-150"
                  >
                    <span>Manage Department</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Department Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingDept ? 'Edit Department' : 'Add New Department'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure department code, institutional name, and optional description.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Department Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE, AIDS, ECE, MECH"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Department Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science and Engineering"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Department of Computer Science and Engineering offering B.E. & M.E. programs."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
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
