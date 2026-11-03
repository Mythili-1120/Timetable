'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAllStaff,
  getCachedStaff,
  createStaff,
  updateStaff,
  archiveStaff,
  deleteStaff,
  linkStaffToDepartment,
  getAllStaffDepartmentMap,
  getCachedStaffDepartmentMap
} from '../../../lib/services/staffService';
import {
  getAllDepartments,
  getCachedDepartments
} from '../../../lib/services/departmentService';
import {
  getAllSubjects,
  getCachedSubjects,
  normalizeDeptId
} from '../../../lib/services/subjectService';
import { validatePhoneNumber } from '../../../lib/utils/phoneValidation';
import { Staff, Department, Subject } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Users,
  Plus,
  Edit2,
  Archive,
  CheckCircle2,
  XCircle,
  Search,
  Link as LinkIcon,
  Phone,
  BookOpen,
  AlertTriangle,
  Trash2,
  MoreHorizontal,
  Info,
  Lock,
  Building2,
  Check,
  User
} from 'lucide-react';
import Modal from '../../../components/Modal';

function getStaffAvatarLetters(staff: Staff): string {
  if (staff.staffName && staff.initials) {
    const firstChar = staff.staffName.trim().charAt(0).toUpperCase();
    const initChar = staff.initials.trim().charAt(0).toUpperCase();
    return `${firstChar}${initChar}`;
  }
  if (staff.displayName) {
    const cleaned = staff.displayName.replace(/[()]/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.slice(0, 2).toUpperCase() || 'ST';
  }
  return staff.staffName ? staff.staffName.slice(0, 2).toUpperCase() : 'ST';
}

function getStaffIssuesCount(member: Staff): number {
  let issues = 0;
  const phone = member.phoneNumber || member.phone;
  if (!phone || !phone.trim()) {
    issues += 1;
  }
  const subjects = Array.isArray(member.subjectIds) ? member.subjectIds : [];
  if (subjects.length === 0) {
    issues += 1;
  }
  if (!member.primaryDepartmentId) {
    issues += 1;
  }
  return issues;
}

type TabFilter = 'ALL' | 'NEEDS_ATTENTION' | 'ACTIVE' | 'ARCHIVED';

export default function StaffPage() {
  const initialStaff = getCachedStaff();
  const initialDepts = getCachedDepartments();
  const initialDeptMap = getCachedStaffDepartmentMap();
  const initialSubjs = getCachedSubjects();

  const [staffList, setStaffList] = useState<Staff[]>(() => initialStaff || []);
  const [departments, setDepartments] = useState<Department[]>(() => initialDepts || []);
  const [staffDeptMap, setStaffDeptMap] = useState<Map<string, string[]>>(() => initialDeptMap || new Map());
  const [allSubjects, setAllSubjects] = useState<Subject[]>(() => initialSubjs || []);
  const [loading, setLoading] = useState(() => !initialStaff);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [tabFilter, setTabFilter] = useState<TabFilter>('ALL');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [primaryDept, setPrimaryDept] = useState(() => (initialDepts && initialDepts.length > 0 ? initialDepts[0].departmentId : ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staff Permanent Deletion modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Multi-department link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedStaffForLink, setSelectedStaffForLink] = useState<Staff | null>(null);
  const [additionalDept, setAdditionalDept] = useState('');

  const { user } = useAuth();

  const loadData = async (forceRefresh = false) => {
    if (staffList.length === 0 && !getCachedStaff()) {
      setLoading(true);
    }
    try {
      const [s, d, deptMap, subjs] = await Promise.all([
        getAllStaff(forceRefresh),
        getAllDepartments(forceRefresh),
        getAllStaffDepartmentMap(forceRefresh),
        getAllSubjects(undefined, forceRefresh)
      ]);
      setStaffList(s);
      setDepartments(d);
      setStaffDeptMap(deptMap);
      setAllSubjects(subjs);
      if (d.length > 0 && !primaryDept) setPrimaryDept(d[0].departmentId);
    } catch (err: any) {
      console.error('Failed to load staff/departments/subjects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const handleDeleteStaff = async () => {
    if (!staffToDelete || !user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteStaff(staffToDelete.memberId, user.uid);
      setDeleteConfirmOpen(false);
      setStaffToDelete(null);
      await loadData(true);
    } catch (err: any) {
      console.error('Failed to delete staff member:', err);
      setDeleteError(err?.message || 'Failed to delete staff member.');
    } finally {
      setDeleting(false);
    }
  };

  const openAdd = () => {
    setEditingStaff(null);
    setName('');
    setInitials('');
    setEmail('');
    setPhone('');
    setDesignation('');
    const defaultDept = departments.length > 0 ? departments[0].departmentId : '';
    setPrimaryDept(defaultDept);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (member: Staff) => {
    setEditingStaff(member);
    setName(member.staffName);
    setInitials(member.initials || '');
    setEmail(member.email || '');
    setPhone(member.phoneNumber || member.phone || '');
    setDesignation(member.designation);
    setPrimaryDept(member.primaryDepartmentId);
    setError(null);
    setModalOpen(true);
  };

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

    // Validate phone number format if provided
    let cleanedPhone = phone.trim();
    if (cleanedPhone) {
      const phoneValidation = validatePhoneNumber(cleanedPhone);
      if (!phoneValidation.isValid) {
        setError(phoneValidation.error || 'Please enter a valid phone number (e.g. 9876543210 or +91 9876543210).');
        return;
      }
      cleanedPhone = phoneValidation.cleaned;
    }

    if (!user) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingStaff) {
        await updateStaff(
          editingStaff.memberId,
          {
            staffName: name.trim(),
            initials: initials.trim(),
            email: email.trim(),
            phone: cleanedPhone,
            phoneNumber: cleanedPhone,
            designation: designation.trim(),
            primaryDepartmentId: primaryDept
          },
          user.uid
        );
      } else {
        await createStaff(
          {
            staffName: name.trim(),
            initials: initials.trim(),
            email: email.trim(),
            phone: cleanedPhone,
            phoneNumber: cleanedPhone,
            designation: designation.trim(),
            primaryDepartmentId: primaryDept
          },
          user.uid
        );
      }

      setEditingStaff(null);
      setName('');
      setInitials('');
      setEmail('');
      setPhone('');
      setModalOpen(false);
      await loadData(true);
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
        if (
          confirm(
            `Deactivate staff member ${member.displayName} (${member.memberId})? Historical timetables will remain permanently intact.`
          )
        ) {
          await archiveStaff(member.memberId, user.uid);
          await loadData(true);
        }
      } else {
        await updateStaff(member.memberId, { status: 'ACTIVE' }, user.uid);
        await loadData(true);
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
      await loadData(true);
    } catch (err: any) {
      alert(`Failed to link department: ${err?.message || 'Permission denied'}`);
    } finally {
      setSaving(false);
    }
  };

  const activeCount = staffList.filter(s => s.status === 'ACTIVE').length;
  const archivedCount = staffList.length - activeCount;
  const needsAttentionCount = staffList.filter(s => getStaffIssuesCount(s) > 0).length;
  const totalCount = staffList.length;

  const filteredStaff = staffList.filter(s => {
    if (tabFilter === 'ACTIVE' && s.status !== 'ACTIVE') return false;
    if (tabFilter === 'ARCHIVED' && s.status === 'ACTIVE') return false;
    if (tabFilter === 'NEEDS_ATTENTION' && getStaffIssuesCount(s) === 0) return false;

    const matchesSearch =
      s.staffName.toLowerCase().includes(search.toLowerCase()) ||
      s.memberId.toLowerCase().includes(search.toLowerCase()) ||
      s.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (s.phoneNumber || s.phone || '').includes(search);
    const memberDepts = staffDeptMap.get(s.memberId) || (s.primaryDepartmentId ? [s.primaryDepartmentId] : []);
    const matchesDept = deptFilter === 'ALL' || memberDepts.includes(deptFilter);
    return matchesSearch && matchesDept;
  });

  // Map of all subjects by ID for fast lookup
  const subjectMap = new Map<string, Subject>();
  allSubjects.forEach(subj => subjectMap.set(subj.subjectId, subj));

  return (
    <div className="space-y-6">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#3431B7] px-7 py-7 text-white shadow-lg shadow-indigo-950/10">
        {/* Segmented dashed bars in top right (decorative as in template) */}
        <div className="flex items-center justify-end gap-2 mb-2 opacity-35">
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
          <div className="w-8 h-1 rounded-full bg-white" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <span className="text-xs font-semibold text-indigo-200 tracking-wide">
              College-wide directory
            </span>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1">
              Staff Directory
            </h1>
            <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
              Faculty with their subject qualifications and permanent Member IDs.
            </p>
          </div>

          <button
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-[#3431B7] bg-white hover:bg-slate-50 transition-all shadow-md hover:shadow-lg cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {/* Total registered */}
          <div className="flex items-center gap-3.5 sm:px-2">
            <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center shrink-0 border border-slate-100">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">
                {totalCount}
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                Total registered
              </div>
            </div>
          </div>

          {/* Active faculty */}
          <div className="flex items-center gap-3.5 sm:px-4 pt-4 sm:pt-0">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">
                {activeCount}
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                Active faculty
              </div>
            </div>
          </div>

          {/* Archived / Inactive */}
          <div className="flex items-center gap-3.5 sm:px-4 pt-4 sm:pt-0">
            <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 border border-slate-100">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">
                {archivedCount}
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                Archived / Inactive
              </div>
            </div>
          </div>

          {/* Need attention */}
          <div className="flex items-center gap-3.5 sm:px-4 pt-4 sm:pt-0">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 border border-amber-100/60">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">
                {needsAttentionCount}
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                Need attention
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Member ID, Name, Phone, or Department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-slate-200/90 rounded-2xl placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3431B7]/15 focus:border-[#3431B7] shadow-xs transition-all"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="w-full sm:w-auto px-4 py-3 text-sm bg-white border border-slate-200/90 rounded-2xl text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#3431B7]/15 focus:border-[#3431B7] shadow-xs cursor-pointer min-w-[200px]"
        >
          <option value="ALL">All Departments</option>
          {departments.map(d => (
            <option key={d.departmentId} value={d.departmentId}>
              {d.code} - {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Filter Segment Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTabFilter('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tabFilter === 'ALL'
              ? 'bg-[#3431B7] text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 shadow-xs'
          }`}
        >
          All {totalCount}
        </button>
        <button
          onClick={() => setTabFilter('NEEDS_ATTENTION')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tabFilter === 'NEEDS_ATTENTION'
              ? 'bg-[#3431B7] text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 shadow-xs'
          }`}
        >
          Needs attention {needsAttentionCount}
        </button>
        <button
          onClick={() => setTabFilter('ACTIVE')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tabFilter === 'ACTIVE'
              ? 'bg-[#3431B7] text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 shadow-xs'
          }`}
        >
          Active {activeCount}
        </button>
        <button
          onClick={() => setTabFilter('ARCHIVED')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tabFilter === 'ARCHIVED'
              ? 'bg-[#3431B7] text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 shadow-xs'
          }`}
        >
          Archived {archivedCount}
        </button>
      </div>

      {/* Faculty Cards List */}
      <div className="space-y-3.5">
        {filteredStaff.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No staff members found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No faculty match your current filter or search criteria.
            </p>
            {(search || deptFilter !== 'ALL' || tabFilter !== 'ALL') && (
              <button
                onClick={() => { setSearch(''); setDeptFilter('ALL'); setTabFilter('ALL'); }}
                className="mt-3.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-[#3431B7] bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredStaff.map((member) => {
            const avatarLetters = getStaffAvatarLetters(member);
            const issuesCount = getStaffIssuesCount(member);
            const linkedDepts = (staffDeptMap.get(member.memberId) || []).filter(
              dId => dId !== member.primaryDepartmentId
            );
            const displayPhone = member.phoneNumber || member.phone || '';
            const memberSubjs = Array.isArray(member.subjectIds) ? member.subjectIds : [];

            const primaryDeptObj = departments.find(
              d => normalizeDeptId(d.departmentId) === normalizeDeptId(member.primaryDepartmentId)
            );
            const primaryDeptName = primaryDeptObj?.code || primaryDeptObj?.name || member.primaryDepartmentId || 'General';

            return (
              <div
                key={member.memberId}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4"
              >
                {/* Identity Section: Avatar + Name + ID + Designation + Status */}
                <div className="flex items-center gap-4 min-w-[280px]">
                  <div className="w-14 h-14 rounded-2xl bg-[#3431B7] text-white flex items-center justify-center font-bold text-lg tracking-wide shrink-0 shadow-xs">
                    {avatarLetters}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-snug">
                        {member.displayName || member.staffName}
                      </h3>
                      <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-[#3431B7] border border-indigo-100">
                        {member.memberId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {member.designation || 'Faculty Member'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          member.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            member.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span>{member.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}</span>
                      </span>
                      {issuesCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>{issuesCount} to fix</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metadata Section: Department, Phone, Qualified Subjects */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 xl:gap-8 flex-1 xl:px-6">
                  {/* DEPARTMENT */}
                  <div>
                    <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      DEPARTMENT
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-block bg-indigo-50/70 text-[#3431B7] border border-indigo-100/90 px-3 py-1 rounded-full text-xs font-bold">
                        {primaryDeptName}
                      </span>
                      {linkedDepts.length > 0 && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          (+{linkedDepts.map(dId => departments.find(d => normalizeDeptId(d.departmentId) === normalizeDeptId(dId))?.code || dId.replace('dept-', '').toUpperCase()).join(', ')})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PHONE */}
                  <div>
                    <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      PHONE
                    </span>
                    {displayPhone ? (
                      <span className="text-xs font-mono font-medium text-slate-700">
                        {displayPhone}
                      </span>
                    ) : (
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <span>Not set</span>
                        <button
                          onClick={() => openEdit(member)}
                          className="text-[#3431B7] font-semibold hover:underline cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* QUALIFIED SUBJECTS */}
                  <div>
                    <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      QUALIFIED SUBJECTS
                    </span>
                    {memberSubjs.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {memberSubjs.map((sId) => {
                          const subj = subjectMap.get(sId);
                          return (
                            <span
                              key={sId}
                              title={subj ? `${subj.code} (${subj.type}, ${subj.weeklyHours}h/wk)` : sId}
                              className="inline-block bg-indigo-50 text-[#3431B7] border border-indigo-100 px-3 py-1 rounded-full text-xs font-semibold"
                            >
                              {subj ? subj.name : sId}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="inline-block bg-amber-50 text-amber-800 border border-amber-200/80 px-3 py-1 rounded-full text-xs font-semibold">
                        No subjects linked
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons Section */}
                <div className="flex items-center gap-2 justify-end shrink-0 pt-3 xl:pt-0 border-t xl:border-t-0 border-slate-100">
                  <button
                    onClick={() => {
                      setSelectedStaffForLink(member);
                      setLinkModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#3431B7] hover:bg-[#2B299E] transition-colors shadow-xs cursor-pointer"
                    title="Link Staff to Another Department"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Link</span>
                  </button>
                  <button
                    onClick={() => openEdit(member)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-xs cursor-pointer"
                    title="Edit Staff Member"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === member.memberId ? null : member.memberId)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-xs cursor-pointer"
                      title="More actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {openMenuId === member.memberId && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs">
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              handleToggleStatus(member);
                            }}
                            className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                          >
                            <Archive className="w-3.5 h-3.5 text-slate-400" />
                            <span>{member.status === 'ACTIVE' ? 'Deactivate (Archive)' : 'Reactivate Faculty'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              setStaffToDelete(member);
                              setDeleteError(null);
                              setDeleteConfirmOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Delete Permanently</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Tip Banner */}
      <div className="bg-indigo-50/70 border border-indigo-100/90 rounded-2xl p-4 flex items-center gap-3.5">
        <div className="w-7 h-7 rounded-full bg-[#3431B7] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          <Info className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900">
            Tip: link at least one qualified subject to every faculty member
          </h4>
          <p className="text-xs text-indigo-900/80 mt-0.5">
            The timetable generator can only use faculty who have subjects linked.
          </p>
        </div>
      </div>

      {/* Footer Counter */}
      <p className="text-xs text-slate-400 font-medium pl-1">
        Showing {filteredStaff.length} of {staffList.length} staff members
      </p>

      {/* 1. ADD / EDIT STAFF MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
        badge={editingStaff ? editingStaff.memberId : 'New Member'}
        icon={
          editingStaff ? (
            <span className="font-extrabold text-sm">{editingStaff.initials || editingStaff.displayName.slice(0, 2).toUpperCase()}</span>
          ) : (
            <User className="w-5 h-5 text-white" />
          )
        }
        maxWidth="lg"
        footer={
          <>
            <span className="text-[11px] text-slate-400 font-medium">* Required</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200/80 bg-white shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="staff-modal-form"
                disabled={saving || departments.length === 0}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>{saving ? 'Saving...' : editingStaff ? 'Save changes' : 'Add Staff Member'}</span>
              </button>
            </div>
          </>
        }
      >
        {/* Permanent Member ID Info Banner */}
        <div className="bg-indigo-50/70 border border-indigo-100/90 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#3431B7] text-white flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">
              Member ID {editingStaff ? editingStaff.memberId : 'FAC-XXXXXX'} is permanent
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              It is unique and cannot be changed in any department.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        {departments.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
            No active departments found. Please create a Department in Department Master before adding faculty.
          </div>
        )}

        <form id="staff-modal-form" onSubmit={handleSave} className="space-y-4">
          {/* Section: BASIC DETAILS */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
              BASIC DETAILS
            </span>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Suresh, Priya, Ram"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Initials
                </label>
                <input
                  type="text"
                  placeholder="e.g. S, R, M"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] uppercase transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section: CONTACT */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
              CONTACT
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Phone number
                  </label>
                  {!phone && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-md">
                      Missing
                    </span>
                  )}
                </div>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#3431B7]/20 focus-within:border-[#3431B7] transition-all">
                  <span className="inline-flex items-center px-3 bg-slate-50 border-r border-slate-200 text-xs font-bold text-slate-500">
                    +91
                  </span>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone.replace(/^\+91\s*/, '')}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-1">10-digit mobile number, or +91 format</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="faculty@ssmiet.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section: WORK */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
              WORK
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Primary department *
                </label>
                <select
                  value={primaryDept}
                  onChange={(e) => setPrimaryDept(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all cursor-pointer"
                >
                  {departments.map(d => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Designation
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Assistant Professor"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all"
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* 2. MULTI-DEPARTMENT LINK MODAL */}
      <Modal
        isOpen={Boolean(linkModalOpen && selectedStaffForLink)}
        onClose={() => setLinkModalOpen(false)}
        title="Link Staff to Department"
        badge={selectedStaffForLink?.memberId || ''}
        icon={<Building2 className="w-5 h-5 text-white" />}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setLinkModalOpen(false)}
              className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200/80 bg-white shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="link-dept-form"
              disabled={saving || !additionalDept}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{saving ? 'Linking...' : 'Establish Department Link'}</span>
            </button>
          </div>
        }
      >
        <div className="bg-indigo-50/70 border border-indigo-100/90 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#3431B7] text-white flex items-center justify-center shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">
              {selectedStaffForLink?.displayName} ({selectedStaffForLink?.memberId})
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Allows this faculty member to teach in another department without creating duplicate records.
            </p>
          </div>
        </div>

        <form id="link-dept-form" onSubmit={handleLinkDepartment} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select Department to Link *
            </label>
            <select
              value={additionalDept}
              onChange={(e) => setAdditionalDept(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all cursor-pointer"
            >
              <option value="">-- Choose Department --</option>
              {departments
                .filter(d => d.departmentId !== selectedStaffForLink?.primaryDepartmentId)
                .map(d => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.code} — {d.name}
                  </option>
                ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* 3. PERMANENT STAFF DELETION CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(deleteConfirmOpen && staffToDelete)}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setStaffToDelete(null);
          setDeleteError(null);
        }}
        title={`Delete Staff: ${staffToDelete?.displayName || ''}`}
        badge={staffToDelete?.memberId || ''}
        icon={<Trash2 className="w-5 h-5 text-white" />}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setStaffToDelete(null);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200/80 bg-white shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteStaff}
              disabled={deleting}
              className="px-6 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
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
        }
      >
        <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-900 leading-relaxed">
          <span className="font-bold">Permanent Operation Warning: </span>
          Deleting a staff member permanently removes their profile and department links from Firestore. If this faculty member has active teaching assignments, draft timetable slots, or published timetable history, permanent deletion will be prevented to protect institutional academic records.
        </div>

        {deleteError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 whitespace-pre-line leading-relaxed font-medium">
              {deleteError}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
