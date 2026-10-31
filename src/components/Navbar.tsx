'use client';

import React from 'react';
import { useAuth } from '../lib/context/AuthContext';
import { ShieldCheck, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, userProfile, logout } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between no-print shadow-xs shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-800 text-sm tracking-tight hidden sm:inline">
          SSM Institute of Engineering and Technology (Autonomous)
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          2025–2026 Academic Year
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Administrator Profile Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs">
          <ShieldCheck className="w-4 h-4 text-brand-600" />
          <span className="font-medium text-slate-700">
            {userProfile?.displayName || user?.email || 'Administrator'}
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-600 text-white">
            ADMIN
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={() => logout()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}

