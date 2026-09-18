import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../infrastructure/auth/AuthContext';
import { Button } from '../Button';
import logoUrl from '../../../assets/logo.png';

export function LandingNavbar() {
  const { signIn, isLoading, user } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <a
          href="/"
          className="flex items-center text-slate-900 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-md py-1"
          aria-label="Materia Startseite"
        >
          <img src={logoUrl} alt="Materia" className="h-7 sm:h-8 w-auto object-contain" />
        </a>

        {/* Navigation Anchors */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a
            href="#funktionen"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
          >
            Funktionen
          </a>
          <a
            href="#lernmodi"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
          >
            Lernmodi
          </a>
          <a
            href="#quellen"
            className="hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
          >
            Quellen & Transparenz
          </a>
        </nav>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          {user ? (
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = '/';
              }}
              className="gap-2 text-xs sm:text-sm h-9 px-3 sm:px-4"
            >
              <span>Zum Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={signIn}
              disabled={isLoading}
              className="gap-2 text-xs sm:text-sm h-9 px-3 sm:px-4 cursor-pointer"
            >
              <span>Jetzt starten</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
