import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Outlet } from 'react-router-dom';

export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen bg-[#F9FAFB] flex flex-col text-slate-900 font-sans overflow-hidden">
      <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 min-w-0">
          <div className="max-w-5xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
