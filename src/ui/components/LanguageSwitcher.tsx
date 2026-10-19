import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '../../shared/i18n/LanguageContext';
import { cn } from '../../shared/utils/cn';

interface LanguageSwitcherProps {
  className?: string;
  showIcon?: boolean;
}

export function LanguageSwitcher({ className, showIcon = false }: LanguageSwitcherProps) {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-xs font-medium',
        className,
      )}
      role="group"
      aria-label="Language selection"
    >
      {showIcon && (
        <span className="pl-1.5 pr-1 text-slate-400">
          <Globe className="w-3.5 h-3.5" />
        </span>
      )}
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={cn(
          'px-2 py-1 rounded-md transition-[background-color,color,box-shadow] duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          language === 'en'
            ? 'bg-white text-blue-700 shadow-2xs font-semibold'
            : 'text-slate-500 hover:text-slate-900',
        )}
        aria-pressed={language === 'en'}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('de')}
        className={cn(
          'px-2 py-1 rounded-md transition-[background-color,color,box-shadow] duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          language === 'de'
            ? 'bg-white text-blue-700 shadow-2xs font-semibold'
            : 'text-slate-500 hover:text-slate-900',
        )}
        aria-pressed={language === 'de'}
        title="Deutsch"
      >
        DE
      </button>
    </div>
  );
}
