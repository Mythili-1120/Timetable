'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../lib/context/AuthContext';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [showSlowNotice, setShowSlowNotice] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.replace('/login');
    }
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    let slowTimer: NodeJS.Timeout | null = null;
    let autoRedirectTimer: NodeJS.Timeout | null = null;

    if (loading) {
      slowTimer = setTimeout(() => {
        setShowSlowNotice(true);
      }, 1800);

      // Hard redirect if session verification takes more than 4 seconds
      autoRedirectTimer = setTimeout(() => {
        router.replace('/login');
      }, 4000);
    } else {
      setShowSlowNotice(false);
    }

    return () => {
      if (slowTimer) clearTimeout(slowTimer);
      if (autoRedirectTimer) clearTimeout(autoRedirectTimer);
    };
  }, [loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
          <div className="w-10 h-10 border-4 border-[#3431B7] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-bold text-slate-800">Verifying Administrator Session...</p>
            <p className="text-xs text-slate-500 mt-1">Checking secure credentials and access permissions</p>
          </div>
          {showSlowNotice && (
            <div className="mt-2 animate-in fade-in duration-300">
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-[#3431B7] hover:underline"
              >
                Taking longer than expected? Go to Sign In →
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
