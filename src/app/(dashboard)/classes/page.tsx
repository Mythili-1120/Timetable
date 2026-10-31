'use client';

import React, { useEffect, useState } from 'react';
import { getAllClasses, createClass, updateClass } from '../../../lib/services/classService';
import { getAllDepartments } from '../../../lib/services/departmentService';
import { ClassSection, Department } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { GraduationCap, Plus, Edit2, Archive, CheckCircle2, XCircle } from 'lucide-react';

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSection | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [academicYear, setAcademicYear] = useState('2025–2026');
  const [yearOfStudy, setYearOfStudy] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [section, setSection] = useState('A');
  const [strength, setStrength] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([getAllClasses(undefined, undefined, true), getAllDepartments(true)]);
      setClasses(c);
      setDepartments(d);
      if (d.length > 0 && !departmentId) setDepartmentId(d[0].departmentId);
    } catch (err: any) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId) {
      setError('Please select a department.');
      return;
    }
    if (!section.trim()) {
      setError('Section is required.');
      return;
    }
    if (!user) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingClass) {
        await updateClass(editingClass.classId, {
          strength: Number(strength)
        }, user.uid);
      } else {
        await createClass({
          departmentId,
          academicYear,
          yearOfStudy,
          section: section.trim().toUpperCase(),
          strength: Number(strength)
        }, user.uid);
      }

      setEditingClass(null);
      setSection('A');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving class:', err);
      setError(err?.message || 'Failed to save class section.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (cls: ClassSection) => {
    if (!user) return;
    try {
      const newStatus = cls.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await updateClass(cls.classId, { status: newStatus }, user.uid);
      await loadData();
    } catch (err: any) {
      alert(`Error updating class status: ${err?.message || 'Permission denied'}`);
    }
  };

  const filteredClasses = classes.filter(c => deptFilter === 'ALL' || c.departmentId === deptFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Classes & Sections</h1>
          <p className="text-sm text-slate-500">Configure academic year cohorts, study levels, and section divisions</p>
        </div>
        <button
          onClick={() => {
            setEditingClass(null);
            setSection('A');
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Class Section</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase text-slate-500">Filter Department:</label>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="ALL">All Departments</option>
          {departments.map(d => (
            <option key={d.departmentId} value={d.departmentId}>
              {d.code} - {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Class ID</th>
                <th className="py-3.5 px-4">Department</th>
                <th className="py-3.5 px-4">Academic Year</th>
                <th className="py-3.5 px-4">Year of Study</th>
                <th className="py-3.5 px-4">Section</th>
                <th className="py-3.5 px-4">Strength</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClasses.map((cls) => (
                <tr key={cls.classId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{cls.classId}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {departments.find(d => d.departmentId === cls.departmentId)?.code || cls.departmentId}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{cls.academicYear}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{cls.yearOfStudy}</td>
                  <td className="py-3 px-4 font-bold text-brand-700">Section {cls.section}</td>
                  <td className="py-3 px-4 text-slate-600">{cls.strength} Students</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        cls.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {cls.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {cls.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5">
                    <button
                      onClick={() => handleToggleStatus(cls)}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title={cls.status === 'ACTIVE' ? 'Deactivate Class' : 'Reactivate Class'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Class Section</h3>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            {departments.length === 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
                No active departments found. Please create a Department in Department Master before configuring classes.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {departments.map(d => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Year of Study
                  </label>
                  <select
                    value={yearOfStudy}
                    onChange={(e) => setYearOfStudy(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Section
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A, B, C"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Class Strength
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || departments.length === 0}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create Class Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

