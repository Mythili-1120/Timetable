'use client';

import React, { useEffect, useState } from 'react';
import { getAllDepartments, getCachedDepartments } from '../../../lib/services/departmentService';
import { getAllClasses, getCachedClasses } from '../../../lib/services/classService';
import { getAssignments, getSemestersForYear } from '../../../lib/services/assignmentService';
import { getAllSubjects, getCachedSubjects } from '../../../lib/services/subjectService';
import { getAllStaff, getCachedStaff } from '../../../lib/services/staffService';
import { getCollegeSettings, getCachedCollegeSettings } from '../../../lib/services/settingsService';
import {
  saveDraft,
  getDraft,
  publishTimetable,
  getGlobalBusySlots
} from '../../../lib/services/timetableService';
import { TimetableEngine } from '../../../lib/engine/generator';
import {
  Department,
  ClassSection,
  Subject,
  Staff,
  CollegeSettings,
  TimetableSlot,
  ClassTimetableDraft
} from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { Cpu, Lock, Save, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

export default function GeneratorPage() {
  const initDepts = getCachedDepartments();
  const initSubjs = getCachedSubjects();
  const initStaff = getCachedStaff();
  const initSettings = getCachedCollegeSettings();
  const firstDeptId = initDepts && initDepts.length > 0 ? initDepts[0].departmentId : '';
  const initClasses = firstDeptId ? getCachedClasses(firstDeptId) || [] : [];

  const [departments, setDepartments] = useState<Department[]>(() => initDepts || []);
  const [classes, setClasses] = useState<ClassSection[]>(() => initClasses);
  const [subjectsMap, setSubjectsMap] = useState<Map<string, Subject>>(() => {
    const sMap = new Map<string, Subject>();
    if (initSubjs) initSubjs.forEach(s => sMap.set(s.subjectId, s));
    return sMap;
  });
  const [staffMap, setStaffMap] = useState<Map<string, Staff>>(() => {
    const stMap = new Map<string, Staff>();
    if (initStaff) initStaff.forEach(st => stMap.set(st.memberId, st));
    return stMap;
  });
  const [settings, setSettings] = useState<CollegeSettings | null>(() => initSettings);

  // Form selections
  const [selectedDept, setSelectedDept] = useState(firstDeptId);
  const [selectedClassId, setSelectedClassId] = useState(() => (initClasses.length > 0 ? initClasses[0].classId : ''));
  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [academicYear, setAcademicYear] = useState('2025–2026');

  // Timetable State
  const [grid, setGrid] = useState<(TimetableSlot | null)[][]>([]);
  const [status, setStatus] = useState<'DRAFT' | 'GENERATED' | 'PUBLISHED'>('DRAFT');
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    async function init() {
      const [depts, subjs, staffList, set] = await Promise.all([
        getAllDepartments(),
        getAllSubjects(),
        getAllStaff(),
        getCollegeSettings()
      ]);
      setDepartments(depts);
      setSettings(set);

      const sMap = new Map<string, Subject>();
      subjs.forEach(s => sMap.set(s.subjectId, s));
      setSubjectsMap(sMap);

      const stMap = new Map<string, Staff>();
      staffList.forEach(st => stMap.set(st.memberId, st));
      setStaffMap(stMap);

      const targetDept = selectedDept || (depts.length > 0 ? depts[0].departmentId : '');
      if (targetDept) {
        if (!selectedDept) setSelectedDept(targetDept);
        await loadClassesForDept(targetDept);
      }
    }
    init();
  }, []);

  const loadClassesForDept = async (deptId: string) => {
    const cls = await getAllClasses(deptId);
    setClasses(cls);
    if (cls.length > 0) {
      setSelectedClassId(cls[0].classId);
      await loadClassDraft(cls[0].classId);
    } else {
      setSelectedClassId('');
      setGrid([]);
    }
  };

  const loadClassDraft = async (classId: string) => {
    const draft = await getDraft(classId);
    if (draft && draft.grid) {
      setGrid(draft.grid);
      setStatus(draft.status);
      setTotalAllocated(draft.totalAllocated);
    } else {
      setGrid([]);
      setStatus('DRAFT');
      setTotalAllocated(0);
    }
  };

  const handleDeptChange = async (deptId: string) => {
    setSelectedDept(deptId);
    await loadClassesForDept(deptId);
  };

  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
    await loadClassDraft(classId);
  };

  const handleRunGenerator = async () => {
    if (!selectedClassId || !settings) return;
    setGenerating(true);
    setDiagnostics([]);

    try {
      // 1. Fetch teaching assignments for this class
      let assignments = await getAssignments({ classId: selectedClassId });
      if (selectedSemester !== 'ALL') {
        const semAssignments = assignments.filter(a => a.semester === selectedSemester);
        if (semAssignments.length > 0) {
          assignments = semAssignments;
        }
      }
      if (assignments.length === 0) {
        setDiagnostics([`No teaching assignments configured for this class section${selectedSemester !== 'ALL' ? ` in ${selectedSemester}` : ''}. Please add assignments in the Teaching Assignments module first.`]);
        setGenerating(false);
        return;
      }

      // 2. Fetch global college-wide busy slots (from all other classes)
      const globalBusy = await getGlobalBusySlots(academicYear, selectedClassId);

      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      // 3. Run CSP solver
      const result = TimetableEngine.generate({
        classId: selectedClassId,
        classLabel,
        departmentId: selectedDept,
        academicYear,
        assignments,
        subjectsMap,
        staffMap,
        collegeSettings: settings,
        globalBusySlots: globalBusy
      });

      if (result.success) {
        setGrid(result.grid);
        setStatus('GENERATED');
        setTotalAllocated(result.totalAllocated);
        setDiagnostics([]);

        // Save generated state as DRAFT automatically
        if (user) {
          await saveDraft({
            classId: selectedClassId,
            departmentId: selectedDept,
            academicYear,
            grid: result.grid,
            totalAllocated: result.totalAllocated,
            status: 'GENERATED',
            updatedAt: new Date().toISOString()
          }, user.uid);
        }
      } else {
        setDiagnostics(result.diagnostics || ['Timetable generation failed due to constraints.']);
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setDiagnostics([err.message || 'An error occurred during generation.']);
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedClassId || grid.length === 0 || !user) return;
    setPublishing(true);

    try {
      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      await publishTimetable({
        classId: selectedClassId,
        classLabel,
        departmentId: selectedDept,
        academicYear,
        grid,
        totalHours: totalAllocated
      }, user.uid);

      setStatus('PUBLISHED');
      alert(`Timetable successfully published into authoritative historical archive!`);
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(`Failed to publish: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const teachingPeriods = settings?.periods?.filter(p => !p.isBreak) || [];
  const days = settings?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Global Timetable Generator</h1>
          <p className="text-sm text-slate-500">
            Automated Constraint Satisfaction Problem (CSP) Engine with college-wide conflict prevention
          </p>
        </div>
        <div className="flex items-center gap-2">
          {grid.length > 0 && status !== 'PUBLISHED' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{publishing ? 'Publishing...' : 'Publish & Lock'}</span>
            </button>
          )}
          <button
            onClick={handleRunGenerator}
            disabled={generating || !selectedClassId}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Cpu className="w-4 h-4" />
            <span>{generating ? 'Solving Constraints...' : 'Generate Timetable'}</span>
          </button>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Target Department:</label>
          <select
            value={selectedDept}
            onChange={(e) => handleDeptChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {departments.map(d => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Target Class Section:</label>
          <select
            value={selectedClassId}
            onChange={(e) => handleClassChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {classes.map(c => (
              <option key={c.classId} value={c.classId}>
                {c.yearOfStudy} — Section {c.section}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Semester:</label>
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Semesters</option>
            {(() => {
              const cls = classes.find(c => c.classId === selectedClassId);
              const sems = cls ? getSemestersForYear(cls.yearOfStudy) : ['Semester 1', 'Semester 2'];
              return sems.map(s => <option key={s} value={s}>{s}</option>);
            })()}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Timetable Status:</label>
          <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-semibold">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${
                status === 'PUBLISHED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : status === 'GENERATED'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {status === 'PUBLISHED' && <Lock className="w-3 h-3" />}
              {status}
            </span>
            <span className="text-slate-500 font-medium">({totalAllocated} hrs allocated)</span>
          </div>
        </div>
      </div>

      {/* Diagnostics / Error Alert */}
      {diagnostics.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <div className="flex items-center gap-2 font-bold text-sm mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Generation Diagnostics & Constraint Issues</span>
          </div>
          <ul className="list-disc list-inside text-xs space-y-1 text-amber-800">
            {diagnostics.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Timetable Interactive Grid */}
      {grid.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase">
                  <th className="p-3 w-28 text-left border-r border-slate-200">Day / Period</th>
                  {teachingPeriods.map((p, pIdx) => (
                    <th key={p.id} className="p-2.5 text-center border-r border-slate-200 last:border-r-0">
                      <div>{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{p.time}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {days.map((dayName, dIdx) => (
                  <tr key={dayName} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900 bg-slate-50 border-r border-slate-200">
                      {dayName}
                    </td>
                    {grid[dIdx]?.map((slot, pIdx) => (
                      <td
                        key={pIdx}
                        className={`p-2.5 text-center border-r border-slate-200 last:border-r-0 h-20 align-top ${
                          slot
                            ? slot.type === 'Lab'
                              ? 'bg-amber-50/70 border-amber-200'
                              : 'bg-blue-50/70 border-blue-200'
                            : 'bg-white'
                        }`}
                      >
                        {slot ? (
                          <div className="flex flex-col h-full justify-between">
                            <div>
                              <span className="font-bold text-slate-900 block truncate" title={slot.subjectName}>
                                {slot.subjectCode}
                              </span>
                              <span className="text-[10px] text-slate-600 truncate block">
                                {slot.subjectName}
                              </span>
                            </div>
                            <div className="mt-1 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-brand-700 truncate" title={slot.staffName}>
                                {slot.staffName}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">
                                {slot.memberId}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px] block mt-5">— Free —</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          <Cpu className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <h3 className="font-semibold text-slate-800 text-sm">No Timetable Generated Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Select a target department and class section above, then click <strong>Generate Timetable</strong> to run the college-wide CSP solver.
          </p>
        </div>
      )}
    </div>
  );
}

