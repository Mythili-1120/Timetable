'use client';

import React, { useEffect, useState } from 'react';
import {
  getAllStaff,
  createStaff,
  updateStaff,
  archiveStaff,
  linkStaffToDepartment,
  unlinkStaffFromDepartment,
  getAllStaffDepartmentMap
} from '../../../lib/services/staffService';
import { getAllDepartments } from '../../../lib/services/departmentService';
import { Staff, Department } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { Users, Plus, Edit2, Archive, CheckCircle2, XCircle, Search, Link as LinkIcon, Building } from 'lucide-react';

export default function StaffPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffDeptMap, setStaffDeptMap] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [primaryDept, setPrimaryDept] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-department link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedStaffForLink, setSelectedStaffForLink] = useState<Staff | null>(null);
  const [additionalDept, setAdditionalDept] = useState('');

  const { user } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, d, deptMap] = await Promise.all([
        getAllStaff(true),
        getAllDepartments(true),
        getAllStaffDepartmentMap(true)
      ]);
      setStaffList(s);
      setDepartments(d);
      setStaffDeptMap(deptMap);
      if (d.length > 0 && !primaryDept) setPrimaryDept(d[0].departmentId);
    } catch (err: any) {
      console.error('Failed to load staff/departments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Staff member name is required.');
      return;
    }
    if (!primaryDept) {
      setError('Please select a primary department. If none exist, create one in Department Master first.');
      return;
    }
    if (!user) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingStaff) {
        await updateStaff(editingStaff.memberId, {
          staffName: name.trim(),
          initials: initials.trim(),
          email: email.trim(),
          phone: phone.trim(),
          designation: designation.trim(),
          primaryDepartmentId: primaryDept
        }, user.uid);
      } else {
        await createStaff({
          staffName: name.trim(),
          initials: initials.trim(),
          email: email.trim(),
          phone: phone.trim(),
          designation: designation.trim(),
          primaryDepartmentId: primaryDept
        }, user.uid);
      }

      setEditingStaff(null);
      setName('');
      setInitials('');
      setEmail('');
      setPhone('');
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving staff:', err);
      setError(err?.message || 'Failed to save staff record. Check Firebase permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (member: Staff) => {
    if (!user) return;
    try {
      if (member.status === 'ACTIVE') {
        if (confirm(`Deactivate staff member ${member.displayName} (${member.memberId})? Historical timetables will remain permanently intact.`)) {
          await archiveStaff(member.memberId, user.uid);
          await loadData();
        }
      } else {
        await updateStaff(member.memberId, { status: 'ACTIVE' }, user.uid);
        await loadData();
      }
    } catch (err: any) {
      alert(`Error updating staff status: ${err?.message || 'Permission denied'}`);
    }
  };

  const handleLinkDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForLink || !additionalDept || !user) return;

    setSaving(true);
    try {
      await linkStaffToDepartment(selectedStaffForLink.memberId, additionalDept, user.uid);
      alert(`Successfully linked ${selectedStaffForLink.displayName} to department!`);
      setLinkModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(`Failed to link department: ${err?.message || 'Permission denied'}`);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (member: Staff) => {
    setEditingStaff(member);
    setName(member.staffName);
    setInitials(member.initials || '');
    setEmail(member.email || '');
    setPhone(member.phone || '');
    setDesignation(member.designation);
    setPrimaryDept(member.primaryDepartmentId);
    setModalOpen(true);
  };

  const activeCount = staffList.filter(s => s.status === 'ACTIVE').length;
  const archivedCount = staffList.length - activeCount;

  const filteredStaff = staffList.filter(s => {
    const matchesSearch =
      s.staffName.toLowerCase().includes(search.toLowerCase()) ||
      s.memberId.toLowerCase().includes(search.toLowerCase()) ||
      s.displayName.toLowerCase().includes(search.toLowerCase());
    const memberDepts = staffDeptMap.get(s.memberId) || (s.primaryDepartmentId ? [s.primaryDepartmentId] : []);
    const matchesDept = deptFilter === 'ALL' || memberDepts.includes(deptFilter);
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Directory</h1>
          <p className="text-sm text-slate-500">
            College-wide faculty directory. Member IDs are permanent and unified across all departments.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingStaff(null);
            setName('');
            setInitials('');
            setEmail('');
            setPhone('');
            setError(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Faculty Member</span>
        </button>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Total Faculty</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{staffList.length}</div>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Canonical</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Active Members</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">Active</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Archived Members</span>
            <div className="text-2xl font-bold text-slate-500 mt-1">{archivedCount}</div>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Preserved</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Member ID, Name, or Initials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
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

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Permanent ID</th>
                <th className="py-3.5 px-4">Display Name</th>
                <th className="py-3.5 px-4">Department Affiliations</th>
                <th className="py-3.5 px-4">Designation</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStaff.map((member) => {
                const linkedDepts = (staffDeptMap.get(member.memberId) || []).filter(
                  dId => dId !== member.primaryDepartmentId
                );

                return (
                  <tr key={member.memberId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-brand-700 bg-brand-50/40 w-36">
                      {member.memberId}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{member.displayName}</td>
                    <td className="py-3 px-4 text-slate-700">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                          {departments.find(d => d.departmentId === member.primaryDepartmentId)?.code || member.primaryDepartmentId}
                        </span>
                        {linkedDepts.map(dId => (
                          <span
                            key={dId}
                            className="font-semibold text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200"
                            title="Cross-Department Link"
                          >
                            +{departments.find(d => d.departmentId === dId)?.code || dId.replace('dept-', '').toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                  <td className="py-3 px-4 text-slate-600">{member.designation}</td>
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
                      onClick={() => { setSelectedStaffForLink(member); setLinkModalOpen(true); }}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Link to Another Department"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(member)}
                      className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors"
                      title="Edit Staff Member"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(member)}
                      className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title={member.status === 'ACTIVE' ? 'Deactivate Staff (Soft-Archive)' : 'Reactivate Staff'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingStaff ? `Edit Staff — ${editingStaff.memberId}` : 'Add New Staff Member'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Permanent Member ID (FAC-XXXXXX) will be generated automatically via an atomic transaction.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            {departments.length === 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
                No active departments found. Please create a Department in Department Master before adding faculty.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ram, Suresh, Priya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Initials
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. R, M, K"
                    value={initials}
                    onChange={(e) => setInitials(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Primary Department
                </label>
                <select
                  value={primaryDept}
                  onChange={(e) => setPrimaryDept(e.target.value)}
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
                    Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="faculty@ssmiet.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  {saving ? 'Saving...' : (editingStaff ? 'Update Staff Member' : 'Generate ID & Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Department Link Modal */}
      {linkModalOpen && selectedStaffForLink && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Link Staff to Additional Department
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Allows <span className="font-semibold text-slate-800">{selectedStaffForLink.displayName}</span> ({selectedStaffForLink.memberId}) to teach in another department without creating a duplicate record.
            </p>

            <form onSubmit={handleLinkDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Select Department to Link
                </label>
                <select
                  value={additionalDept}
                  onChange={(e) => setAdditionalDept(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">-- Choose Department --</option>
                  {departments
                    .filter(d => d.departmentId !== selectedStaffForLink.primaryDepartmentId)
                    .map(d => (
                      <option key={d.departmentId} value={d.departmentId}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLinkModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                >
                  Link Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

