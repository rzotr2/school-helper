import React from 'react';
import { BookOpen, LogOut, GraduationCap, Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { cn } from '../../shared/utils/cn';

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const { user, logOut } = useAuth();
  const location = useLocation();
  const isLearnActive = location.pathname.startsWith('/learn');
  
  // Get initials from the Google profile name or email
  // (Supabase User has no displayName; the OAuth name lives in user_metadata)
  const name = String(user?.user_metadata?.full_name ?? user?.email ?? 'AB');
  const initials = name.substring(0, 2).toUpperCase();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-3 sm:px-4 justify-between shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 -ml-0.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="Navigation öffnen"
            aria-label="Navigation öffnen"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Link
          to="/"
          className="hidden sm:flex items-center gap-2 text-slate-900 hover:opacity-90 transition-opacity shrink-0"
        >
          <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
          <span className="font-semibold text-sm whitespace-nowrap">Meine Schule</span>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/learn"
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            isLearnActive
              ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <GraduationCap className="w-4 h-4 text-blue-600" />
          <span>Lernen</span>
        </Link>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-medium text-slate-600" title={user?.email || 'User'}>
            {initials}
          </div>
          <button
            onClick={logOut}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="Abmelden"
            aria-label="Abmelden"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
