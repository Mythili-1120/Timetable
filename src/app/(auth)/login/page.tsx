'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  CalendarCheck,
  Cpu,
  GraduationCap,
  AlertCircle
} from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { user, isAdmin, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && isAdmin) {
      router.push('/');
    }
  }, [user, isAdmin, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center font-sans">
      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
          
          {/* ============================================================== */}
          {/* LEFT COLUMN: Institutional Identity & Academic Overview         */}
          {/* ============================================================== */}
          <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-blue-950 to-brand-950 p-8 sm:p-10 flex flex-col justify-between text-white relative overflow-hidden">
            {/* Subtle Abstract Background Decoration */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            {/* Institutional Brand Header */}
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-md shadow-brand-500/30">
                  S
                </div>
                <div>
                  <h1 className="font-extrabold text-lg leading-tight tracking-tight text-white">
                    SSM INSTITUTE
                  </h1>
                  <p className="text-xs text-blue-300 font-medium tracking-wide">
                    OF ENGINEERING AND TECHNOLOGY
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-[11px] font-semibold text-blue-200 mb-6">
                <GraduationCap className="w-3.5 h-3.5 text-blue-300" />
                <span>Autonomous Institution • Anna University Affiliated</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                College Timetable Management System
              </h2>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                Centralized academic scheduling core with global constraint satisfaction and multi-department faculty workload optimization.
              </p>
            </div>

            {/* Institutional Feature Highlights */}
            <div className="relative z-10 my-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-brand-400 mt-0.5">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Global CSP Scheduling Engine</h3>
                  <p className="text-xs text-slate-300 mt-0.5">Automated conflict resolution keyed strictly by permanent Member ID.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Multi-Department Workload</h3>
                  <p className="text-xs text-slate-300 mt-0.5">Single faculty records shared collision-free across multiple departments.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-amber-400 mt-0.5">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Published Version Archives</h3>
                  <p className="text-xs text-slate-300 mt-0.5">Immutable historical snapshots with single-page A4 landscape print sheets.</p>
                </div>
              </div>
            </div>

            {/* Campus Address Footer */}
            <div className="relative z-10 pt-4 border-t border-white/10 text-[11px] text-slate-400">
              <p className="font-semibold text-slate-300">SSM Institute of Engineering and Technology</p>
              <p>Dindigul - Palani Highway, Dindigul, Tamil Nadu - 624002</p>
            </div>
          </div>

          {/* ============================================================== */}
          {/* RIGHT COLUMN: Professional Admin Authentication Card           */}
          {/* ============================================================== */}
          <div className="lg:col-span-7 p-8 sm:p-12 lg:p-16 flex flex-col justify-center bg-white">
            <div className="max-w-md w-full mx-auto">
              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold uppercase tracking-wider mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Administrator Portal</span>
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Sign In to Administration
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your verified administrator credentials to access the timetable management console.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs font-medium animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Institutional Email Address
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@ssmiet.ac.in"
                      className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors bg-white font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="block w-full pl-10 pr-11 py-3 text-sm border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors bg-white font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 px-5 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-60 transition-all cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Administrator Access...</span>
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

              {/* Security Compliance Note */}
              <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Protected by Firebase Authentication & Zero-Trust Cloud Security</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Access is restricted to authorized college administrators. All sessions are audited.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
