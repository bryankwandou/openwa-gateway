import React from 'react';
import { Globe, Lock, Moon, Radio, Sun, Unlock } from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext.tsx';

export const HeaderBar: React.FC = () => {
  const { theme, toggleTheme, locale, setLocale, t, isPinUnlocked, lockPinSession, requirePinConfirmation } =
    useAppPreferences();

  return (
    <header className="top-header">
      <div className="brand-cluster">
        <div className="brand-mark" aria-label={t('app_brand')}>
          <Radio size={22} aria-hidden="true" />
        </div>
        <div>
          <div className="brand-title">{t('app_brand')}</div>
          <div className="brand-subtitle">{t('app_subtitle')}</div>
        </div>
      </div>

      <div className="header-controls">
        <button
          type="button"
          className="btn"
          onClick={() => (isPinUnlocked ? lockPinSession() : requirePinConfirmation(() => undefined))}
          aria-label={isPinUnlocked ? t('btn_pin_unlocked') : t('btn_pin_locked')}
        >
          {isPinUnlocked ? <Unlock size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
          <span>{isPinUnlocked ? t('btn_pin_unlocked') : t('btn_pin_locked')}</span>
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
          aria-label={locale === 'id' ? t('btn_lang_id') : t('btn_lang_en')}
        >
          <Globe size={18} aria-hidden="true" />
          <span>{locale === 'id' ? t('btn_lang_id') : t('btn_lang_en')}</span>
        </button>

        <button
          type="button"
          className="btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t('btn_theme_light') : t('btn_theme_dark')}
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          <span>{theme === 'dark' ? t('btn_theme_light') : t('btn_theme_dark')}</span>
        </button>
      </div>
    </header>
  );
};
