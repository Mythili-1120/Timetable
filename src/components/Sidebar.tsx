'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  Cpu,
  CalendarRange,
  History,
  Settings
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Departments', href: '/departments', icon: Building2 },
  { label: 'Staff Directory', href: '/staff', icon: Users },
  { label: 'Timetable Generator', href: '/generator', icon: Cpu },
  { label: 'Timetable Views', href: '/timetable-views', icon: CalendarRange },
  { label: 'Timetable History', href: '/history', icon: History },
  { label: 'College Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 no-print select-none">
      {/* College Identity Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
          S
        </div>
        <div className="overflow-hidden">
          <h1 className="font-bold text-white text-sm leading-tight truncate">SSMIET Timetable</h1>
          <p className="text-xs text-brand-400 font-medium">Autonomous ERP Core</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500">
        <p className="font-semibold text-slate-400">SSM Institute of Tech.</p>
        <p>Enterprise Edition v2.0</p>
      </div>
    </aside>
  );
}
