'use client';

import React, { useEffect, useState } from 'react';
import {
  getAssignments,
  createAssignment,
  deleteAssignment,
  resolveSubjectForStaffAndClass,
  autoCreateTeachingAssignment,
  reassignStaff,
  getSemestersForYear
} from '../../../lib/services/assignmentService';
import { getAllDepartments } from '../../../lib/services/departmentService';
import { getDepartmentStaff, getAllStaff } from '../../../lib/services/staffService';
import { getAllSubjects } from '../../../lib/services/subjectService';
import { getAllClasses } from '../../../lib/services/classService';
import { TeachingAssignment, Department, Staff, Subject, ClassSection, SubjectResolutionResult } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { Briefcase, Plus, Trash2, Filter, Sparkles, CheckCircle2, AlertCircle, AlertTriangle, Layers, ArrowRightLeft, ShieldCheck } from 'lucide-react';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [allGlobalStaff, setAllGlobalStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected filters
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSemester, setSelectedSemester] = useState('ALL');

  // Modal form states
  const [modalOpen, setModalOpen] = useState(false);
  const [formDept, setFormDept] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formSemester, setFormSemester] = useState('Semester 1');
  const [formSubject, setFormSubject] = useState('');
  const [formStaff, setFormStaff] = useState('');
  const [formHours, setFormHours] = useState(4);
  const [resolution, setResolution] = useState<SubjectResolutionResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Reassign Modal State
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTargetAsgn, setReassignTargetAsgn] = useState<TeachingAssignment | null>(null);
  const [reassignNewMemberId, setReassignNewMemberId] = useState('');

  const { user } = useAuth();

  const loadAll = async () => {
    setLoading(true);
    const [depts, allS] = await Promise.all([getAllDepartments(), getAllStaff()]);
    setDepartments(depts);
    setAllGlobalStaff(allS);

    const initialDept = selectedDept || (depts[0]?.departmentId || '');
    setSelectedDept(initialDept);
    setFormDept(initialDept);

    await loadDepartmentScopedData(initialDept);
    setLoading(false);
  };

  const loadDepartmentScopedData = async (deptId: string) => {
    if (!deptId) return;
    const [asgns, deptStaff, subjs, cls] = await Promise.all([
      getAssignments({ departmentId: deptId }),
      getDepartmentStaff(deptId),
      getAllSubjects(deptId),
      getAllClasses(deptId)
    ]);
    setAssignments(asgns);
    setStaffList(deptStaff);
    setSubjects(subjs);
    setClasses(cls);

    if (cls.length > 0 && !formClass) setFormClass(cls[0].classId);
    if (subjs.length > 0 && !formSubject) setFormSubject(subjs[0].subjectId);
    if (deptStaff.length > 0 && !formStaff) setFormStaff(deptStaff[0].memberId);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDeptChange = async (deptId: string) => {
    setSelectedDept(deptId);
    setFormDept(deptId);
    setSelectedClass('ALL');
    setSelectedSemester('ALL');
    await loadDepartmentScopedData(deptId);
  };

  const triggerResolution = async (classId: string, memberId: string, semester?: string) => {
    if (!classId || !memberId) {
      setResolution(null);
      return;
    }
    setResolving(true);
    setModalError(null);
    try {
      const res = await resolveSubjectForStaffAndClass({ memberId, classId, semester });
      setResolution(res);
      if (res.status === 'SINGLE_MATCH' && res.selectedSubject) {
        setFormSubject(res.selectedSubject.subjectId);
        setFormHours(res.selectedSubject.weeklyHours);
      } else if (res.status === 'MULTIPLE_MATCHES' && res.matchingSubjects.length > 0) {
        setFormSubject(res.matchingSubjects[0].subjectId);
        setFormHours(res.matchingSubjects[0].weeklyHours);
      } else if (res.status === 'ALREADY_ASSIGNED' && res.existingAssignment) {
        setFormSubject(res.existingAssignment.subjectId);
        setFormHours(res.existingAssignment.weeklyHours);
      } else {
        setFormSubject('');
      }
    } catch (err: any) {
      console.error('Error resolving subject:', err);
      setModalError(err?.message || 'Failed to resolve curriculum course.');
    } finally {
      setResolving(false);
    }
  };

  const openModal = () => {
    const defaultClass = classes[0];
    const defaultClassId = defaultClass?.classId || '';
    const defaultStaff = staffList[0]?.memberId || allGlobalStaff[0]?.memberId || '';
    const sems = defaultClass ? getSemestersForYear(defaultClass.yearOfStudy) : ['Semester 1', 'Semester 2'];
    const defaultSem = sems[0] || 'Semester 1';

    setFormClass(defaultClassId);
    setFormSemester(defaultSem);
    setFormStaff(defaultStaff);
    setModalError(null);
    setModalOpen(true);
    if (defaultClassId && defaultStaff) {
      triggerResolution(defaultClassId, defaultStaff, defaultSem);
    }
  };

  const openReassignModal = (asgn: TeachingAssignment) => {
    setReassignTargetAsgn(asgn);
    const candidate = allGlobalStaff.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE')
      || staffList.find(s => s.memberId !== asgn.memberId && s.status === 'ACTIVE');
    setReassignNewMemberId(candidate?.memberId || '');
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
      await loadDepartmentScopedData(selectedDept);
    } catch (err: any) {
      console.error('Error reassigning faculty:', err);
      setModalError(err?.message || 'Failed to reassign faculty.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClass || !formStaff || !formSubject || !user) {
      setModalError('Please ensure class, faculty, and curriculum course are selected.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      await autoCreateTeachingAssignment(
        {
          memberId: formStaff,
          classId: formClass,
          subjectId: formSubject,
          semester: formSemester
        },
        user.uid
      );

      setModalOpen(false);
      await loadDepartmentScopedData(formDept);
    } catch (err: any) {
      console.error('Error creating assignment:', err);
      setModalError(err?.message || 'Failed to create teaching assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (assignmentId: string) => {
    if (!user) return;
    if (confirm('Delete this teaching assignment?')) {
      await deleteAssignment(assignmentId, user.uid);
      await loadDepartmentScopedData(selectedDept);
    }
  };

  const filteredAssignments = assignments.filter(a => {
    const matchesClass = selectedClass === 'ALL' || a.classId === selectedClass;
    const matchesSemester = selectedSemester === 'ALL' || a.semester === selectedSemester;
    return matchesClass && matchesSemester;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Teaching Assignments</h1>
          <p className="text-sm text-slate-500">Map global faculty members to department curriculum subjects and classes</p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Auto-Assign Faculty</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Department:</span>
          <select
            value={selectedDept}
            onChange={(e) => handleDeptChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {departments.map(d => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Class Section:</span>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Sections</option>
            {classes.map(c => (
              <option key={c.classId} value={c.classId}>
                {c.yearOfStudy} - Sec {c.section}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Semester:</span>
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
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

        <div className="sm:ml-auto text-xs text-slate-500">
          Total Assigned: <strong className="text-slate-800">{filteredAssignments.length}</strong>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Semester</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-4">Member ID</th>
                <th className="py-3 px-4">Hours/Wk</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                    No teaching assignments found. Click "Auto-Assign Faculty" above to assign faculty.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((asgn) => {
                  const staffObj = allGlobalStaff.find(s => s.memberId === asgn.memberId);
                  const subjObj = subjects.find(s => s.subjectId === asgn.subjectId);
                  const classObj = classes.find(c => c.classId === asgn.classId);

                  return (
                    <tr key={asgn.assignmentId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {classObj ? `${classObj.yearOfStudy} — Sec ${classObj.section}` : asgn.classId}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                          {asgn.semester || 'Semester 1'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{subjObj?.name || asgn.subjectId}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">({subjObj?.code || ''})</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-brand-700">
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
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
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
                            onClick={() => handleDelete(asgn.assignmentId)}
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

      {/* Automatic Assignment Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Automatic Teaching Assignment</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Select Staff + Class to automatically resolve curriculum course & weekly teaching hours.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  1. Target Class Section
                </label>
                <select
                  value={formClass}
                  onChange={(e) => {
                    const newClassId = e.target.value;
                    setFormClass(newClassId);
                    const cls = classes.find(c => c.classId === newClassId);
                    const sems = cls ? getSemestersForYear(cls.yearOfStudy) : ['Semester 1', 'Semester 2'];
                    const defaultSem = sems[0] || 'Semester 1';
                    setFormSemester(defaultSem);
                    triggerResolution(newClassId, formStaff, defaultSem);
                  }}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {classes.map(c => (
                    <option key={c.classId} value={c.classId}>
                      {c.yearOfStudy} — Section {c.section} ({c.academicYear})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Target Semester
                </label>
                <select
                  value={formSemester}
                  onChange={(e) => {
                    setFormSemester(e.target.value);
                    triggerResolution(formClass, formStaff, e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {(() => {
                    const cls = classes.find(c => c.classId === formClass);
                    const sems = cls ? getSemestersForYear(cls.yearOfStudy) : ['Semester 1', 'Semester 2'];
                    return sems.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ));
                  })()}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  2. Faculty Member
                </label>
                <select
                  value={formStaff}
                  onChange={(e) => {
                    setFormStaff(e.target.value);
                    triggerResolution(formClass, e.target.value);
                  }}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <optgroup label="Department Faculty">
                    {staffList.map(st => (
                      <option key={st.memberId} value={st.memberId}>
                        {st.displayName} ({st.memberId})
                      </option>
                    ))}
                  </optgroup>
                  {allGlobalStaff.filter(s => !staffList.some(ds => ds.memberId === s.memberId)).length > 0 && (
                    <optgroup label="Cross-Department Faculty">
                      {allGlobalStaff
                        .filter(s => !staffList.some(ds => ds.memberId === s.memberId))
                        .map(st => (
                          <option key={st.memberId} value={st.memberId}>
                            {st.displayName} ({st.memberId}) — Cross-Dept Link
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Automatic Subject Resolution Card */}
              <div className="pt-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  3. Resolved Curriculum Course & Hours
                </label>

                {resolving && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Sparkles className="w-4 h-4 text-brand-600 animate-spin" />
                    <span>Resolving class curriculum and staff mappings...</span>
                  </div>
                )}

                {!resolving && resolution && (
                  <>
                    {/* Case 1: Exactly One Matching Subject */}
                    {resolution.status === 'SINGLE_MATCH' && resolution.selectedSubject && (
                      <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/70 text-emerald-950 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-900">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Auto-Resolved Subject</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white">
                            Authoritative Match
                          </span>
                        </div>
                        <div className="pt-1">
                          <p className="font-bold text-base text-slate-900">
                            {resolution.selectedSubject.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-600 font-medium">
                            <span className="font-mono font-bold text-brand-700 bg-white px-2 py-0.5 rounded border border-brand-200">
                              {resolution.selectedSubject.code}
                            </span>
                            <span>Type: <strong className="text-slate-800">{resolution.selectedSubject.type}</strong></span>
                            <span>Weekly Load: <strong className="text-slate-800">{resolution.selectedSubject.weeklyHours} hrs/week</strong></span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Case 2: Multiple Matching Subjects */}
                    {resolution.status === 'MULTIPLE_MATCHES' && (
                      <div className="p-4 rounded-xl border border-blue-300 bg-blue-50/70 text-blue-950 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900">
                            <Layers className="w-4 h-4 text-blue-600" />
                            <span>Multiple Mappings Found ({resolution.matchingSubjects.length})</span>
                          </div>
                          <span className="text-[11px] text-blue-700 font-medium">Select course to assign:</span>
                        </div>
                        <div className="space-y-1.5">
                          {resolution.matchingSubjects.map(s => {
                            const isSelected = formSubject === s.subjectId;
                            return (
                              <div
                                key={s.subjectId}
                                onClick={() => {
                                  setFormSubject(s.subjectId);
                                  setFormHours(s.weeklyHours);
                                }}
                                className={`p-2.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-white border-brand-600 shadow-2xs font-semibold text-slate-900'
                                    : 'bg-white/60 border-slate-200 hover:bg-white text-slate-700'
                                }`}
                              >
                                <div>
                                  <span className="font-mono font-bold text-brand-700 mr-2">{s.code}</span>
                                  <span>{s.name}</span>
                                </div>
                                <span className="font-medium text-slate-500">
                                  {s.type} • {s.weeklyHours}h
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Case 3: No Matching Subject */}
                    {resolution.status === 'NO_MATCH' && (
                      <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 text-amber-950 space-y-2.5">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>No Active Mapping in This Curriculum</span>
                        </div>
                        <p className="text-[11px] text-amber-800">
                          Faculty member has not yet been assigned to a course in this class curriculum. Select from the available class courses to establish the mapping:
                        </p>
                        <div>
                          <select
                            value={formSubject}
                            onChange={(e) => {
                              setFormSubject(e.target.value);
                              const s = resolution.curriculumSubjects.find(sub => sub.subjectId === e.target.value);
                              if (s) setFormHours(s.weeklyHours);
                            }}
                            className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            <option value="">-- Choose Curriculum Course to Map --</option>
                            {resolution.curriculumSubjects.map(s => (
                              <option key={s.subjectId} value={s.subjectId}>
                                {s.code} — {s.name} ({s.type}, {s.weeklyHours}h)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Case 4: Already Assigned */}
                    {resolution.status === 'ALREADY_ASSIGNED' && (
                      <div className="p-4 rounded-xl border border-slate-300 bg-slate-100 text-slate-800 flex items-start gap-2.5 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900">Assignment Already Exists</p>
                          <p className="text-slate-600 mt-0.5">{resolution.message}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                  disabled={
                    saving ||
                    resolving ||
                    !formSubject ||
                    resolution?.status === 'ALREADY_ASSIGNED'
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'Confirming Assignment...'
                      : resolution?.status === 'ALREADY_ASSIGNED'
                      ? 'Already Assigned'
                      : 'Confirm & Create Assignment'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Faculty Modal Dialog */}
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
                      const st = allGlobalStaff.find(s => s.memberId === reassignTargetAsgn.memberId) || staffList.find(s => s.memberId === reassignTargetAsgn.memberId);
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
                    {staffList.filter(st => st.memberId !== reassignTargetAsgn.memberId).map(st => (
                      <option key={st.memberId} value={st.memberId}>
                        {st.displayName} ({st.memberId})
                      </option>
                    ))}
                  </optgroup>
                  {allGlobalStaff.filter(s => !staffList.some(ds => ds.memberId === s.memberId) && s.memberId !== reassignTargetAsgn.memberId).length > 0 && (
                    <optgroup label="Cross-Department Faculty (College Directory)">
                      {allGlobalStaff
                        .filter(s => !staffList.some(ds => ds.memberId === s.memberId) && s.memberId !== reassignTargetAsgn.memberId)
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
