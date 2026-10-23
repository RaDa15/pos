import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.js';
import { setAppLanguage } from '../../i18n/index.js';

export interface LanguageToggleProps {
  variant?: 'light' | 'sidebar';
  className?: string;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  variant = 'light',
  className = '',
}) => {
  const { i18n } = useTranslation();
  const { isAuthenticated, setLanguage } = useAuth();
  const currentLang = (i18n.language || 'en').startsWith('dz') ? 'dz' : 'en';

  const handleSelect = async (lang: 'en' | 'dz') => {
    setAppLanguage(lang);
    if (isAuthenticated) {
      try {
        await setLanguage(lang);
      } catch {
        // Fallback: local i18n change is already set
      }
    }
  };

  const isSidebar = variant === 'sidebar';

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`lang-toggle ${className}`}
      style={{
        display: 'flex',
        gap: '6px',
        marginTop: isSidebar ? '12px' : '0',
      }}
    >
      <button
        type="button"
        aria-pressed={currentLang === 'en'}
        onClick={() => handleSelect('en')}
        style={{
          flex: 1,
          padding: '5px 10px',
          fontSize: '11.5px',
          fontWeight: currentLang === 'en' ? 700 : 500,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: isSidebar
            ? currentLang === 'en'
              ? '1px solid var(--teal)'
              : '1px solid rgba(255,255,255,0.2)'
            : currentLang === 'en'
            ? '1px solid var(--navy)'
            : '1px solid var(--line)',
          backgroundColor: isSidebar
            ? currentLang === 'en'
              ? 'var(--navy-2)'
              : 'transparent'
            : currentLang === 'en'
            ? 'var(--navy)'
            : '#FFFFFF',
          color: isSidebar
            ? currentLang === 'en'
              ? '#FFFFFF'
              : 'var(--nav-text)'
            : currentLang === 'en'
            ? '#FFFFFF'
            : 'var(--ink)',
        }}
      >
        English
      </button>
      <button
        type="button"
        aria-pressed={currentLang === 'dz'}
        onClick={() => handleSelect('dz')}
        style={{
          flex: 1,
          padding: '5px 10px',
          fontSize: '11.5px',
          fontWeight: currentLang === 'dz' ? 700 : 500,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: isSidebar
            ? currentLang === 'dz'
              ? '1px solid var(--teal)'
              : '1px solid rgba(255,255,255,0.2)'
            : currentLang === 'dz'
            ? '1px solid var(--navy)'
            : '1px solid var(--line)',
          backgroundColor: isSidebar
            ? currentLang === 'dz'
              ? 'var(--navy-2)'
              : 'transparent'
            : currentLang === 'dz'
            ? 'var(--navy)'
            : '#FFFFFF',
          color: isSidebar
            ? currentLang === 'dz'
              ? '#FFFFFF'
              : 'var(--nav-text)'
            : currentLang === 'dz'
            ? '#FFFFFF'
            : 'var(--ink)',
        }}
      >
        རྫོང་ཁ
      </button>
    </div>
  );
};
