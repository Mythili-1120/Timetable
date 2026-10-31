'use client';

import React, { useEffect, useState } from 'react';
import { getCollegeSettings, updateCollegeSettings } from '../../../lib/services/settingsService';
import { CollegeSettings, PeriodDefinition } from '../../../types';
import { useAuth } from '../../../lib/context/AuthContext';
import { Settings, Save, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [collegeName, setCollegeName] = useState('');
  const [collegeShortName, setCollegeShortName] = useState('');
  const [address, setAddress] = useState('');
  const [periodDuration, setPeriodDuration] = useState(50);
  const [periods, setPeriods] = useState<PeriodDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      const s = await getCollegeSettings();
      setSettings(s);
      setCollegeName(s.collegeName);
      setCollegeShortName(s.collegeShortName || 'SSMIET');
      setAddress(s.address);
      setPeriodDuration(s.periodDurationMinutes);
      setPeriods(s.periods || []);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      alert('Failed to update college settings.');
    }
  };

  const handlePeriodTimeChange = (idx: number, newTime: string) => {
    const updated = [...periods];
    updated[idx].time = newTime;
    setPeriods(updated);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">College Settings Master</h1>
          <p className="text-sm text-slate-500">
            Institutional identity, bell timings, and academic calendar parameters
          </p>
        </div>
        {success && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Institutional Identity Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
            Institutional Identity & Address
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                College Official Name
              </label>
              <input
                type="text"
                required
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                College Short Name / Code
              </label>
              <input
                type="text"
                required
                value={collegeShortName}
                onChange={(e) => setCollegeShortName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Campus Address
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Bell Schedule & Timing Configuration Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">
              Bell Timings & Periods Configuration
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Period Duration:</span>
              <input
                type="number"
                min="30"
                max="90"
                value={periodDuration}
                onChange={(e) => setPeriodDuration(Number(e.target.value))}
                className="w-16 px-2 py-1 text-xs border border-slate-300 rounded text-center font-bold"
              />
              <span className="text-xs text-slate-500">min</span>
            </div>
          </div>

          <div className="space-y-2">
            {periods.map((p, idx) => (
              <div
                key={p.id || idx}
                className={`p-3 rounded-xl border flex items-center justify-between gap-4 ${
                  p.isBreak
                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                    : 'bg-slate-50/70 border-slate-200 text-slate-900'
                }`}
              >
                <div className="w-40">
                  <span className="font-bold text-sm block">{p.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {p.isLunch ? 'Lunch Interval' : p.isBreak ? 'Morning Tea Interval' : 'Teaching Period'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={p.time}
                    onChange={(e) => handlePeriodTimeChange(idx, e.target.value)}
                    className="w-44 px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400 italic pt-2">
            * Note: Changes to timings are strictly validated and will not alter already published historical timetable records.
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-xs cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Settings...' : 'Save College Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

