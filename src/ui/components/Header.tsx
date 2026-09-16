import React from 'react';
import { BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';

export function Header() {
  const { user, logOut } = useAuth();
  
  // Get initials from the Google profile name or email
  // (Supabase User has no displayName; the OAuth name lives in user_metadata)
  const name = String(user?.user_metadata?.full_name ?? user?.email ?? 'AB');
  const initials = name.substring(0, 2).toUpperCase();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-2 text-slate-900">
        <BookOpen className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-sm">Meine Schule</span>
      </div>
      <div className="flex items-center gap-4">
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
