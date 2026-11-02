'use client';

import React from 'react';

export default function Navbar() {
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
    </header>
  );
}

