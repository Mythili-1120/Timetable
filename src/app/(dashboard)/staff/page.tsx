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
  createSubject,
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
  Trash2
} from 'lucide-react';

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

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [primaryDept, setPrimaryDept] = useState(() => (initialDepts && initialDepts.length > 0 ? initialDepts[0].departmentId : ''));
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline Subject Creation state inside Staff modal
  const [inlineSubjectOpen, setInlineSubjectOpen] = useState(false);
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjType, setNewSubjType] = useState<'Theory' | 'Lab'>('Theory');
  const [newSubjWeeklyHours, setNewSubjWeeklyHours] = useState(4);
  const [newSubjLabBlockHours, setNewSubjLabBlockHours] = useState(4);
  const [creatingInlineSubj, setCreatingInlineSubj] = useState(false);
  const [inlineSubjError, setInlineSubjError] = useState<string | null>(null);
  const [inlineSubjSuccess, setInlineSubjSuccess] = useState<string | null>(null);

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

  // Filter subjects belonging to currently chosen primary department with canonical ID normalization
  const currentDeptSubjects = allSubjects.filter(s => {
    const sNorm = normalizeDeptId(s.departmentId);
    const pNorm = normalizeDeptId(primaryDept);
    return sNorm === pNorm && s.status !== 'INACTIVE';
  });

  const handleCreateInlineSubject = async () => {
    if (!newSubjCode.trim() || !newSubjName.trim()) {
      setInlineSubjError('Subject code and subject name are required.');
      return;
    }
    if (!primaryDept) {
      setInlineSubjError('Please select a department first.');
      return;
    }
    if (!user) {
      setInlineSubjError('Session expired. Please log in again.');
      return;
    }

    setCreatingInlineSubj(true);
    setInlineSubjError(null);
    setInlineSubjSuccess(null);

    try {
      const createdSubj = await createSubject(
        {
          code: newSubjCode.trim(),
          name: newSubjName.trim(),
          type: newSubjType,
          weeklyHours: Number(newSubjWeeklyHours) || 4,
          labBlockHours: newSubjType === 'Lab' ? (Number(newSubjLabBlockHours) || 4) : undefined,
          departmentId: primaryDept,
          academicYear: '2025–2026'
        },
        user.uid
      );

      // Add to local subjects immediately
      setAllSubjects(prev => [createdSubj, ...prev.filter(s => s.subjectId !== createdSubj.subjectId)]);
      // Automatically select the newly created subject for this staff member
      setSelectedSubjectIds(prev => Array.from(new Set([...prev, createdSubj.subjectId])));
      setInlineSubjSuccess(`Subject ${createdSubj.code} (${createdSubj.name}) created and added to selected qualifications.`);
      // Reset inputs
      setNewSubjCode('');
      setNewSubjName('');
      setNewSubjType('Theory');
      setNewSubjWeeklyHours(4);
      setNewSubjLabBlockHours(4);
      setInlineSubjectOpen(false);
    } catch (err: any) {
      console.error('Error creating inline subject:', err);
      setInlineSubjError(err?.message || 'Failed to create subject.');
    } finally {
      setCreatingInlineSubj(false);
    }
  };

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
    setDesignation('Assistant Professor');
    const defaultDept = departments.length > 0 ? departments[0].departmentId : '';
    setPrimaryDept(defaultDept);
    setSelectedSubjectIds([]);
    setError(null);
    setInlineSubjectOpen(false);
    setInlineSubjError(null);
    setInlineSubjSuccess(null);
    setNewSubjCode('');
    setNewSubjName('');
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
    setSelectedSubjectIds(Array.isArray(member.subjectIds) ? member.subjectIds : []);
    setError(null);
    setInlineSubjectOpen(false);
    setInlineSubjError(null);
    setInlineSubjSuccess(null);
    setNewSubjCode('');
    setNewSubjName('');
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
            primaryDepartmentId: primaryDept,
            subjectIds: selectedSubjectIds
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
            primaryDepartmentId: primaryDept,
            subjectIds: selectedSubjectIds
          },
          user.uid
        );
      }

      setEditingStaff(null);
      setName('');
      setInitials('');
      setEmail('');
      setPhone('');
      setSelectedSubjectIds([]);
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

  const filteredStaff = staffList.filter(s => {
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Directory</h1>
          <p className="text-sm text-slate-500">
            College-wide faculty directory with subject qualifications and permanent Member IDs.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Registered</p>
            <p className="text-xl font-bold text-slate-900">{staffList.length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Faculty</p>
            <p className="text-xl font-bold text-emerald-700">{activeCount}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Archived / Inactive</p>
            <p className="text-xl font-bold text-slate-700">{archivedCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Member ID, Name, Phone, or Department..."
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
                <th className="py-3.5 px-4">Faculty Name</th>
                <th className="py-3.5 px-4">Phone Number</th>
                <th className="py-3.5 px-4">Department</th>
                <th className="py-3.5 px-4">Qualified Subjects</th>
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
                const displayPhone = member.phoneNumber || member.phone || '';
                const memberSubjs = Array.isArray(member.subjectIds) ? member.subjectIds : [];

                return (
                  <tr key={member.memberId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-brand-700 bg-brand-50/40 w-32 whitespace-nowrap">
                      {member.memberId}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {member.displayName}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700 whitespace-nowrap">
                      {displayPhone ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-800">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{displayPhone}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not set</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-800 text-xs font-medium">
                      <span>
                        {departments.find(d => normalizeDeptId(d.departmentId) === normalizeDeptId(member.primaryDepartmentId))?.name ||
                         departments.find(d => normalizeDeptId(d.departmentId) === normalizeDeptId(member.primaryDepartmentId))?.code ||
                         member.primaryDepartmentId}
                      </span>
                      {linkedDepts.length > 0 && (
                        <span className="text-slate-500 text-[11px] ml-1">
                          (+{linkedDepts.map(dId => departments.find(d => normalizeDeptId(d.departmentId) === normalizeDeptId(dId))?.code || dId.replace('dept-', '').toUpperCase()).join(', ')})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 text-xs">
                      {memberSubjs.length > 0 ? (
                        <span>
                          {memberSubjs.map((sId, idx) => {
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
                    <td className="py-3 px-4 text-slate-600 text-xs whitespace-nowrap">{member.designation}</td>
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
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => { setSelectedStaffForLink(member); setLinkModalOpen(true); }}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                        title="Link to Another Department"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(member)}
                        className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors cursor-pointer"
                        title="Edit Staff Member"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(member)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors cursor-pointer"
                        title={member.status === 'ACTIVE' ? 'Deactivate Staff (Soft-Archive)' : 'Reactivate Staff'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setStaffToDelete(member);
                          setDeleteError(null);
                          setDeleteConfirmOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="Delete Staff Member Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100 my-8">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingStaff ? `Edit Staff — ${editingStaff.memberId}` : 'Add New Staff Member'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Permanent Member ID (FAC-XXXXXX) is unique and immutable across all college departments.
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
              {/* Full Name and Initials */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suresh, Priya, Ram"
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

              {/* Phone Number & Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">10-digit mobile or +91 format</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address
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

              {/* Department & Designation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Primary Department *
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
              </div>

              {/* Subject(s) Qualified to Teach */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Subject(s) Qualified to Teach
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-brand-700">
                      {selectedSubjectIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInlineSubjectOpen(!inlineSubjectOpen);
                        setInlineSubjError(null);
                        setInlineSubjSuccess(null);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-md border border-brand-200 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{inlineSubjectOpen ? 'Close Subj Form' : 'Add New Subject'}</span>
                    </button>
                  </div>
                </div>

                {/* Inline New Subject Creation Card */}
                {inlineSubjectOpen && (
                  <div className="mb-3 p-3 bg-slate-50 border border-brand-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Create New Subject in {departments.find(d => normalizeDeptId(d.departmentId) === normalizeDeptId(primaryDept))?.code || 'Selected Department'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Subject Master</span>
                    </div>

                    {inlineSubjError && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                        {inlineSubjError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Course Code *</label>
                        <input
                          type="text"
                          placeholder="e.g. CS301"
                          value={newSubjCode}
                          onChange={(e) => setNewSubjCode(e.target.value.toUpperCase())}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Subject Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Data Structures"
                          value={newSubjName}
                          onChange={(e) => setNewSubjName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Type</label>
                        <select
                          value={newSubjType}
                          onChange={(e) => setNewSubjType(e.target.value as 'Theory' | 'Lab')}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                        >
                          <option value="Theory">Theory</option>
                          <option value="Lab">Lab</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Weekly Hours</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={newSubjWeeklyHours}
                          onChange={(e) => setNewSubjWeeklyHours(Number(e.target.value) || 4)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                        />
                      </div>
                      {newSubjType === 'Lab' ? (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Lab Block Hrs</label>
                          <input
                            type="number"
                            min={2}
                            max={6}
                            value={newSubjLabBlockHours}
                            onChange={(e) => setNewSubjLabBlockHours(Number(e.target.value) || 4)}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                          />
                        </div>
                      ) : (
                        <div className="flex items-end pb-1 text-[10px] text-slate-400">
                          AY 2025–2026
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setInlineSubjectOpen(false);
                          setInlineSubjError(null);
                        }}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateInlineSubject}
                        disabled={creatingInlineSubj}
                        className="px-3 py-1 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-md transition-colors shadow-xs inline-flex items-center gap-1 cursor-pointer"
                      >
                        {creatingInlineSubj ? 'Creating...' : 'Create & Link Subject'}
                      </button>
                    </div>
                  </div>
                )}

                {inlineSubjSuccess && (
                  <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center justify-between">
                    <span>{inlineSubjSuccess}</span>
                    <button
                      type="button"
                      onClick={() => setInlineSubjSuccess(null)}
                      className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {currentDeptSubjects.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span>No active subjects found in the selected department. </span>
                      <span>Click </span>
                      <button
                        type="button"
                        onClick={() => setInlineSubjectOpen(true)}
                        className="font-bold underline text-brand-700 cursor-pointer"
                      >
                        Add New Subject
                      </button>
                      <span> above or </span>
                      <Link href="/subjects" className="font-bold underline text-brand-700">
                        create subjects in Subject Master
                      </Link>{' '}
                      <span>before assigning qualifications.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50/50">
                    {currentDeptSubjects.map(subj => {
                      const isChecked = selectedSubjectIds.includes(subj.subjectId);
                      return (
                        <label
                          key={subj.subjectId}
                          className={`flex items-center gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-brand-50/70 border-brand-300'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedSubjectIds(prev =>
                                isChecked
                                  ? prev.filter(id => id !== subj.subjectId)
                                  : [...prev, subj.subjectId]
                              );
                            }}
                            className="rounded text-brand-600 focus:ring-brand-500"
                          />
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <div className="truncate mr-2">
                              <span className="font-bold text-slate-900">{subj.code}</span>
                              <span className="ml-1.5 text-slate-700 font-medium">{subj.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                  subj.type === 'Lab'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {subj.type}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {subj.weeklyHours}h/wk
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
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
                  disabled={saving || departments.length === 0}
                  className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingStaff ? 'Update Staff Member' : 'Generate ID & Save'}
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
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !additionalDept}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? 'Linking...' : 'Establish Department Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permanent Staff Deletion Confirmation Modal */}
      {deleteConfirmOpen && staffToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-rose-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900">
                  Delete Staff: {staffToDelete.displayName}
                </h3>
                <p className="text-xs font-mono text-brand-700 font-bold">
                  Permanent Member ID: {staffToDelete.memberId}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 mb-4 leading-relaxed">
              <span className="font-bold">Permanent Operation Warning: </span>
              Deleting a staff member permanently removes their profile and department links from Firestore. If this faculty member has active teaching assignments, draft timetable slots, or published timetable history, permanent deletion will be prevented to protect institutional academic records.
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
                  setStaffToDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
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
