import React, { createContext, useContext, useEffect, useState } from 'react';
import idStrings from '../locales/id.json';
import enStrings from '../locales/en.json';
import { hashOperatorPin, verifyOperatorPin } from '../core/security/pin-lock.ts';

export type ThemeMode = 'dark' | 'light';
export type LocaleCode = 'id' | 'en';
export type TranslationKey = keyof typeof idStrings;

interface AppPreferencesContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: TranslationKey) => string;
  isPinUnlocked: boolean;
  lockPinSession: () => void;
  requirePinConfirmation: (onVerified: () => void) => void;
  pendingPinModalOpen: boolean;
  closePinModal: () => void;
  submitOperatorPin: (candidatePin: string) => boolean;
}

const DEFAULT_PIN_HASH = hashOperatorPin('278500');

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export const AppPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('openwa_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    if (typeof window === 'undefined') return 'id';
    const saved = window.localStorage.getItem('openwa_locale');
    if (saved === 'id' || saved === 'en') return saved;
    const navLang = window.navigator.language.toLowerCase();
    return navLang.startsWith('id') ? 'id' : 'en';
  });

  const [isPinUnlocked, setIsPinUnlocked] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('openwa_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    window.localStorage.setItem('openwa_locale', locale);
  }, [locale]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setLocale = (nextLocale: LocaleCode) => {
    setLocaleState(nextLocale);
  };

  const t = (key: TranslationKey): string => {
    const dictionary = locale === 'id' ? idStrings : enStrings;
    return dictionary[key] ?? key;
  };

  const lockPinSession = () => {
    setIsPinUnlocked(false);
  };

  const requirePinConfirmation = (onVerified: () => void) => {
    if (isPinUnlocked) {
      onVerified();
      return;
    }
    setPendingAction(() => onVerified);
  };

  const closePinModal = () => {
    setPendingAction(null);
  };

  const submitOperatorPin = (candidatePin: string): boolean => {
    const ok = verifyOperatorPin(candidatePin, DEFAULT_PIN_HASH);
    if (ok) {
      setIsPinUnlocked(true);
      const callback = pendingAction;
      setPendingAction(null);
      if (callback) callback();
      return true;
    }
    return false;
  };

  return (
    <AppPreferencesContext.Provider
      value={{
        theme,
        toggleTheme,
        locale,
        setLocale,
        t,
        isPinUnlocked,
        lockPinSession,
        requirePinConfirmation,
        pendingPinModalOpen: pendingAction !== null,
        closePinModal,
        submitOperatorPin,
      }}
    >
      {children}
    </AppPreferencesContext.Provider>
  );
};

export function useAppPreferences(): AppPreferencesContextValue {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) {
    throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  }
  return ctx;
}
