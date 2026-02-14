import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Supported language codes
 */
export type Locale = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ru' | 'ja';

/**
 * Language metadata
 */
export interface Language {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

/**
 * Available languages
 */
export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
];

/**
 * Locale hook return type
 */
interface UseLocaleReturn {
  /** Current locale code */
  locale: Locale;
  /** Current language metadata */
  currentLanguage: Language;
  /** All available languages */
  languages: Language[];
  /** Change locale */
  setLocale: (locale: Locale) => void;
  /** Change locale by code */
  changeLanguage: (code: Locale) => Promise<void>;
  /** Get language by code */
  getLanguage: (code: Locale) => Language | undefined;
  /** Format date according to locale */
  formatDate: (date: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  /** Format number according to locale */
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  /** Format relative time */
  formatRelativeTime: (date: Date | number) => string;
  /** Whether locale is loading */
  isLoading: boolean;
}

/**
 * Get browser locale
 */
function getBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';

  const browserLang = navigator.language.split('-')[0];
  const supportedLocales: Locale[] = ['en', 'es', 'fr', 'de', 'zh', 'ru', 'ja'];

  return supportedLocales.includes(browserLang as Locale) ? (browserLang as Locale) : 'en';
}

/**
 * Hook for managing locale and internationalization
 * Integrates with i18next for translations
 *
 * @example
 * ```tsx
 * function LanguageSelector() {
 *   const { locale, languages, changeLanguage } = useLocale();
 *
 *   return (
 *     <select value={locale} onChange={(e) => changeLanguage(e.target.value as Locale)}>
 *       {languages.map(lang => (
 *         <option key={lang.code} value={lang.code}>
 *           {lang.flag} {lang.nativeName}
 *         </option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useLocale(): UseLocaleReturn {
  const { i18n: i18nInstance } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(
    (i18nInstance.language as Locale) || getBrowserLocale()
  );

  /**
   * Update locale state when i18n language changes
   */
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLocaleState(lng as Locale);
    };

    i18nInstance.on('languageChanged', handleLanguageChanged);

    // Set initial locale
    setLocaleState((i18nInstance.language as Locale) || getBrowserLocale());

    return () => {
      i18nInstance.off('languageChanged', handleLanguageChanged);
    };
  }, [i18nInstance]);

  /**
   * Change locale/language
   */
  const changeLanguage = useCallback(
    async (code: Locale): Promise<void> => {
      setIsLoading(true);
      try {
        await i18nInstance.changeLanguage(code);
        // Also update document lang attribute
        if (typeof document !== 'undefined') {
          document.documentElement.lang = code;
        }
      } finally {
        setIsLoading(false);
      }
    },
    [i18nInstance]
  );

  /**
   * Set locale (alias for changeLanguage)
   */
  const setLocale = useCallback(
    (newLocale: Locale): void => {
      changeLanguage(newLocale);
    },
    [changeLanguage]
  );

  /**
   * Get language metadata by code
   */
  const getLanguage = useCallback((code: Locale): Language | undefined => {
    return AVAILABLE_LANGUAGES.find((lang) => lang.code === code);
  }, []);

  /**
   * Format date according to current locale
   */
  const formatDate = useCallback(
    (date: Date | number, options: Intl.DateTimeFormatOptions = {}): string => {
      const dateObj = typeof date === 'number' ? new Date(date) : date;
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
      }).format(dateObj);
    },
    [locale]
  );

  /**
   * Format number according to current locale
   */
  const formatNumber = useCallback(
    (num: number, options: Intl.NumberFormatOptions = {}): string => {
      return new Intl.NumberFormat(locale, options).format(num);
    },
    [locale]
  );

  /**
   * Format relative time (e.g., "2 hours ago")
   */
  const formatRelativeTime = useCallback(
    (date: Date | number): string => {
      const dateObj = typeof date === 'number' ? new Date(date) : date;
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

      if (diffInSeconds < 60) {
        return rtf.format(-diffInSeconds, 'second');
      } else if (diffInSeconds < 3600) {
        return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
      } else if (diffInSeconds < 86400) {
        return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
      } else if (diffInSeconds < 2592000) {
        return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
      } else if (diffInSeconds < 31536000) {
        return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
      } else {
        return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
      }
    },
    [locale]
  );

  const currentLanguage = getLanguage(locale) || AVAILABLE_LANGUAGES[0];

  return {
    locale,
    currentLanguage,
    languages: AVAILABLE_LANGUAGES,
    setLocale,
    changeLanguage,
    getLanguage,
    formatDate,
    formatNumber,
    formatRelativeTime,
    isLoading,
  };
}

export default useLocale;
