import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/context/AuthContext';

export const metadata: Metadata = {
  title: 'SSM Institute of Engineering and Technology | Timetable Management System',
  description: 'Autonomous College Timetable Management System with Enterprise Constraint Satisfaction Solver',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

