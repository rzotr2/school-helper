import React from 'react';
import logoUrl from '../../../assets/logo.png';

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2.5 text-slate-800 font-semibold">
          <img src={logoUrl} alt="Materia" className="h-6 w-auto object-contain" />
          <span className="text-slate-300 font-normal">|</span>
          <span className="text-slate-500 font-normal">
            Digitaler Schul-Workspace
          </span>
        </div>

        <nav className="flex items-center gap-5">
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
            Quellen
          </a>
        </nav>

        <div>
          <span>© {currentYear} Materia. Alle Rechte vorbehalten.</span>
        </div>
      </div>
    </footer>
  );
}
