'use client';

import React, { useEffect, useState } from 'react';
import { getAllStaff } from '../../../lib/services/staffService';
import { getAllDepartments } from '../../../lib/services/departmentService';
import { getAllClasses } from '../../../lib/services/classService';
import { getPublishedTimetables, getStaffSchedule } from '../../../lib/services/timetableService';
import { getCollegeSettings } from '../../../lib/services/settingsService';
import { Staff, Department, ClassSection, PublishedTimetable, CollegeSettings, TimetableSlot } from '../../../types';
import { Printer, UserCheck, CalendarDays, BookOpen, Clock, Building, GraduationCap } from 'lucide-react';

export default function TimetableViewsPage() {
  const [activeTab, setActiveTab] = useState<'staff' | 'class'>('staff');

  // Shared master data
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Staff Timetable state
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [staffSchedule, setStaffSchedule] = useState<{
    memberId: string;
    grid: (TimetableSlot | null)[][];
    totalHours: number;
    classesTaught: { classLabel: string; departmentId: string; subjectName: string; hours: number }[];
  } | null>(null);

  // Class Timetable state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [publishedList, setPublishedList] = useState<PublishedTimetable[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
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

        if (st.length > 0) {
          setSelectedMemberId(st[0].memberId);
          const sched = await getStaffSchedule(st[0].memberId, '2025–2026');
          setStaffSchedule(sched);
        }

        if (deptList.length > 0) {
          setSelectedDept(deptList[0].departmentId);
          const cls = await getAllClasses(deptList[0].departmentId);
          setClasses(cls);
          if (cls.length > 0) {
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
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3 border-r border-slate-300 w-24">Day</th>
                    {teachingPeriods.map((p, idx) => (
                      <th key={p.id} className="py-2.5 px-2 border-r border-slate-300">
                        <div>{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{p.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {days.map((day, dIdx) => (
                    <tr key={day} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-slate-800 bg-slate-50 border-r border-slate-300 text-left">
                        {day}
                      </td>
                      {teachingPeriods.map((p, pIdx) => {
                        const slot = staffSchedule?.grid?.[dIdx]?.[pIdx];
                        return (
                          <td
                            key={p.id}
                            className={`py-2 px-1 border-r border-slate-300 h-16 ${
                              slot ? 'bg-brand-50/50' : 'bg-white'
                            }`}
                          >
                            {slot ? (
                              <div className="flex flex-col items-center justify-center p-1 rounded-sm bg-white border border-brand-200 shadow-2xs">
                                <span className="font-bold text-brand-900 text-[11px] truncate max-w-28">
                                  {slot.subjectCode}
                                </span>
                                <span className="text-[10px] text-slate-600 font-medium truncate max-w-28">
                                  {slot.classLabel}
                                </span>
                                <span className="text-[9px] text-brand-600 font-mono">
                                  {slot.departmentId.replace('dept-', '').toUpperCase()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3 border-r border-slate-300 w-24">Day</th>
                    {teachingPeriods.map((p) => (
                      <th key={p.id} className="py-2.5 px-2 border-r border-slate-300">
                        <div>{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{p.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {days.map((day, dIdx) => (
                    <tr key={day} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-slate-800 bg-slate-50 border-r border-slate-300 text-left">
                        {day}
                      </td>
                      {teachingPeriods.map((p, pIdx) => {
                        const slot = activeClassTimetable.grid?.[dIdx]?.[pIdx];
                        return (
                          <td
                            key={p.id}
                            className={`py-2 px-1 border-r border-slate-300 h-16 ${
                              slot ? 'bg-indigo-50/40' : 'bg-white'
                            }`}
                          >
                            {slot ? (
                              <div className="flex flex-col items-center justify-center p-1 rounded-sm bg-white border border-indigo-200 shadow-2xs">
                                <span className="font-bold text-slate-900 text-[11px] truncate max-w-28">
                                  {slot.subjectCode}
                                </span>
                                <span className="text-[10px] text-brand-700 font-medium truncate max-w-28">
                                  {slot.staffName}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {slot.memberId}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
