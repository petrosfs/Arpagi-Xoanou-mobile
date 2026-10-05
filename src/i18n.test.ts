import { describe, expect, it } from 'vitest';
import { DICTS, resolveLang, type Key } from './i18n';

describe('μεταφράσεις', () => {
  it('κάθε κείμενο υπάρχει και στις δύο γλώσσες, μη κενό', () => {
    const keys = Object.keys(DICTS.el) as Key[];
    expect(Object.keys(DICTS.en).sort()).toEqual([...keys].sort());
    const vars = { n: 2, name: 'Χ', code: 'ABCD', min: 12, max: 21, no: 1, time: '1:00' };
    for (const lang of ['el', 'en'] as const)
      for (const k of keys) {
        const e = DICTS[lang][k];
        const text = typeof e === 'function' ? e(vars) : e;
        expect(text.trim().length, `${lang}:${k}`).toBeGreaterThan(0);
        expect(text, `${lang}:${k}`).not.toContain('undefined');
      }
  });
  it('τα αγγλικά δεν περιέχουν ελληνικά', () => {
    for (const [k, e] of Object.entries(DICTS.en)) {
      const text = typeof e === 'function' ? e({ n: 2, name: 'X', code: 'ABCD', min: 12, max: 21, no: 1, time: '1:00' }) : e;
      expect(/[\u0370-\u03FF]/.test(text), k).toBe(false);
    }
  });
  it('αυτόματη γλώσσα από το κινητό', () => {
    expect(resolveLang('auto', ['el-GR', 'en'])).toBe('el');
    expect(resolveLang('auto', ['en-US'])).toBe('en');
    expect(resolveLang('auto', ['de-DE', 'el'])).toBe('el');
    expect(resolveLang('auto', [])).toBe('en');
    expect(resolveLang('el', ['en-US'])).toBe('el');
  });
});
