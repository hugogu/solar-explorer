/** Body naming helpers that depend on the interface language. */
import { type BodyInfo, moonsOf } from '../data';
import { language, t } from '../i18n';

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
  return [
    body.name.zh, body.name.en, body.designation ?? '', body.tagline.zh, body.tagline.en,
  ].join(' ').toLowerCase();
}

/**
 * The dim second column in the navigator.
 *
 * It used to carry the name in the other language, which is not something a
 * reader of either one asks for. What they do want at a glance is how many
 * moons a planet has - and for a body with none, the catalogue designation
 * that its name was separated from: Io is Jupiter I, Halley is 1P.
 */
export function rowAlias(body: BodyInfo): string {
  const moons = body.physical.moonCount ?? moonsOf(body.id).length;
  if (moons === 1) return t('list.moonCountOne');
  if (moons > 1) return t('list.moonCount', { count: moons });
  if (!body.designation) return '';
  // Chinese names moons positionally, so 木卫一 already *is* "Jupiter I" and
  // printing the designation beside it says nothing. There the missing half is
  // the proper name.
  if (body.kind === 'moon' && language() === 'zh') return otherName(body);
  return body.designation;
}
