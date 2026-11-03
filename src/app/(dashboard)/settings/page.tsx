'use client';

import React, { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import { getCollegeSettings, updateCollegeSettings, DEFAULT_SETTINGS } from '../../../lib/services/settingsService';
import { CollegeSettings, PeriodDefinition } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  FileText,
  Calendar,
  Clock,
  Check,
  CheckCircle2,
  Info,
  X
} from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [collegeName, setCollegeName] = useState('');
  const [collegeShortName, setCollegeShortName] = useState('');
  const [address, setAddress] = useState('');
  const [periodDuration, setPeriodDuration] = useState(50);
  const [periods, setPeriods] = useState<PeriodDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      const s = await getCollegeSettings();
      setSettings(s);
      setCollegeName(s.collegeName || DEFAULT_SETTINGS.collegeName);
      setCollegeShortName(s.collegeShortName || DEFAULT_SETTINGS.collegeShortName || 'SSMIET');
      setAddress(s.address || DEFAULT_SETTINGS.address);
      setPeriodDuration(s.periodDurationMinutes || DEFAULT_SETTINGS.periodDurationMinutes || 50);
      setPeriods(s.periods && s.periods.length > 0 ? s.periods : DEFAULT_SETTINGS.periods);
    }
    load();
  }, []);

  // Keyboard Escape listener for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModalOpen) setConfirmModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModalOpen]);

  const parseTimeRange = (timeStr: string) => {
    const parts = (timeStr || '').split('-').map(s => s.trim());
    return {
      start: parts[0] || '09:00',
      end: parts[1] || '09:50'
    };
  };

  const handleTimePartChange = (idx: number, isEnd: boolean, val: string) => {
    const updated = [...periods];
    const { start, end } = parseTimeRange(updated[idx].time);
    if (isEnd) {
      updated[idx].time = `${start} - ${val}`;
    } else {
      updated[idx].time = `${val} - ${end}`;
    }
    setPeriods(updated);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSuccess(false);

    const ok = await updateCollegeSettings({
      collegeName,
      collegeShortName,
      address,
      periodDurationMinutes: Number(periodDuration),
      periods
    }, user.uid);

    setSaving(false);
    setConfirmModalOpen(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } else {
      alert('Failed to update college settings.');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-[#3431B7] px-7 py-7 text-white shadow-lg shadow-indigo-950/10">
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-xs font-semibold text-indigo-200 tracking-wide uppercase">
            Institution & schedule
          </span>
          {/* Decorative segmented dashed bars */}
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

        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mt-1">
            College Settings
          </h1>
          <p className="text-sm text-indigo-100/90 mt-1 max-w-xl">
            Keep the college identity and the daily bell timings correct.
          </p>
        </div>
      </div>

      {/* SUCCESS TOAST / BANNER */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-emerald-900 shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved successfully and updated across the institution!</span>
          </div>
          <button
            onClick={() => setSuccess(false)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Institutional Identity & Print Preview (col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card A: Institutional Identity & Address */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Institutional Identity & Address
              </h2>
            </div>

            <div className="space-y-4 pt-1">
              {/* Field 1: College Official Name */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  COLLEGE OFFICIAL NAME
                </label>
                <input
                  type="text"
                  required
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-bold text-slate-800 shadow-2xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all"
                  placeholder="SSM Institute of Engineering and Technology (Autonomous)"
                />
              </div>

              {/* Field 2: College Short Name / Code */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  COLLEGE SHORT NAME / CODE
                </label>
                <input
                  type="text"
                  required
                  value={collegeShortName}
                  onChange={(e) => setCollegeShortName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-bold text-slate-800 shadow-2xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all uppercase"
                  placeholder="SSMIET"
                />
              </div>

              {/* Field 3: Campus Address */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  CAMPUS ADDRESS
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 text-xs font-bold text-slate-800 shadow-2xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3431B7]/20 focus:border-[#3431B7] transition-all"
                  placeholder="Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002"
                />
              </div>
            </div>
          </div>

          {/* Card B: How it can look on a printed timetable */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-900">
                How it can look on a printed timetable
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200/80">
                Preview
              </span>
            </div>

            {/* Print Preview Container */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#3431B7] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
                  S
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-slate-900 tracking-tight leading-tight">
                      {collegeName || 'SSM Institute of Engineering and Technology'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-[#3431B7] bg-indigo-50 border border-indigo-200/60 uppercase">
                      {collegeShortName || 'SSMIET'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                    {address || 'Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002'}
                  </p>
                </div>
              </div>

              <div className="h-px bg-slate-200/60" />

              <div className="text-[10px] font-bold text-slate-700">
                Section-wise Timetable • 2025-2026
              </div>

              {/* Mock Period Strip */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-slate-200/70 w-5" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-slate-200/70 w-8" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
                <div className="h-2.5 rounded-md bg-indigo-100/80 flex-1" />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Bell Timings & Periods (col-span-7) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          {/* Header with Duration Stepper */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Bell Timings & Periods
              </h2>
            </div>

            {/* Duration Stepper */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Period duration</span>
              <div className="flex items-center gap-1 bg-slate-100/90 rounded-xl p-0.5 border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setPeriodDuration(Math.max(30, periodDuration - 5))}
                  className="w-6 h-6 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-black text-xs flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                  title="Decrease period duration"
                >
                  -
                </button>
                <span className="text-xs font-black text-slate-900 px-2 min-w-[24px] text-center">
                  {periodDuration}
                </span>
                <button
                  type="button"
                  onClick={() => setPeriodDuration(Math.min(90, periodDuration + 5))}
                  className="w-6 h-6 rounded-lg bg-[#3431B7] hover:bg-[#282694] text-white font-black text-xs flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                  title="Increase period duration"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-400 font-medium">min</span>
            </div>
          </div>

          {/* Mini Horizontal Timeline Strip */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 overflow-x-auto text-center pt-1">
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P1
              </div>
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P2
              </div>
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P3
              </div>
              <div className="w-6 min-w-[24px] bg-slate-100 border border-slate-200 text-slate-400 text-[9px] font-bold rounded-lg py-1.5" />
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P4
              </div>
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P5
              </div>
              <div className="px-2 min-w-[42px] bg-white border border-slate-200 text-slate-600 text-[9px] font-bold rounded-lg py-1.5">
                Lunch
              </div>
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P6
              </div>
              <div className="flex-1 min-w-[36px] bg-[#3431B7] text-white text-[10px] font-black rounded-lg py-1.5">
                P7
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-0.5">
              <span>9:00 AM</span>
              <span>4:00 PM</span>
            </div>
          </div>

          {/* Detailed Period List */}
          <div className="space-y-1 pt-1">
            {periods.map((p, idx) => {
              const { start, end } = parseTimeRange(p.time);
              return (
                <div
                  key={p.id || idx}
                  className={`py-2 px-1 flex items-center justify-between gap-4 border-b border-slate-100 last:border-b-0 ${
                    p.isBreak
                      ? 'border-l-4 border-l-slate-300 pl-3'
                      : 'border-l-4 border-l-[#3431B7] pl-3'
                  }`}
                >
                  <div>
                    <div className="text-xs font-black text-slate-900 leading-tight">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                      {p.isLunch ? 'Lunch Interval' : p.isBreak ? 'Morning Tea Interval' : 'Teaching Period'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/70 rounded-xl px-2.5 py-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={start}
                        onChange={(e) => handleTimePartChange(idx, false, e.target.value)}
                        className="w-12 bg-white border border-slate-200 rounded-md text-[11px] font-mono font-bold text-slate-800 text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3431B7]"
                      />
                      <span className="text-slate-400 text-xs font-bold">-</span>
                      <input
                        type="text"
                        value={end}
                        onChange={(e) => handleTimePartChange(idx, true, e.target.value)}
                        className="w-12 bg-white border border-slate-200 rounded-md text-[11px] font-mono font-bold text-slate-800 text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3431B7]"
                      />
                    </div>

                    <div className="text-xs font-bold text-slate-500 w-12 text-right shrink-0">
                      {p.isLunch ? '50 min' : p.isBreak ? '20 min' : `${periodDuration} min`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM ACTION BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-indigo-50 text-[#3431B7] flex items-center justify-center shrink-0 text-xs font-black">
            i
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800 leading-tight">
              Review the details above, then save.
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Your changes are applied only after you confirm.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmModalOpen(true)}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#282694] transition-colors shadow-xs cursor-pointer disabled:opacity-60 shrink-0"
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>Save & Confirm</span>
        </button>
      </div>

      {/* 4. SAVE CONFIRMATION MODAL (Matching Institutional Modal Template) */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Save College Settings?"
        badge="Settings Update"
        icon={<CheckCircle2 className="w-5 h-5 text-white" />}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => setConfirmModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#3431B7] hover:bg-[#282694] rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{saving ? 'Saving...' : 'Yes, save'}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-[#3431B7] flex items-center justify-center mx-auto text-2xl font-black border border-indigo-100 shadow-xs">
            ?
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-slate-900">
              Update institutional identity & bell timings?
            </p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              The college details and daily period timings will be saved. You can modify them again at any time.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
