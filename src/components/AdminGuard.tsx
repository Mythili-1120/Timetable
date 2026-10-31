'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, hasStoredAuth } from '../lib/context/AuthContext';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // If there is no stored auth token or session in storage, go to /login immediately
    if (!hasStoredAuth()) {
      window.location.replace('/login');
      return;
    }

    // If loading has settled and user is not admin, go to /login
    if (!loading && !isAdmin) {
      window.location.replace('/login');
      return;
    }

    // Safety fallback: if not verified as admin after 2s, redirect to /login
    const timer = setTimeout(() => {
      if (!isAdmin) {
        window.location.replace('/login');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [mounted, isAdmin, loading]);

  // Before hydration on client, render initial placeholder identical to SSR
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
          <div className="w-10 h-10 border-4 border-[#3431B7] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-bold text-slate-800">Verifying Administrator Session...</p>
            <p className="text-xs text-slate-500 mt-1">Checking secure credentials and access permissions</p>
          </div>
        </div>
      </div>
    );
  }

  // Once mounted on client: if admin, render dashboard immediately
  if (isAdmin) {
    return <>{children}</>;
  }

  // If definitely not authenticated, render nothing while redirecting
  if (!hasStoredAuth()) {
    return null;
  }

  // Transitional loading view if waiting for Firestore verification
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
