/** Formatting helpers, all output in Chinese conventions. */
import { jdToDate } from '../astro/time';

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

export function weekday(jd: number, offsetHours: number): string {
  const d = jdToDate(jd + offsetHours / 24);
  return '周' + '日一二三四五六'[d.getUTCDay()];
}

/**
 * Large numbers with Chinese myriad grouping.
 * @param unit appended directly, with no space, so "9.18 亿公里" reads naturally
 */
export function formatBigNumber(value: number, unit = ''): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)} 万亿${unit}`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)} 亿${unit}`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)} 万${unit}`;
  if (abs >= 100) return `${value.toFixed(0)} ${unit}`;
  if (abs >= 1) return `${value.toFixed(2)} ${unit}`;
  return `${value.toPrecision(3)} ${unit}`;
}

export function formatDistanceAu(au: number): string {
  const km = au * 149597870.7;
  if (au < 0.0005) return formatBigNumber(km, '公里');
  return `${au.toFixed(au < 10 ? 4 : 3)} AU（${formatBigNumber(km, '公里')}）`;
}

export function formatKm(km: number): string {
  return formatBigNumber(km, '公里');
}

export function formatDurationDays(days: number): string {
  const abs = Math.abs(days);
  if (abs < 1 / 24) return `${(abs * 1440).toFixed(1)} 分钟`;
  if (abs < 2) return `${(abs * 24).toFixed(2)} 小时`;
  if (abs < 700) return `${abs.toFixed(2)} 天`;
  return `${(abs / 365.25).toFixed(2)} 年`;
}

export function formatHours(hours: number): string {
  const abs = Math.abs(hours);
  const sign = hours < 0 ? '逆向 ' : '';
  if (abs < 48) {
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return `${sign}${h} 小时 ${pad(m)} 分`;
  }
  return `${sign}${(abs / 24).toFixed(2)} 天`;
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
