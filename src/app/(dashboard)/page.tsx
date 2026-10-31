'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDepartmentCounts } from '../../lib/services/departmentService';
import { getGlobalStaffCounts } from '../../lib/services/staffService';
import { getGlobalSubjectCounts } from '../../lib/services/subjectService';
import { getGlobalClassCounts } from '../../lib/services/classService';
import { getPublishedTimetableStats } from '../../lib/services/timetableService';
import { getCollegeSettings } from '../../lib/services/settingsService';
import { CollegeSettings } from '../../types';
import {
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  CalendarCheck2,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function DashboardPage() {
  const [deptCounts, setDeptCounts] = useState({ total: 0, active: 0, archived: 0 });
  const [staffCounts, setStaffCounts] = useState({ total: 0, active: 0, archived: 0 });
  const [subjectCounts, setSubjectCounts] = useState({ total: 0, active: 0, theory: 0, lab: 0 });
  const [classCounts, setClassCounts] = useState({ total: 0, active: 0 });
  const [timetableStats, setTimetableStats] = useState({ totalPublishedVersions: 0, uniqueClassesWithTimetable: 0 });
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [dCounts, stCounts, subCounts, clsCounts, ttStats, set] = await Promise.all([
          getDepartmentCounts(),
          getGlobalStaffCounts(),
          getGlobalSubjectCounts(),
          getGlobalClassCounts(),
          getPublishedTimetableStats(),
          getCollegeSettings()
        ]);
        setDeptCounts(dCounts);
        setStaffCounts(stCounts);
        setSubjectCounts(subCounts);
        setClassCounts(clsCounts);
        setTimetableStats(ttStats);
        setSettings(set);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Institutional Dashboard</h1>
          <p className="text-sm text-slate-500">
            {settings?.collegeName || 'SSM Institute of Engineering and Technology (Autonomous)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin Authority Verified
          </span>
        </div>
      </div>

      {/* KPI Metric Cards — Powered by Canonical Services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Departments</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{deptCounts.active}</span>
            <span className="text-xs text-slate-500 ml-1.5">Active</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Global Staff</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{staffCounts.active}</span>
            <span className="text-xs text-slate-500 ml-1.5">Members</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Subjects</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{subjectCounts.active}</span>
            <span className="text-xs text-slate-500 ml-1.5">Courses</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Classes</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{classCounts.active}</span>
            <span className="text-xs text-slate-500 ml-1.5">Cohorts</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Published</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{timetableStats.uniqueClassesWithTimetable}</span>
            <span className="text-xs text-slate-500 ml-1.5">Classes</span>
          </div>
        </div>
      </div>

      {/* First-Use Empty State Banner */}
      {!loading && deptCounts.active === 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-50 to-blue-50 border border-brand-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Welcome to SSM College Timetable System</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-xl">
              The operational database is clean and initialized. Start by creating your college academic departments.
            </p>
          </div>
          <Link
            href="/departments"
            prefetch={true}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <span>Create First Department</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Quick Launch & Institutional Timings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module Shortcuts */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4">Core Management Workflows</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/departments"
              prefetch={true}
              className="p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
                  🏢
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 group-hover:text-brand-700">Department Workspaces</h3>
                  <p className="text-xs text-slate-500">Manage faculty, subjects & cohorts per department</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/generator"
              prefetch={true}
              className="p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  ⚡
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 group-hover:text-indigo-700">Timetable Generator</h3>
                  <p className="text-xs text-slate-500">Automated clash-free timetable generation</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/staff"
              prefetch={true}
              className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  👤
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 group-hover:text-emerald-700">Staff Directory</h3>
                  <p className="text-xs text-slate-500">Global permanent IDs & multi-dept links</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/timetable-views"
              prefetch={true}
              className="p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  🖨️
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 group-hover:text-amber-700">Timetable Views</h3>
                  <p className="text-xs text-slate-500">View & print faculty and student class schedules</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>
        </div>

        {/* Preserved College Bell Schedule Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-600" />
              <h2 className="text-base font-bold text-slate-900">Bell Schedule & Timings</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Preserved institutional schedule (6 Working Days: Monday to Saturday).
            </p>

            <div className="space-y-1.5 text-xs">
              {settings?.periods?.map((p, idx) => (
                <div
                  key={p.id || idx}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    p.isBreak
                      ? 'bg-amber-50 text-amber-800 font-semibold border border-amber-200'
                      : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-[11px]">{p.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            Period duration: 50 min • Tea break: 20 min • Lunch: 50 min
          </div>
        </div>
      </div>
    </div>
  );
}
