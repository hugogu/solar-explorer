/**
 * Language selection.
 *
 * Two kinds of text need translating and they are stored differently. UI
 * chrome lives in a key/value dictionary (`t`), because the same phrase is used
 * from several places. Catalogue prose is written inline in the data files as
 * `Localised<T>` and read with `tr`, so a body's Chinese and English text sit
 * next to each other and drift is obvious in review.
 */
import { STRINGS, type StringKey } from './strings';

export type Lang = 'zh' | 'en';

/** A value that exists in both languages. */
export type Localised<T> = { zh: T; en: T };

export const LANGUAGES: Lang[] = ['zh', 'en'];

const STORAGE_KEY = 'solar.lang';

let current: Lang = detect();
const listeners = new Set<() => void>();

/**
 * Stored choice first, then `?lang=`, then the browser's own preference.
 * Anything that is not clearly English falls back to Chinese, which is the
 * language the catalogue was written in.
 */
function detect(): Lang {
  const stored = safeRead();
  if (stored === 'zh' || stored === 'en') return stored;
  const query = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
  if (query === 'zh' || query === 'en') return query;
  const preferred = globalThis.navigator?.languages ?? [];
  for (const tag of preferred) {
    if (/^zh\b/i.test(tag)) return 'zh';
    if (/^en\b/i.test(tag)) return 'en';
  }
  return 'zh';
}

function safeRead(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Private browsing can make localStorage throw on access alone.
    return null;
  }
}

export function language(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  for (const listener of listeners) listener();
}

export function onLanguageChange(handler: () => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/** Read the current language out of a localised value. */
export function tr<T>(value: Localised<T>): T {
  return value[current];
}

/** Look up a UI string, substituting `{name}` placeholders. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = STRINGS[current][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole);
}

/** Joining conjunction: Chinese uses a full-width enumeration comma. */
export function joinList(items: string[]): string {
  return items.join(current === 'zh' ? '、' : ', ');
}

export type { StringKey };
