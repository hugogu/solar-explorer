/** Body naming helpers that depend on the interface language. */
import type { BodyInfo } from '../data';
import { language } from '../i18n';

/**
 * The name in the language the interface is *not* using.
 *
 * The lists and the info header show both, and which one is the subtitle
 * depends on which one is the heading.
 */
export function otherName(body: BodyInfo): string {
  return body.name[language() === 'zh' ? 'en' : 'zh'];
}

/** Every spelling of a body's name, for matching a search query against. */
export function searchableText(body: BodyInfo): string {
  return `${body.name.zh} ${body.name.en} ${body.tagline.zh} ${body.tagline.en}`.toLowerCase();
}
