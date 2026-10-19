import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { SupportedLanguage, TranslationParams } from './types';
import { DEFAULT_LANGUAGE } from './types';
import { en } from './translations/en';
import { de } from './translations/de';

const STORAGE_KEY = 'materia_language';

const translations: Record<SupportedLanguage, typeof en> = {
  en,
  de,
};

function getNestedValue(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function formatTemplate(template: string, params?: TranslationParams): string {
  if (!params) return template;

  let result = template;

  // Handle simple ICU plural: {count, plural, one {word} other {words}}
  result = result.replace(/\{(\w+),\s*plural,\s*one\s*\{([^}]+)\}\s*other\s*\{([^}]+)\}\}/g, (_, key, one, other) => {
    const val = Number(params[key]);
    return val === 1 ? one : other;
  });

  // Replace {param} and {{param}}
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      const regex = new RegExp(`\\{\\{?\\s*${key}\\s*\\}\\}?`, 'g');
      result = result.replace(regex, String(val));
    }
  }

  return result;
}

export function translate(
  lang: SupportedLanguage,
  path: string,
  params?: TranslationParams,
  fallback?: string,
): string {
  // 1. Try target language
  let val = getNestedValue(translations[lang], path);

  // 2. Fallback to English
  if (val === undefined && lang !== 'en') {
    val = getNestedValue(translations.en, path);
  }

  // 3. Fallback to provided fallback or path itself if missing
  if (val === undefined) {
    return fallback !== undefined ? fallback : path;
  }

  return formatTemplate(val, params);
}

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (path: string, params?: TranslationParams, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (path, params, fallback) => translate(DEFAULT_LANGUAGE, path, params, fallback),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
      if (saved === 'en' || saved === 'de') {
        return saved;
      }
    }
    return DEFAULT_LANGUAGE;
  });

  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
        document.documentElement.lang = newLang;
      } catch (e) {
        console.error('Failed to save language to localStorage:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const t = useCallback(
    (path: string, params?: TranslationParams, fallback?: string) => {
      return translate(language, path, params, fallback);
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  return useContext(LanguageContext);
}
