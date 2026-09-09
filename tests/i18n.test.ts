import { describe, expect, it } from 'vitest';
import { LANGUAGES, joinList, language, setLanguage, t, tr } from '../src/i18n';
import { STRINGS, type StringKey } from '../src/i18n/strings';
import {
  formatDistanceAu, formatDurationDays, formatHours, formatKm, weekday,
} from '../src/ui/format';
import { utcToJD } from '../src/astro/time';

function withLanguage<T>(lang: 'zh' | 'en', body: () => T): T {
  const previous = language();
  setLanguage(lang);
  try {
    return body();
  } finally {
    setLanguage(previous);
  }
}

describe('string table', () => {
  it('translates every key', () => {
    const keys = Object.keys(STRINGS.zh) as StringKey[];
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      for (const lang of LANGUAGES) {
        expect(STRINGS[lang][key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  /**
   * A placeholder that only one language has is a silently broken sentence:
   * either a stray "{name}" on screen or a missing value.
   */
  it('uses the same placeholders in both languages', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const key of Object.keys(STRINGS.zh) as StringKey[]) {
      expect(placeholders(STRINGS.en[key]), key).toBe(placeholders(STRINGS.zh[key]));
    }
  });

  it('substitutes named parameters', () => {
    withLanguage('en', () => {
      expect(t('info.moons', { count: 4 })).toBe('Moons (4 in this catalogue)');
    });
    withLanguage('zh', () => {
      expect(t('info.moons', { count: 4 })).toBe('卫星（本站收录 4 颗）');
    });
  });

  it('leaves an unknown placeholder alone rather than blanking it', () => {
    withLanguage('en', () => {
      expect(t('info.moons', {})).toContain('{count}');
    });
  });
});

describe('localised values', () => {
  it('reads the field for the active language', () => {
    const value = { zh: '木星', en: 'Jupiter' };
    expect(withLanguage('zh', () => tr(value))).toBe('木星');
    expect(withLanguage('en', () => tr(value))).toBe('Jupiter');
  });

  it('joins lists with the language conjunction', () => {
    expect(withLanguage('zh', () => joinList(['甲', '乙']))).toBe('甲、乙');
    expect(withLanguage('en', () => joinList(['a', 'b']))).toBe('a, b');
  });
});

describe('locale-aware formatting', () => {
  /** Chinese counts in myriads, English in thousands. */
  it('groups large numbers the way the language does', () => {
    expect(withLanguage('zh', () => formatKm(918000000))).toBe('9.18 亿公里');
    expect(withLanguage('en', () => formatKm(918000000))).toBe('918.00 million km');
  });

  it('keeps small numbers ungrouped', () => {
    expect(withLanguage('zh', () => formatKm(384.4))).toBe('384 公里');
    expect(withLanguage('en', () => formatKm(384.4))).toBe('384 km');
  });

  /** English has no myriad, so a five-digit figure stays a five-digit figure. */
  it('writes sub-million English figures with thousands separators', () => {
    expect(withLanguage('en', () => formatKm(69911))).toBe('69,911 km');
    expect(withLanguage('zh', () => formatKm(69911))).toBe('6.99 万公里');
  });

  it('formats astronomical distances with both units', () => {
    expect(withLanguage('en', () => formatDistanceAu(1))).toMatch(/^1\.0000 AU \(149\.60 million km\)$/);
    expect(withLanguage('zh', () => formatDistanceAu(1))).toMatch(/^1\.0000 AU（1\.50 亿公里）$/);
  });

  it('names weekdays', () => {
    // 2026-09-09 is a Wednesday.
    const jd = utcToJD(2026, 9, 9, 12, 0, 0);
    expect(withLanguage('zh', () => weekday(jd, 0))).toBe('周三');
    expect(withLanguage('en', () => weekday(jd, 0))).toBe('Wed');
  });

  it('marks retrograde rotation in words, not a minus sign', () => {
    expect(withLanguage('zh', () => formatHours(-5832.5))).toContain('逆向');
    expect(withLanguage('en', () => formatHours(-5832.5))).toContain('retrograde');
  });

  it('picks a sensible duration unit', () => {
    expect(withLanguage('en', () => formatDurationDays(0.02))).toBe('28.8 min');
    expect(withLanguage('en', () => formatDurationDays(1.5))).toBe('36.00 h');
    expect(withLanguage('en', () => formatDurationDays(88))).toBe('88.00 days');
    expect(withLanguage('en', () => formatDurationDays(4333))).toBe('11.86 years');
  });
});
