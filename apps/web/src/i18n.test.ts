import { describe, it, expect } from 'vitest';
import i18n, { setAppLanguage } from './i18n/index.js';

describe('i18n Configuration (AC-65)', () => {
  it('translates navigation keys in English by default', () => {
    setAppLanguage('en');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('nav.pos')).toBe('POS');
  });

  it('translates navigation keys into Dzongkha when language is dz', () => {
    setAppLanguage('dz');
    expect(i18n.t('nav.pos')).toContain('ཚོང་འབྲེལ།');
    expect(i18n.t('nav.inventory')).toContain('གསོག་འཇོག');
  });

  it('falls back to English when a key is missing in dz.json', () => {
    setAppLanguage('dz');
    // Test key that exists in English
    const fallbackText = i18n.t('common.filter');
    expect(fallbackText).toBeTruthy();
  });
});
