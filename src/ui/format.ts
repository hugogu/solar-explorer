/** Formatting helpers. Number grouping and unit words follow the UI language. */
import { jdToDate } from '../astro/time';
import { language, t, type Lang } from '../i18n';

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, '0');

/** Format a Julian day in a fixed UTC offset. */
export function formatDateTime(jd: number, offsetHours: number, withSeconds = true): string {
  const d = jdToDate(jd + offsetHours / 24);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getUTCSeconds())}` : base;
}

export function formatDate(jd: number, offsetHours: number): string {
  const d = jdToDate(jd + offsetHours / 24);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatClock(jd: number | undefined, offsetHours: number): string {
  if (jd === undefined || !Number.isFinite(jd)) return '—';
  const d = jdToDate(jd + offsetHours / 24);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatClockSeconds(jd: number | undefined, offsetHours: number): string {
  if (jd === undefined || !Number.isFinite(jd)) return '—';
  const d = jdToDate(jd + offsetHours / 24);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const WEEKDAYS: Record<Lang, string[]> = {
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export function weekday(jd: number, offsetHours: number): string {
  const d = jdToDate(jd + offsetHours / 24);
  return WEEKDAYS[language()][d.getUTCDay()];
}

/**
 * Magnitude words, largest first.
 *
 * The two languages do not just use different words, they group differently:
 * Chinese counts in myriads (万, 亿) and English in thousands, so each needs
 * its own ladder rather than a shared one with translated labels.
 */
const MAGNITUDES: Record<Lang, Array<[number, string]>> = {
  zh: [[1e12, '万亿'], [1e8, '亿'], [1e4, '万']],
  // No "thousand": English writes 69,911 km, not 69.91 thousand km.
  en: [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']],
};

/**
 * Large numbers with the language's own grouping.
 * @param unit appended after the magnitude word, glued on in Chinese so
 *   "9.18 亿公里" reads naturally and spaced in English for "918 million km"
 */
export function formatBigNumber(value: number, unit = ''): string {
  const lang = language();
  const gap = lang === 'zh' ? '' : ' ';
  const abs = Math.abs(value);
  for (const [scale, word] of MAGNITUDES[lang]) {
    if (abs >= scale) return `${(value / scale).toFixed(2)} ${word}${gap}${unit}`.trimEnd();
  }
  if (abs >= 100) return `${Math.round(value).toLocaleString('en-US')} ${unit}`.trimEnd();
  const number = abs >= 1 ? value.toFixed(2) : value.toPrecision(3);
  return `${number} ${unit}`.trimEnd();
}

export function formatDistanceAu(au: number): string {
  const km = au * 149597870.7;
  if (au < 0.0005) return formatKm(km);
  return t('unit.distanceAu', { au: au.toFixed(au < 10 ? 4 : 3), km: formatKm(km) });
}

export function formatKm(km: number): string {
  return formatBigNumber(km, t('unit.km'));
}

export function formatDurationDays(days: number): string {
  const abs = Math.abs(days);
  if (abs < 1 / 24) return t('unit.minutes', { value: (abs * 1440).toFixed(1) });
  if (abs < 2) return t('unit.hours', { value: (abs * 24).toFixed(2) });
  if (abs < 700) return t('unit.days', { value: abs.toFixed(2) });
  return t('unit.years', { value: (abs / 365.25).toFixed(2) });
}

export function formatHours(hours: number): string {
  const abs = Math.abs(hours);
  const sign = hours < 0 ? t('unit.retrograde') : '';
  if (abs < 48) {
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return sign + t('unit.hoursMinutes', { hours: h, minutes: pad(m) });
  }
  return sign + t('unit.days', { value: (abs / 24).toFixed(2) });
}

export function formatAngle(deg: number, digits = 2): string {
  return `${deg.toFixed(digits)}°`;
}

export function formatOffset(offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `UTC${sign}${pad(h)}:${pad(m)}`;
}

export function formatTemperature(c: number | undefined): string {
  return c === undefined ? '—' : `${c.toFixed(0)} ℃`;
}
