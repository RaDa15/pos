import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import dz from './dz.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    dz: { translation: dz },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export function setAppLanguage(lang: 'en' | 'dz'): void {
  i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export default i18n;
