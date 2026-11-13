'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
  Check,
  User,
  BookOpen
} from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { authState, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authState === 'VERIFIED_ADMIN') {
      window.location.replace('/');
    }
  }, [authState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      window.location.replace('/');
    } else {
      setError(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row font-sans bg-white selection:bg-[#3431B7] selection:text-white">
      {/* ============================================================== */}
      {/* LEFT PANEL: Institutional Identity & Showcase Card             */}
      {/* ============================================================== */}
      <div className="lg:w-[56%] bg-gradient-to-br from-[#2D28A2] via-[#352EB8] to-[#1F1983] p-8 sm:p-12 lg:p-14 text-white flex flex-col justify-between relative overflow-hidden">
        {/* Subtle Geometric Grid Lines Overlay matching reference template */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255, 255, 255, 0.25) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px'
          }}
        />

        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />

        {/* --- Top Bar & Branding --- */}
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            {/* Logo + College Name */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/10 text-white flex items-center justify-center font-black text-xl shadow-inner backdrop-blur-xs">
                S
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-wider leading-tight text-white uppercase">
                  SSM INSTITUTE
                </h1>
                <p className="text-[10px] text-white/70 font-semibold tracking-widest uppercase">
                  OF ENGINEERING AND TECHNOLOGY
                </p>
              </div>
            </div>

            {/* Decorative dashes matching dashboard header */}
            <div className="hidden sm:flex items-center gap-1.5 opacity-40">
              <span className="w-6 h-1 rounded-full bg-white" />
              <span className="w-6 h-1 rounded-full bg-white" />
              <span className="w-6 h-1 rounded-full bg-white" />
              <span className="w-6 h-1 rounded-full bg-white" />
              <span className="w-6 h-1 rounded-full bg-white" />
              <span className="w-6 h-1 rounded-full bg-white" />
            </div>
          </div>

          {/* Accreditation Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-[11px] font-semibold text-white/90 mb-5">
            <GraduationCap className="w-3.5 h-3.5 text-white/80" />
            <span>Autonomous Institution • Anna University Affiliated</span>
          </div>

          {/* Headline & Subtitle */}
          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-black tracking-tight text-white leading-[1.12]">
            College Timetable
            <br />
            Management System
          </h2>
          <p className="mt-3 text-sm text-white/80 max-w-lg leading-relaxed font-normal">
            Plan, publish and print clash-free timetables for every department, in one place.
          </p>
        </div>

        {/* --- Middle Floating Showcase Preview Card --- */}
        <div className="relative z-10 my-10 max-w-xl">
          <div className="bg-white rounded-3xl p-5 shadow-2xl border border-white/20 text-slate-800 relative">
            {/* Header of preview card */}
            <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-slate-900 tracking-tight">
                  1st Year • Section
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Draft
                </span>
              </div>
            </div>

            {/* Floating Pill Badge 1: Top Right */}
            <div className="absolute -top-3.5 right-4 sm:-right-4 bg-white text-slate-900 border border-slate-100 shadow-xl px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 z-20 animate-in fade-in zoom-in duration-300">
              <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="text-emerald-950 font-bold text-xs">No clashes found</span>
            </div>

            {/* Timetable Mini-Grid representation */}
            <div className="text-[10px] space-y-2 select-none">
              {/* Period Header */}
              <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-slate-400 uppercase text-[9px] tracking-wider pl-8">
                <div>P1</div>
                <div>P2</div>
                <div>P3</div>
                <div>P4</div>
                <div>P5</div>
                <div>P6</div>
              </div>

              {/* Monday */}
              <div className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-bold text-slate-400">Mon</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  <div className="h-6 rounded-lg bg-[#3431B7] shadow-xs" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                </div>
              </div>

              {/* Tuesday */}
              <div className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-bold text-slate-400">Tue</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-[#3431B7] shadow-xs" />
                  <div className="h-6 rounded-lg bg-[#3431B7] shadow-xs" />
                </div>
              </div>

              {/* Wednesday */}
              <div className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-bold text-slate-400">Wed</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                </div>
              </div>

              {/* Thursday */}
              <div className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-bold text-slate-400">Thu</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-[#3431B7] shadow-xs" />
                </div>
              </div>

              {/* Friday */}
              <div className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-bold text-slate-400">Fri</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  <div className="h-6 rounded-lg bg-[#3431B7] shadow-xs" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                  <div className="h-6 rounded-lg bg-slate-100/80 border border-slate-200/50" />
                </div>
              </div>
            </div>

            {/* Floating Pill Badge 2: Bottom Right */}
            <div className="absolute -bottom-3.5 right-4 sm:-right-4 bg-white text-slate-900 border border-slate-100 shadow-xl px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 z-20 animate-in fade-in zoom-in duration-300">
              <span className="bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                A4
              </span>
              <span className="font-bold text-slate-800 text-xs">Print-ready sheet</span>
            </div>
          </div>
        </div>

        {/* --- Bottom Feature Highlights (3 columns) --- */}
        <div className="relative z-10 pt-4 pb-6 border-b border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div>
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/10 flex items-center justify-center text-white mb-2 shadow-2xs">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                Clash-free scheduling
              </h3>
              <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
                Avoids clashes for every faculty member.
              </p>
            </div>

            {/* Feature 2 */}
            <div>
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/10 flex items-center justify-center text-white mb-2 shadow-2xs">
                <User className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                One faculty, many departments
              </h3>
              <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
                Time is shared safely across departments.
              </p>
            </div>

            {/* Feature 3 */}
            <div>
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/10 flex items-center justify-center text-white mb-2 shadow-2xs">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                Published timetable archive
              </h3>
              <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
                Every published version is kept for printing.
              </p>
            </div>
          </div>
        </div>

        {/* Institutional Address Footer */}
        <div className="relative z-10 pt-4 text-[11px] text-white/60">
          <p className="font-semibold text-white/90">SSM Institute of Engineering and Technology</p>
          <p>Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT PANEL: Authentication Form                               */}
      {/* ============================================================== */}
      <div className="lg:w-[44%] flex flex-col justify-center items-center p-8 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md mx-auto">
          {/* Administrator Portal Pill Badge */}
          <div className="inline-block px-3 py-1 rounded-full bg-[#EEF0FA] text-[#3431B7] text-[10px] font-mono font-bold tracking-wider uppercase border border-[#E3E5F0] mb-3">
            ADMINISTRATOR PORTAL
          </div>

          {/* Heading & Subtitle */}
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Sign In to Administration
          </h2>
          <p className="text-xs text-slate-500 mt-2 mb-8 leading-relaxed font-normal">
            Enter your verified administrator credentials to open the timetable management console.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs font-medium animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                INSTITUTIONAL EMAIL ADDRESS
              </label>
              <div className="relative flex items-center bg-white rounded-2xl border border-slate-200 focus-within:border-[#3431B7] focus-within:ring-2 focus-within:ring-[#3431B7]/20 px-4 py-3.5 shadow-xs transition-all">
                <Mail className="w-5 h-5 text-[#3431B7] shrink-0 mr-3" />
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                PASSWORD
              </label>
              <div className="relative flex items-center bg-white rounded-2xl border border-slate-200 focus-within:border-[#3431B7] focus-within:ring-2 focus-within:ring-[#3431B7]/20 px-4 py-3.5 shadow-xs transition-all">
                <Lock className="w-5 h-5 text-[#3431B7] shrink-0 mr-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 transition-colors ml-2 cursor-pointer p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-6 rounded-2xl font-bold text-sm text-white bg-[#3431B7] hover:bg-[#282694] active:scale-[0.99] transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In as Administrator</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

