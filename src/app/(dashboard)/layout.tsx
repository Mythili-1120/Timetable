'use client';

import React from 'react';
import AdminGuard from '../../components/AdminGuard';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {children}
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}

