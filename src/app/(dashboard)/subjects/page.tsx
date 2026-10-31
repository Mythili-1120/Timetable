'use client';

import React, { useEffect, useState } from 'react';
import { getAllSubjects, createSubject, updateSubject, archiveSubject } from '../../../lib/services/subjectService';
import { getAllDepartments } from '../../../lib/services/departmentService';
import { Subject, Department } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { BookOpen, Plus, Edit2, Archive, CheckCircle2, XCircle } from 'lucide-react';

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubj, setEditingSubj] = useState<Subject | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'Theory' | 'Lab'>('Theory');
  const [weeklyHours, setWeeklyHours] = useState(4);
  const [labBlockHours, setLabBlockHours] = useState(4);
  const [departmentId, setDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [sub, d] = await Promise.all([getAllSubjects(undefined, true), getAllDepartments(true)]);
      setSubjects(sub);
      setDepartments(d);
      if (d.length > 0 && !departmentId) setDepartmentId(d[0].departmentId);
    } catch (err: any) {
      console.error('Failed to load subjects:', err);
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
      setError('Course code and subject name are required.');
      return;
    }
    if (!departmentId) {
      setError('Please select a department.');
      return;
    }
    if (!user) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingSubj) {
        await updateSubject(editingSubj.subjectId, {
          code: code.toUpperCase().trim(),
          name: name.trim(),
          type,
          weeklyHours: Number(weeklyHours),
          labBlockHours: type === 'Lab' ? Number(labBlockHours) : undefined,
          departmentId
        }, user.uid);
      } else {
        await createSubject({
          code: code.trim(),
          name: name.trim(),
          type,
          weeklyHours: Number(weeklyHours),
          labBlockHours: type === 'Lab' ? Number(labBlockHours) : undefined,
          departmentId,
          academicYear: '2025–2026'
        }, user.uid);
      }

      setEditingSubj(null);
      setCode('');
      setName('');
      setWeeklyHours(4);
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving subject:', err);
      setError(err?.message || 'Failed to save subject.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (subj: Subject) => {
    if (!user) return;
    try {
      if (subj.status === 'ACTIVE') {
        if (confirm(`Archive subject ${subj.name} (${subj.code})? Historical timetable references will remain preserved.`)) {
          await archiveSubject(subj.subjectId, user.uid);
          await loadData();
        }
      } else {
        await updateSubject(subj.subjectId, { status: 'ACTIVE' }, user.uid);
        await loadData();
      }
    } catch (err: any) {
      alert(`Error updating subject status: ${err?.message || 'Permission denied'}`);
    }
  };

  const openEdit = (subj: Subject) => {
    setEditingSubj(subj);
    setCode(subj.code);
    setName(subj.name);
    setType(subj.type);
    setWeeklyHours(subj.weeklyHours);
    setLabBlockHours(subj.labBlockHours || 4);
    setDepartmentId(subj.departmentId);
    setModalOpen(true);
  };

  const filteredSubjects = subjects.filter(s => deptFilter === 'ALL' || s.departmentId === deptFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Subject Master</h1>
          <p className="text-sm text-slate-500">Configure Theory and Laboratory curriculum courses and weekly hour quotas</p>
        </div>
        <button
          onClick={() => {
            setEditingSubj(null);
            setCode('');
            setName('');
            setWeeklyHours(type === 'Lab' ? 4 : 4);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subject</span>
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
                <th className="py-3.5 px-4">Subject ID</th>
                <th className="py-3.5 px-4">Course Code</th>
                <th className="py-3.5 px-4">Subject Name</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Weekly Hours</th>
                <th className="py-3.5 px-4">Department</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSubjects.map((s) => (
                <tr key={s.subjectId} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{s.subjectId}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{s.code}</td>
                  <td className="py-3 px-4 text-slate-800 font-medium">{s.name}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        s.type === 'Lab'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {s.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">
                    {s.weeklyHours} hrs {s.type === 'Lab' ? `(${s.labBlockHours || 4}h block)` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {departments.find(d => d.departmentId === s.departmentId)?.code || s.departmentId}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {s.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors"
                      title="Edit Subject"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(s)}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title={s.status === 'ACTIVE' ? 'Archive Subject' : 'Reactivate Subject'}
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
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingSubj ? 'Edit Subject' : 'Add New Subject'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            {departments.length === 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
                No active departments found. Please create a Department in Department Master before adding subjects.
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
                    Course Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS101, MA101"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const t = e.target.value as 'Theory' | 'Lab';
                      setType(t);
                      if (t === 'Lab') {
                        setWeeklyHours(4);
                        setLabBlockHours(4);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="Theory">Theory</option>
                    <option value="Lab">Laboratory</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures and Algorithms"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    required
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                {type === 'Lab' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Continuous Block (Hrs)
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="4"
                      value={labBlockHours}
                      onChange={(e) => setLabBlockHours(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
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
                  {saving ? 'Saving...' : (editingSubj ? 'Save Changes' : 'Create Subject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

