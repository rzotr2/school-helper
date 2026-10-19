export type SupportedLanguage = 'en' | 'de';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

export interface TranslationParams {
  [key: string]: unknown;
}

export type TranslationDictionary = {
  [key: string]: string | TranslationDictionary;
};
