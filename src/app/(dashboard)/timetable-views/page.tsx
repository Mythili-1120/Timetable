'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { getAllStaff, getCachedStaff } from '../../../lib/services/staffService';
import { getAllDepartments, getCachedDepartments } from '../../../lib/services/departmentService';
import { getAllClasses, getCachedClasses } from '../../../lib/services/classService';
import { getPublishedTimetables, getCachedPublishedTimetables, getStaffSchedule } from '../../../lib/services/timetableService';
import { getCollegeSettings, getCachedCollegeSettings, DEFAULT_SETTINGS } from '../../../lib/services/settingsService';
import { Staff, Department, ClassSection, PublishedTimetable, CollegeSettings, TimetableSlot, PeriodDefinition } from '../../../types';
import {
  Printer,
  User,
  Calendar,
  ChevronDown
} from 'lucide-react';

interface ColumnMeta {
  period: PeriodDefinition;
  isBreak: boolean;
  teachingIndex?: number;
  displayName: string;
  displayTime: string;
}

function getStaffInitials(name: string): string {
  if (!name) return 'FA';
  const clean = name.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
  return (clean[0][0] + clean[clean.length - 1][0]).toUpperCase();
}

export default function TimetableViewsPage() {
  const initStaff = getCachedStaff();
  const initDepts = getCachedDepartments();
  const initPub = getCachedPublishedTimetables('2025–2026');
  const initSettings = getCachedCollegeSettings();

  const [activeTab, setActiveTab] = useState<'staff' | 'class'>('staff');

  // Shared master data
  const [settings, setSettings] = useState<CollegeSettings | null>(() => initSettings);
  const [loading, setLoading] = useState(() => !initStaff || !initDepts);

  // Staff Timetable state
  const [staffList, setStaffList] = useState<Staff[]>(() => initStaff || []);
  const [selectedMemberId, setSelectedMemberId] = useState(() => (initStaff && initStaff.length > 0 ? initStaff[0].memberId : ''));
  const [staffSchedule, setStaffSchedule] = useState<{
    memberId: string;
    grid: (TimetableSlot | null)[][];
    totalHours: number;
    classesTaught: { classLabel: string; departmentId: string; subjectName: string; hours: number }[];
  } | null>(null);

  // Class Timetable state
  const [departments, setDepartments] = useState<Department[]>(() => initDepts || []);
  const [classes, setClasses] = useState<ClassSection[]>(() => (initDepts && initDepts.length > 0 ? getCachedClasses(initDepts[0].departmentId) || [] : []));
  const [publishedList, setPublishedList] = useState<PublishedTimetable[]>(() => initPub || []);
  const [selectedDept, setSelectedDept] = useState(() => (initDepts && initDepts.length > 0 ? initDepts[0].departmentId : ''));
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    async function loadInitial() {
      if (!initStaff || !initDepts) {
        setLoading(true);
      }
      try {
        const [st, deptList, pub, set] = await Promise.all([
          getAllStaff(),
          getAllDepartments(),
          getPublishedTimetables('2025–2026'),
          getCollegeSettings()
        ]);
        setStaffList(st);
        setDepartments(deptList);
        setPublishedList(pub);
        setSettings(set);

        const targetMemberId = selectedMemberId || (st.length > 0 ? st[0].memberId : '');
        const targetDeptId = selectedDept || (deptList.length > 0 ? deptList[0].departmentId : '');

        if (targetMemberId) {
          setSelectedMemberId(targetMemberId);
        }
        if (targetDeptId) {
          setSelectedDept(targetDeptId);
        }

        // Second-tier queries
        const [sched, cls] = await Promise.all([
          targetMemberId ? getStaffSchedule(targetMemberId, '2025–2026') : Promise.resolve(null),
          targetDeptId ? getAllClasses(targetDeptId) : Promise.resolve([])
        ]);

        if (sched) setStaffSchedule(sched);
        if (cls) {
          setClasses(cls);
          if (cls.length > 0 && !selectedClassId) {
            setSelectedClassId(cls[0].classId);
          }
        }
      } catch (err) {
        console.error('Failed to load timetable view dependencies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  const handleStaffChange = async (memberId: string) => {
    setSelectedMemberId(memberId);
    if (!memberId) {
      setStaffSchedule(null);
      return;
    }
    const res = await getStaffSchedule(memberId, '2025–2026');
    setStaffSchedule(res);
  };

  const handleDeptChange = async (deptId: string) => {
    setSelectedDept(deptId);
    const cls = await getAllClasses(deptId);
    setClasses(cls);
    if (cls.length > 0) {
      setSelectedClassId(cls[0].classId);
    } else {
      setSelectedClassId('');
    }
  };

  const selectedStaff = staffList.find(s => s.memberId === selectedMemberId);
  const activeClassTimetable = publishedList
    .filter(t => t.classId === selectedClassId)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const selectedClass = classes.find(c => c.classId === selectedClassId);
  const selectedDeptObj = departments.find(d => d.departmentId === selectedDept);

  const days = settings?.workingDays && settings.workingDays.length > 0
    ? settings.workingDays
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Columns built from college settings bell timings
  const columns: ColumnMeta[] = useMemo(() => {
    const periodList = settings?.periods && settings.periods.length > 0 ? settings.periods : DEFAULT_SETTINGS.periods;
    let teachingCounter = 0;
    return periodList.map((p, idx) => {
      if (p.isBreak) {
        const isLunch = (p as any).isLunch || p.id === 'LUNCH' || (p.name && p.name.toLowerCase().includes('lunch'));
        return {
          period: p,
          isBreak: true,
          displayName: isLunch ? 'Lunch' : 'Break',
          displayTime: isLunch ? '50 min' : '20 min'
        };
      }
      const teachingIdx = teachingCounter++;
      const timeStr = p.time || '';
      return {
        period: p,
        isBreak: false,
        teachingIndex: teachingIdx,
        displayName: p.name || `P${teachingIdx + 1}`,
        displayTime: timeStr ? timeStr.replace(/\s+/g, '') : ''
      };
    });
  }, [settings]);

  const currentGrid = activeTab === 'staff'
    ? (staffSchedule?.grid || [])
    : (activeClassTimetable?.grid || []);

  const isGridEmpty = activeTab === 'staff'
    ? Boolean(!staffSchedule || staffSchedule.totalHours === 0)
    : Boolean(!activeClassTimetable || !activeClassTimetable.grid || activeClassTimetable.totalHours === 0);

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-[#3431B7] px-7 py-6 text-white shadow-lg shadow-indigo-950/10 no-print">
        {/* Top Row: Sub-title and Segmented dashed bars */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-xs font-semibold text-indigo-200 tracking-wide">
            Master timetable viewer
          </span>
          {/* 8 Segmented dashed bars */}
          <div className="hidden sm:flex items-center gap-1.5 opacity-35">
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
            <div className="w-8 h-1 rounded-full bg-white" />
          </div>
        </div>

        {/* Bottom Row: Heading + Subtitle on Left, Tab Switcher + Print Sheet on Right */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mt-0.5">
              Timetable Views
            </h1>
            <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
              Consolidated viewer for faculty workloads and class schedules.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Pill Mode Switcher */}
            <div className="inline-flex p-1 rounded-2xl bg-[#28229E]/80 border border-white/10 backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setActiveTab('staff')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-white text-[#3431B7] shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Staff Timetable</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('class')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'class'
                    ? 'bg-white text-[#3431B7] shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Student / Class</span>
              </button>
            </div>

            {/* Print Sheet Action Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-700" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. SELECTOR TOOLBAR CARD */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs no-print">
        {activeTab === 'staff' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                SELECT FACULTY
              </span>

              {/* Styled selector with Avatar & Member ID */}
              <div className="relative inline-flex items-center">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs hover:border-slate-300 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-[#3431B7] text-white flex items-center justify-center text-[10px] font-black shrink-0">
                    {selectedStaff ? getStaffInitials(selectedStaff.displayName) : 'FA'}
                  </span>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => handleStaffChange(e.target.value)}
                    className="appearance-none bg-transparent font-bold text-xs text-slate-900 pr-6 focus:outline-none cursor-pointer"
                  >
                    {staffList.length === 0 ? (
                      <option value="">No faculty members registered</option>
                    ) : (
                      staffList.map(s => (
                        <option key={s.memberId} value={s.memberId}>
                          {s.displayName} ({s.memberId})
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none -ml-5" />
                </div>
              </div>
            </div>

            {selectedStaff && (
              <div className="text-xs font-semibold text-slate-500">
                Primary dept:{' '}
                <span className="text-slate-800 font-bold">
                  {selectedStaff.primaryDepartmentId || '—'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  DEPARTMENT
                </span>
                <select
                  value={selectedDept}
                  onChange={(e) => handleDeptChange(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-slate-200/90 rounded-xl bg-white text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 cursor-pointer"
                >
                  {departments.length === 0 ? (
                    <option value="">No departments</option>
                  ) : (
                    departments.map(d => (
                      <option key={d.departmentId} value={d.departmentId}>
                        {d.code} — {d.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  CLASS SECTION
                </span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-slate-200/90 rounded-xl bg-white text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 cursor-pointer"
                >
                  {classes.length === 0 ? (
                    <option value="">No classes configured</option>
                  ) : (
                    classes.map(c => (
                      <option key={c.classId} value={c.classId}>
                        {c.yearOfStudy} — Section {c.section}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="text-xs font-semibold text-slate-500">
              Academic Year:{' '}
              <span className="text-slate-800 font-bold">
                2025–2026
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. PRINT PREVIEW CONTAINER */}
      <div className="space-y-3">
        {/* Sub-label pill */}
        <div className="no-print">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-slate-500 bg-slate-200/70 border border-slate-300/60 shadow-2xs">
            Print preview • A4 landscape
          </span>
        </div>

        {/* A4 Landscape Document Sheet */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-8 md:p-10 max-w-6xl mx-auto space-y-6 relative overflow-hidden print-sheet print:p-0 print:border-none print:shadow-none print:max-w-none">
          {/* Institutional Header */}
          <div className="text-center">
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-wide uppercase">
              {settings?.collegeName || 'SSM INSTITUTE OF ENGINEERING AND TECHNOLOGY (AUTONOMOUS)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {settings?.address || 'Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002'}
            </p>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#3431B7] mt-2.5">
              {activeTab === 'staff'
                ? 'FACULTY WORKLOAD & TIMETABLE — ACADEMIC YEAR 2025-2026'
                : 'CLASS TIMETABLE — ACADEMIC YEAR 2025-2026'}
            </h3>
          </div>

          {/* Metadata 4-Column Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3.5 border-y border-slate-200/90 text-xs">
            {activeTab === 'staff' ? (
              <>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    FACULTY NAME
                  </span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {selectedStaff?.displayName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    PERMANENT ID
                  </span>
                  <span className="font-mono font-extrabold text-[#3431B7] text-sm">
                    {selectedStaff?.memberId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    DESIGNATION
                  </span>
                  <span className="font-bold text-slate-800 text-sm">
                    {selectedStaff?.designation || 'Assistant Professor'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    WEEKLY ALLOCATED
                  </span>
                  <span className="font-extrabold text-[#3431B7] text-sm">
                    {staffSchedule?.totalHours || 0} Hours
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    CLASS & SECTION
                  </span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    DEPARTMENT
                  </span>
                  <span className="font-extrabold text-slate-800 text-sm">
                    {selectedDeptObj?.name || selectedDept || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    VERSION / STATUS
                  </span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {activeClassTimetable ? `v${activeClassTimetable.versionNumber} (Published)` : 'Not Published'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                    WEEKLY ALLOCATED
                  </span>
                  <span className="font-extrabold text-[#3431B7] text-sm">
                    {activeClassTimetable?.totalHours || 0} Hours
                  </span>
                </div>
              </>
            )}
          </div>

          {/* The Timetable Grid */}
          <div className="relative overflow-x-auto border border-slate-200/90 rounded-xl">
            <table className="w-full text-center text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200/90">
                  <th className="py-3 px-4 border-r border-slate-200/90 w-24 text-left font-extrabold text-slate-700 text-xs uppercase tracking-wider">
                    DAY
                  </th>
                  {columns.map((col, idx) => (
                    <th
                      key={col.period.id || idx}
                      className={`py-2.5 px-2 border-r border-slate-200/90 last:border-r-0 ${
                        col.isBreak
                          ? 'bg-slate-100/70 w-16 min-w-[65px] max-w-[80px]'
                          : 'min-w-[100px]'
                      }`}
                    >
                      <div className={`font-extrabold text-xs ${col.isBreak ? 'text-slate-600' : 'text-slate-800'}`}>
                        {col.displayName}
                      </div>
                      {col.displayTime && (
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                          {col.displayTime}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {days.map((day, dIdx) => (
                  <tr key={day} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800 bg-white border-r border-slate-200/90 text-left whitespace-nowrap">
                      {day}
                    </td>
                    {columns.map((col, cIdx) => {
                      if (col.isBreak) {
                        return (
                          <td
                            key={col.period.id || cIdx}
                            className="py-2 px-1 border-r border-slate-200/90 bg-slate-50/60 h-16"
                          />
                        );
                      }

                      const pIdx = col.teachingIndex!;
                      const slot = currentGrid?.[dIdx]?.[pIdx];

                      return (
                        <td
                          key={col.period.id || cIdx}
                          className="py-2 px-1.5 border-r border-slate-200/90 last:border-r-0 h-16 bg-white"
                        >
                          {slot ? (
                            <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-indigo-50/60 border border-indigo-200/70 text-center shadow-2xs">
                              <span className="font-extrabold text-slate-900 text-xs truncate max-w-28 tracking-tight">
                                {slot.subjectCode}
                              </span>
                              {activeTab === 'staff' ? (
                                <>
                                  <span className="text-[10px] text-slate-600 font-medium truncate max-w-28 mt-0.5">
                                    {slot.classLabel}
                                  </span>
                                  <span className="text-[9px] text-[#3431B7] font-bold">
                                    {slot.departmentId.replace('dept-', '').toUpperCase()}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] text-slate-600 font-medium truncate max-w-28 mt-0.5">
                                    {slot.staffName}
                                  </span>
                                  {slot.memberId && (
                                    <span className="text-[9px] text-[#3431B7] font-mono font-semibold">
                                      {slot.memberId}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full text-slate-300 font-medium text-xs">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Floating Centered Card When No Periods Are Assigned */}
            {isGridEmpty && (
              <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none no-print">
                <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xl max-w-sm w-full mx-auto text-center flex flex-col items-center gap-2 pointer-events-auto animate-in zoom-in-95 duration-150">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-[#3431B7] flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-[#3431B7]" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    No periods assigned yet
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Classes appear here after a timetable is published.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Classes Taught Summary Bar (if staff has assigned classes across departments) */}
          {activeTab === 'staff' && staffSchedule && staffSchedule.classesTaught.length > 0 && (
            <div className="pt-2 no-print">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Assigned Classes Across All Departments
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {staffSchedule.classesTaught.map((c, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs">
                    <div className="font-bold text-slate-900">{c.classLabel}</div>
                    <div className="text-slate-600 truncate">{c.subjectName}</div>
                    <div className="text-[10px] text-[#3431B7] font-semibold mt-1">
                      {c.departmentId.replace('dept-', '').toUpperCase()} • {c.hours} hrs/week
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signatures Area */}
          <div className="pt-8 sm:pt-10">
            <div className="grid grid-cols-3 gap-6 text-center text-xs">
              <div>
                <div className="w-36 sm:w-52 mx-auto border-t-2 border-slate-300 pt-2 font-bold text-slate-700">
                  {activeTab === 'staff' ? 'Staff Signature' : 'Class Incharge Signature'}
                </div>
              </div>
              <div>
                <div className="w-36 sm:w-52 mx-auto border-t-2 border-slate-300 pt-2 font-bold text-slate-700">
                  HOD Signature
                </div>
              </div>
              <div>
                <div className="w-36 sm:w-52 mx-auto border-t-2 border-slate-300 pt-2 font-bold text-slate-700">
                  Principal Signature
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
