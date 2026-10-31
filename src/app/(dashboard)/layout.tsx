'use client';

import React, { useEffect } from 'react';
import AdminGuard from '../../components/AdminGuard';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { prewarmCoreData } from '../../lib/services/prewarmService';
import { useAuth } from '../../lib/context/AuthContext';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (user && isAdmin) {
      prewarmCoreData();
    }
  }, [user, isAdmin]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5FB] font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 bg-[#F4F5FB]">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <DashboardShell>{children}</DashboardShell>
    </AdminGuard>
  );
}
