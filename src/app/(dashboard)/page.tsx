'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getDepartmentCounts, getCachedDepartmentCounts } from '../../lib/services/departmentService';
import { getGlobalStaffCounts, getCachedGlobalStaffCounts, getAllStaff, getCachedStaff } from '../../lib/services/staffService';
import { getGlobalSubjectCounts, getCachedGlobalSubjectCounts } from '../../lib/services/subjectService';
import { getGlobalClassCounts, getCachedGlobalClassCounts, getAllClasses, getCachedClasses } from '../../lib/services/classService';
import {
  getPublishedTimetableStats,
  getCachedPublishedTimetableStats,
  getPublishedTimetables,
  getDraft
} from '../../lib/services/timetableService';
import { getCollegeSettings, getCachedCollegeSettings, DEFAULT_SETTINGS } from '../../lib/services/settingsService';
import { CollegeSettings, ClassSection, Staff, TimetableSlot, PublishedTimetable } from '../../types';
import {
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  Calendar,
  Check,
  ChevronRight,
  Zap,
  CalendarCheck2
} from 'lucide-react';

export default function DashboardPage() {
  const initDepts = getCachedDepartmentCounts();
  const initStaff = getCachedGlobalStaffCounts();
  const initSubjs = getCachedGlobalSubjectCounts();
  const initClass = getCachedGlobalClassCounts();
  const initTT = getCachedPublishedTimetableStats();
  const initSettings = getCachedCollegeSettings();

  const [deptCounts, setDeptCounts] = useState(() => initDepts || { total: 0, active: 0, archived: 0 });
  const [staffCounts, setStaffCounts] = useState(() => initStaff || { total: 0, active: 0, archived: 0 });
  const [subjectCounts, setSubjectCounts] = useState(() => initSubjs || { total: 0, active: 0, theory: 0, lab: 0 });
  const [classCounts, setClassCounts] = useState(() => initClass || { total: 0, active: 0 });
  const [timetableStats, setTimetableStats] = useState(() => initTT || { totalPublishedVersions: 0, uniqueClassesWithTimetable: 0 });
  const [settings, setSettings] = useState<CollegeSettings>(() => initSettings || DEFAULT_SETTINGS);

  const [allStaffList, setAllStaffList] = useState<Staff[]>(() => getCachedStaff() || []);
  const [allClassList, setAllClassList] = useState<ClassSection[]>(() => getCachedClasses() || []);
  const [publishedTimetables, setPublishedTimetables] = useState<PublishedTimetable[]>([]);
  const [draftsMap, setDraftsMap] = useState<Map<string, (TimetableSlot | null)[][]>>(new Map());
  const [draftStatusMap, setDraftStatusMap] = useState<Map<string, string>>(new Map());
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [loading, setLoading] = useState(() => !initDepts);

  useEffect(() => {
    async function loadData() {
      try {
        const [dCounts, stCounts, subCounts, clsCounts, ttStats, set, staff, cls, published] = await Promise.all([
          getDepartmentCounts(),
          getGlobalStaffCounts(),
          getGlobalSubjectCounts(),
          getGlobalClassCounts(),
          getPublishedTimetableStats(),
          getCollegeSettings(),
          getAllStaff(),
          getAllClasses(),
          getPublishedTimetables()
        ]);

        setDeptCounts(dCounts);
        setStaffCounts(stCounts);
        setSubjectCounts(subCounts);
        setClassCounts(clsCounts);
        setTimetableStats(ttStats);
        setSettings(set);
        setAllStaffList(staff);
        setAllClassList(cls);
        setPublishedTimetables(published);

        // Fetch drafts and published grids for all classes
        const dMap = new Map<string, (TimetableSlot | null)[][]>();
        const statusMap = new Map<string, string>();

        await Promise.all(
          cls.map(async c => {
            const pub = published.find(p => p.classId === c.classId);
            if (pub && pub.grid) {
              statusMap.set(c.classId, 'PUBLISHED');
              dMap.set(c.classId, pub.grid);
            } else {
              const draft = await getDraft(c.classId);
              if (draft && draft.grid) {
                dMap.set(c.classId, draft.grid);
                statusMap.set(c.classId, draft.status || 'DRAFT');
              } else {
                statusMap.set(c.classId, 'NOT_GENERATED');
              }
            }
          })
        );

        setDraftsMap(dMap);
        setDraftStatusMap(statusMap);

        if (cls.length > 0 && !selectedClassId) {
          setSelectedClassId(cls[0].classId);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 1. Timetable Status Metrics
  const totalClasses = classCounts.active || allClassList.length;
  const publishedClassesCount = timetableStats.uniqueClassesWithTimetable;

  let draftCount = 0;
  let lockedCount = 0;
  allClassList.forEach(cls => {
    const s = draftStatusMap.get(cls.classId);
    if (s === 'PUBLISHED') {
      lockedCount++;
    } else if (s === 'DRAFT' || s === 'GENERATED') {
      draftCount++;
    }
  });

  // 2. Setup Progress Metrics Calculation (Dynamic max scale)
  const maxSetupVal = Math.max(
    2,
    deptCounts.active,
    staffCounts.active,
    subjectCounts.active,
    classCounts.active,
    publishedClassesCount
  );

  const setupProgressRows = [
    { label: 'Departments', value: deptCounts.active },
    { label: 'Staff members', value: staffCounts.active },
    { label: 'Subjects', value: subjectCounts.active },
    { label: 'Classes', value: totalClasses },
    { label: 'Published', value: publishedClassesCount }
  ];

  // 3. Weekly Period Usage Calculation for Selected Class
  const activeClass = allClassList.find(c => c.classId === selectedClassId) || allClassList[0];
  const activeGrid = activeClass ? draftsMap.get(activeClass.classId) || [] : [];
  const activeStatus = activeClass ? draftStatusMap.get(activeClass.classId) || 'draft' : 'draft';

  let usedPeriodsCount = 0;
  activeGrid.forEach(row => {
    if (Array.isArray(row)) {
      row.forEach(slot => {
        if (slot) usedPeriodsCount++;
      });
    }
  });

  const workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const teachingPeriodLabels = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
  const totalSlotsCapacity = workingDays.length * teachingPeriodLabels.length; // 42 periods

  // Donut chart SVG calculations
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius; // ~263.89
  const totalForDonut = Math.max(1, totalClasses);
  const activeProportion = (draftCount + lockedCount) / totalForDonut;
  const donutDashoffset = donutCircumference - donutCircumference * activeProportion;

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-[#3431B7] px-7 py-7 text-white shadow-lg shadow-indigo-950/10">
        {/* Top-Right: 8 Segmented dashed bars & Admin Verified Badge */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-xs font-semibold text-indigo-200 tracking-wide uppercase">
            Executive overview
          </span>
          <div className="flex items-center gap-3">
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

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-slate-900 font-bold text-xs shadow-xs">
              <Check className="w-3.5 h-3.5 text-slate-800 stroke-[3]" />
              <span>Admin Authority Verified</span>
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1">
            Institutional Dashboard
          </h1>
          <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
            {settings?.collegeName || 'SSM Institute of Engineering and Technology (Autonomous)'}
          </p>
        </div>
      </div>

      {/* 2. FIVE KPI METRIC CARDS (White floating card spanning full width with vertical dividers) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Metric 1: Departments */}
        <div className="flex items-center gap-3.5 px-3 sm:px-4 py-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              DEPARTMENTS
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {deptCounts.active}
              </span>
              <span className="text-xs font-semibold text-slate-500">Active</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Global Staff */}
        <div className="flex items-center gap-3.5 px-3 sm:px-4 py-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              GLOBAL STAFF
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {staffCounts.active}
              </span>
              <span className="text-xs font-semibold text-slate-500">Members</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Subjects */}
        <div className="flex items-center gap-3.5 px-3 sm:px-4 py-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              SUBJECTS
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {subjectCounts.active}
              </span>
              <span className="text-xs font-semibold text-slate-500">Courses</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Classes */}
        <div className="flex items-center gap-3.5 px-3 sm:px-4 py-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              CLASSES
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {totalClasses}
              </span>
              <span className="text-xs font-semibold text-slate-500">Cohorts</span>
            </div>
          </div>
        </div>

        {/* Metric 5: Published */}
        <div className="flex items-center gap-3.5 px-3 sm:px-4 py-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              PUBLISHED
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">
                {publishedClassesCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">Classes</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MIDDLE ROW (Setup Progress, Timetable Status, Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Card 1: Setup progress across the college (col-span-5) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Setup progress across the college
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              From departments to published timetables
            </p>

            <div className="space-y-3.5 mt-5">
              {setupProgressRows.map(row => {
                const widthPercent = (row.value / maxSetupVal) * 100;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-700 w-28 shrink-0">
                      {row.label}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-[#3431B7] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, widthPercent))}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs font-bold w-6 text-right shrink-0 ${
                        row.value === 0 ? 'text-amber-600' : 'text-slate-800'
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-900 text-xs font-bold text-center">
            {publishedClassesCount === 0 && totalClasses > 0 ? (
              <span>Next step: publish your first class timetable (0 of {totalClasses} published)</span>
            ) : publishedClassesCount === totalClasses && totalClasses > 0 ? (
              <span className="text-emerald-800">
                All {totalClasses} class timetables are locked & published to institutional archive
              </span>
            ) : (
              <span>
                Next step: publish your remaining class timetables ({publishedClassesCount} of {totalClasses} published)
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Timetable status (col-span-3) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between items-center text-center">
          <div className="w-full">
            <h2 className="text-base font-extrabold text-slate-900">Timetable status</h2>
            <p className="text-xs text-slate-400 mt-0.5">Across all classes</p>
          </div>

          {/* Donut Chart */}
          <div className="py-2 flex items-center justify-center">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Track */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  stroke="#E0E7FF"
                  strokeWidth="11"
                  fill="none"
                />
                {/* Active Arc */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  stroke="#3431B7"
                  strokeWidth="11"
                  fill="none"
                  strokeDasharray={donutCircumference}
                  strokeDashoffset={donutDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-900 leading-none">
                  {totalClasses}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 mt-0.5">
                  {totalClasses === 1 ? 'class' : 'classes'}
                </span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3.5 text-xs font-semibold text-slate-600 pt-1 w-full border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#A5B4FC]" />
              <span className="text-slate-500">Draft</span>
              <span className="font-bold text-slate-800">{draftCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4338CA]" />
              <span className="text-slate-500">Locked</span>
              <span className="font-bold text-slate-800">{lockedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#1E1B4B]" />
              <span className="text-slate-500">Published</span>
              <span className="font-bold text-slate-800">{publishedClassesCount}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Quick actions (col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <h2 className="text-base font-extrabold text-slate-900 mb-3">Quick actions</h2>

          <div className="space-y-2">
            <Link
              href="/departments"
              className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100/80 text-slate-600 group-hover:text-[#3431B7] group-hover:bg-indigo-50 flex items-center justify-center shrink-0 transition-colors">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#3431B7] transition-colors leading-tight">
                    Department Workspaces
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Faculty, subjects & cohorts</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/generator"
              className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100/80 text-slate-600 group-hover:text-[#3431B7] group-hover:bg-indigo-50 flex items-center justify-center shrink-0 transition-colors">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#3431B7] transition-colors leading-tight">
                    Timetable Generator
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Clash-free timetables</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/staff"
              className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100/80 text-slate-600 group-hover:text-[#3431B7] group-hover:bg-indigo-50 flex items-center justify-center shrink-0 transition-colors">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#3431B7] transition-colors leading-tight">
                    Staff Directory
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Permanent IDs & links</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/timetable-views"
              className="p-3 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100/80 text-slate-600 group-hover:text-[#3431B7] group-hover:bg-indigo-50 flex items-center justify-center shrink-0 transition-colors">
                  <CalendarCheck2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#3431B7] transition-colors leading-tight">
                    Timetable Views
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">View & print schedules</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>
        </div>
      </div>

      {/* 4. DAILY BELL SCHEDULE ROW */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-slate-900">Daily bell schedule</h2>
            <span className="text-xs text-slate-400 font-medium">
              6 working days • Monday to Saturday
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Period 50 min • Tea break 20 min • Lunch 50 min
          </span>
        </div>

        {/* Visual Period Badges Timeline */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-center">
          {/* P1 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P1</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">9:00-9:50</div>
          </div>

          {/* P2 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P2</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">9:50-10:40</div>
          </div>

          {/* P3 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P3</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">10:40-11:30</div>
          </div>

          {/* Tea Break */}
          <div className="min-w-[58px] bg-white border border-slate-200 text-slate-600 rounded-xl py-3 px-2 shadow-2xs">
            <div className="text-xs font-bold">Tea</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">20m</div>
          </div>

          {/* P4 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P4</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">11:50-12:40</div>
          </div>

          {/* P5 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P5</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">12:40-1:30</div>
          </div>

          {/* Lunch Break */}
          <div className="min-w-[68px] bg-white border border-slate-200 text-slate-600 rounded-xl py-3 px-2 shadow-2xs">
            <div className="text-xs font-bold">Lunch</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">1:30-2:20</div>
          </div>

          {/* P6 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P6</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">2:20-3:10</div>
          </div>

          {/* P7 */}
          <div className="flex-1 min-w-[76px] bg-[#3431B7] text-white rounded-xl py-3 px-3 shadow-2xs">
            <div className="text-xs font-black">P7</div>
            <div className="text-[10px] text-indigo-100/90 font-medium mt-0.5">3:10-4:00</div>
          </div>
        </div>
      </div>

      {/* 5. WEEKLY PERIOD USAGE HEATMAP MATRIX */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900">Weekly period usage</h2>
              <span className="text-xs text-slate-400 font-medium">
                {activeClass
                  ? `${activeClass.yearOfStudy} • Section ${activeClass.section} (${activeStatus.toLowerCase()})`
                  : '1st Year • Section B (draft)'}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-900">
              {usedPeriodsCount} of {totalSlotsCapacity} periods used
            </span>
          </div>

          {/* Matrix */}
          <div className="mt-5 space-y-2.5">
            {/* Period Column Headers */}
            <div className="flex items-center gap-3">
              <div className="w-10 shrink-0" />
              <div className="flex-1 grid grid-cols-7 gap-2 sm:gap-3 text-center">
                {teachingPeriodLabels.map(pLabel => (
                  <span key={pLabel} className="text-[11px] font-bold text-slate-400">
                    {pLabel}
                  </span>
                ))}
              </div>
            </div>

            {/* Day Rows */}
            {workingDays.map((dayName, dayIdx) => (
              <div key={dayName} className="flex items-center gap-3">
                <span className="w-10 text-xs font-bold text-slate-600 shrink-0">
                  {dayName}
                </span>
                <div className="flex-1 grid grid-cols-7 gap-2 sm:gap-3">
                  {teachingPeriodLabels.map((_, periodIdx) => {
                    const isFilled = activeGrid[dayIdx] && activeGrid[dayIdx][periodIdx] !== null;
                    return (
                      <div
                        key={periodIdx}
                        className={`h-6 rounded-lg transition-all ${
                          isFilled ? 'bg-[#3431B7] shadow-2xs' : 'bg-slate-100/90'
                        }`}
                        title={`${dayName} Period ${periodIdx + 1}: ${
                          isFilled ? 'Allocated' : 'Empty'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-400 mt-5">
          <span>Grid reflects periods scheduled across standard teaching slots.</span>
          {allClassList.length > 1 && (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="text-xs font-bold text-[#3431B7] bg-indigo-50/60 hover:bg-indigo-100/70 border border-indigo-200/80 rounded-lg px-2.5 py-1 cursor-pointer outline-none transition-colors"
            >
              {allClassList.map(c => (
                <option key={c.classId} value={c.classId}>
                  {c.yearOfStudy} Sec {c.section}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
