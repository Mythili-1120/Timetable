'use client';

import React, { useEffect, useState } from 'react';
import { getAllStaff, getCachedStaff } from '../../../lib/services/staffService';
import { getAllDepartments, getCachedDepartments } from '../../../lib/services/departmentService';
import { getAllClasses, getCachedClasses } from '../../../lib/services/classService';
import { getPublishedTimetables, getCachedPublishedTimetables, getStaffSchedule } from '../../../lib/services/timetableService';
import { getCollegeSettings, getCachedCollegeSettings } from '../../../lib/services/settingsService';
import { Staff, Department, ClassSection, PublishedTimetable, CollegeSettings, TimetableSlot } from '../../../types';
import { Printer, UserCheck, CalendarDays, BookOpen, Clock, Building, GraduationCap } from 'lucide-react';
import TimetableGrid from '../../../components/TimetableGrid';

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

        // Parallelize second-tier queries
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
    if (!memberId) return;
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

  const teachingPeriods = settings?.periods?.filter(p => !p.isBreak) || [];
  const days = settings?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timetable Views</h1>
          <p className="text-sm text-slate-500">
            Consolidated master timetable viewer for faculty workloads and class schedules
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle Pill */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              onClick={() => setActiveTab('staff')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Staff Timetable</span>
            </button>
            <button
              onClick={() => setActiveTab('class')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'class'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Student / Class Timetable</span>
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Selector Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs no-print">
        {activeTab === 'staff' ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Faculty:</span>
              <select
                value={selectedMemberId}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-64"
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
            </div>
            {selectedStaff && (
              <span className="text-xs font-medium text-slate-500">
                Primary Dept: <span className="font-bold text-slate-800">{selectedStaff.primaryDepartmentId}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Department:</span>
              <select
                value={selectedDept}
                onChange={(e) => handleDeptChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Class Section:</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-56"
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
        )}
      </div>

      {/* TAB 1: STAFF TIMETABLE VIEW */}
      {activeTab === 'staff' && (
        selectedStaff ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs print-sheet space-y-6">
            {/* Print Header */}
            <div className="text-center pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">
                {settings?.collegeName || 'SSM INSTITUTE OF ENGINEERING AND TECHNOLOGY'}
              </h2>
              <p className="text-xs text-slate-500">
                {settings?.address || 'Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002'}
              </p>
              <h3 className="text-sm font-extrabold text-brand-700 mt-2 uppercase tracking-wider">
                Faculty Workload & Timetable — Academic Year 2025–2026
              </h3>
            </div>

            {/* Profile Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block uppercase font-medium">Faculty Name</span>
                <span className="font-bold text-slate-900 text-sm">{selectedStaff.displayName}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-medium">Permanent ID</span>
                <span className="font-mono font-bold text-brand-700 text-sm">{selectedStaff.memberId}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-medium">Designation</span>
                <span className="font-semibold text-slate-800">{selectedStaff.designation}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-medium">Weekly Allocated</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {staffSchedule?.totalHours || 0} Hours
                </span>
              </div>
            </div>

            {/* Teaching Grid */}
            <TimetableGrid
              grid={staffSchedule?.grid || []}
              teachingPeriods={teachingPeriods}
              days={days}
              slotSubtitleType="class"
            />

            {/* Classes Taught Summary */}
            {staffSchedule && staffSchedule.classesTaught.length > 0 && (
              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Assigned Classes Across All Departments
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {staffSchedule.classesTaught.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs">
                      <div className="font-bold text-slate-900">{c.classLabel}</div>
                      <div className="text-slate-600 truncate">{c.subjectName}</div>
                      <div className="text-[10px] text-brand-600 font-semibold mt-1">
                        {c.departmentId.replace('dept-', '').toUpperCase()} • {c.hours} hrs/week
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Print Signatures */}
            <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs font-semibold text-slate-700 print-only">
              <div>
                <div className="border-t border-slate-400 pt-1.5">Staff Signature</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5">HOD Signature</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5">Principal Signature</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            No faculty members found in the college staff master.
          </div>
        )
      )}

      {/* TAB 2: STUDENT / CLASS TIMETABLE VIEW */}
      {activeTab === 'class' && (
        activeClassTimetable && selectedClass ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs print-sheet space-y-6">
            {/* Print Header */}
            <div className="text-center pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">
                {settings?.collegeName || 'SSM INSTITUTE OF ENGINEERING AND TECHNOLOGY'}
              </h2>
              <p className="text-xs text-slate-500">
                {settings?.address || 'Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002'}
              </p>
              <h3 className="text-sm font-extrabold text-brand-700 mt-2 uppercase tracking-wider">
                Department of {selectedDeptObj?.name || selectedClass.departmentId.toUpperCase()}
              </h3>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">
                Class Timetable: {selectedClass.yearOfStudy} — Section {selectedClass.section} (Academic Year 2025–2026)
              </p>
            </div>

            {/* Meta Bar */}
            <div className="flex items-center justify-between text-xs px-2 text-slate-600 font-medium">
              <div>
                Published Version: <span className="font-bold text-slate-900">v{activeClassTimetable.versionNumber}</span>
              </div>
              <div>
                Total Teaching Hours: <span className="font-bold text-emerald-700">{activeClassTimetable.totalHours} hrs</span>
              </div>
              <div>
                Published Date: {new Date(activeClassTimetable.publishedAt).toLocaleDateString()}
              </div>
            </div>

            {/* Timetable Grid */}
            <TimetableGrid
              grid={activeClassTimetable.grid || []}
              teachingPeriods={teachingPeriods}
              days={days}
              slotSubtitleType="staff"
            />

            {/* Print Signatures */}
            <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs font-semibold text-slate-700 print-only">
              <div>
                <div className="border-t border-slate-400 pt-1.5">Timetable Coordinator</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5">HOD</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5">Principal</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            {classes.length === 0
              ? 'No classes configured for this department.'
              : 'No published timetable found for this class section. Generate and publish a timetable in Timetable Generator.'}
          </div>
        )
      )}
    </div>
  );
}
