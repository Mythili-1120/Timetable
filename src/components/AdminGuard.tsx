'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, hasStoredAuth } from '../lib/context/AuthContext';
import { ShieldAlert, AlertTriangle, RefreshCw, LogOut, ArrowRight } from 'lucide-react';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, authState, isAdmin, error, logout, retryVerification } = useAuth();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // When unauthenticated, cleanly navigate to /login immediately
  useEffect(() => {
    if (!mounted) return;

    if (authState === 'UNAUTHENTICATED' || !hasStoredAuth()) {
      window.location.replace('/login');
      return;
    }

    // Safety timeout: If administration verification does not resolve within 2.5 seconds,
    // gracefully route to the Administrator Login Portal
    const timer = setTimeout(() => {
      if (authState !== 'VERIFIED_ADMIN') {
        window.location.replace('/login');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [mounted, authState]);

  // 1. SSR / Initial frame placeholder (identical HTML on server and client to avoid hydration mismatch)
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
          <div className="w-10 h-10 border-4 border-[#3431B7] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-bold text-slate-800">Verifying Administrator Session...</p>
            <p className="text-xs text-slate-500 mt-1">Checking secure credentials and access permissions</p>
          </div>
          <div className="mt-2">
            <Link
              href="/login"
              className="inline-flex items-center text-xs font-semibold text-[#3431B7] hover:underline"
            >
              Go to Sign In →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Verified Administrator — Authorized access
  if (authState === 'VERIFIED_ADMIN' || isAdmin) {
    return <>{children}</>;
  }

  // 3. Unauthenticated — Redirect in progress, render null to prevent flicker
  if (authState === 'UNAUTHENTICATED' || !hasStoredAuth()) {
    return null;
  }

  // 4. Access Denied — User authenticated, but lacks canonical ADMIN role in Firestore
  if (authState === 'ACCESS_DENIED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 max-w-md w-full shadow-lg text-center animate-in fade-in zoom-in-95 duration-150">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            Access Denied: Administrator Required
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Your signed-in account{' '}
            <span className="font-semibold text-slate-800">({user?.email || 'authenticated'})</span>{' '}
            is not registered with Administrator privileges for the SSM College Timetable Management System.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => logout()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out & Switch Account</span>
            </button>
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <span>Return to Login Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 5. Recoverable Error — Network failure or Firestore timeout
  if (authState === 'ERROR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl border border-amber-200 p-8 max-w-md w-full shadow-lg text-center animate-in fade-in zoom-in-95 duration-150">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-100">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            Administration Verification Error
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            {error || 'Unable to establish secure verification with college administration database. Please check your network connection.'}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => retryVerification()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Verification</span>
            </button>
            <button
              onClick={() => logout()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign In With Another Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Explicit Transitional States: AUTH_INITIALIZING | PROFILE_LOADING | VERIFYING_ADMIN
  const statusMessage =
    authState === 'PROFILE_LOADING'
      ? 'Retrieving administrator profile from database...'
      : authState === 'VERIFYING_ADMIN'
      ? 'Verifying administrative authority...'
      : 'Restoring secure college session...';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
        <div className="w-10 h-10 border-4 border-[#3431B7] border-t-transparent rounded-full animate-spin" />
        <div>
          <p className="text-sm font-bold text-slate-800">Verifying Administrator Session...</p>
          <p className="text-xs text-slate-500 mt-1">{statusMessage}</p>
        </div>
        <div className="mt-2">
          <Link
            href="/login"
            className="inline-flex items-center text-xs font-semibold text-[#3431B7] hover:underline"
          >
            Go to Sign In →
          </Link>
        </div>
      </div>
    </div>
  );
}
