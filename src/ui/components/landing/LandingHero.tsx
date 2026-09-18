import React from 'react';
import { ArrowRight, Sparkles, BookOpen, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../infrastructure/auth/AuthContext';
import { Button } from '../Button';
import { ProductPreviewWindow } from './ProductPreviewWindow';
import logoIconUrl from '../../../assets/logo-icon.png';

export function LandingHero() {
  const { signIn, isLoading, user } = useAuth();

  return (
    <section className="relative pt-8 pb-16 sm:pt-14 sm:pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Soft radial background aura (light, academic, subtle blue/slate) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 transform-gpu overflow-hidden blur-3xl"
        aria-hidden="true"
      >
        <div
          className="relative left-[calc(50%-18rem)] aspect-[1155/678] w-[36rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-100/40 to-slate-200/40 opacity-70 sm:left-[calc(50%-30rem)] sm:w-[68rem]"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto text-center space-y-5 sm:space-y-6">
        {/* Subtle trust badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50/80 border border-blue-100 text-xs font-medium text-blue-800 shadow-2xs">
          <img src={logoIconUrl} alt="Materia" className="w-3.5 h-3.5 object-contain" />
          <span>Materia · Workspace für Berufsschule & Ausbildung</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.15]">
          Deine Schule.{' '}
          <span className="text-blue-600">Alles an einem Ort.</span>
        </h1>

        {/* Supporting Copy */}
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
          Organisiere deine Unterrichtsmaterialien nach Fächern und Themen, erfasse Inhalte strukturiert und lerne interaktiv mit Quiz, Karteikarten und Lückentexten – direkt aus deinen PDF-Unterlagen.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {user ? (
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = '/';
              }}
              className="w-full sm:w-auto h-11 px-6 text-sm font-medium gap-2 shadow-xs cursor-pointer"
            >
              <span>Zum Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={signIn}
              disabled={isLoading}
              className="w-full sm:w-auto h-11 px-6 text-sm font-medium gap-2.5 shadow-xs cursor-pointer"
            >
              {/* Google G icon */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Mit Google starten</span>
            </Button>
          )}

          <a
            href="#funktionen"
            className="w-full sm:w-auto inline-flex items-center justify-center h-11 px-5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-md border border-slate-200/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <span>Funktionen ansehen</span>
          </a>
        </div>

        {/* Supporting micro-copy */}
        <p className="text-xs text-slate-500 pt-1">
          Kostenlos mit deinem Google-Konto anmelden · Keine zusätzliche Registrierung erforderlich
        </p>

        {/* Product Preview Anchor */}
        <div className="pt-6 sm:pt-10">
          <ProductPreviewWindow />
        </div>
      </div>
    </section>
  );
}
