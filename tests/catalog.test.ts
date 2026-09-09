import { describe, expect, it } from 'vitest';
import { ALL_BODIES, BODY_BY_ID, moonsOf } from '../src/data';
import { SATELLITE_ELEMENTS } from '../src/astro/satellites';
import { SMALL_BODIES } from '../src/astro/smallbodies';
import { PLANET_IDS } from '../src/astro/planets';
import { LANGUAGES } from '../src/i18n';

describe('catalogue integrity', () => {
  it('has no duplicate ids', () => {
    const ids = ALL_BODIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes every planet the ephemeris can compute', () => {
    for (const id of PLANET_IDS) expect(BODY_BY_ID.has(id), id).toBe(true);
  });

  it('describes every satellite that has orbital elements', () => {
    for (const sat of SATELLITE_ELEMENTS) expect(BODY_BY_ID.has(sat.id), sat.id).toBe(true);
  });

  it('describes every small body that has orbital elements', () => {
    for (const b of SMALL_BODIES) expect(BODY_BY_ID.has(b.id), b.id).toBe(true);
  });

  it('gives every moon a parent that exists', () => {
    for (const b of ALL_BODIES) {
      if (b.kind === 'moon') expect(BODY_BY_ID.has(b.parent as string), b.id).toBe(true);
    }
  });

  it('gives every body a name, a tagline and at least two facts', () => {
    for (const b of ALL_BODIES) {
      for (const lang of LANGUAGES) {
        expect(b.name[lang].length, `${b.id} ${lang}`).toBeGreaterThan(0);
        expect(b.tagline[lang].length, `${b.id} ${lang}`).toBeGreaterThan(4);
        expect(b.description[lang].length, `${b.id} ${lang}`).toBeGreaterThan(20);
        expect(b.facts[lang].length, `${b.id} ${lang}`).toBeGreaterThanOrEqual(2);
      }
      expect(b.physical.radiusKm, b.id).toBeGreaterThan(0);
      expect(/^#[0-9a-f]{6}$/i.test(b.color), b.id).toBe(true);
    }
  });

  /**
   * A translation that drops a bullet is easy to miss by eye, and the fact
   * carousel counts them, so the two lists have to stay the same length.
   */
  it('translates every fact and every mission', () => {
    for (const b of ALL_BODIES) {
      expect(b.facts.en.length, b.id).toBe(b.facts.zh.length);
      if (b.missions) expect(b.missions.en.length, b.id).toBe(b.missions.zh.length);
    }
  });

  it('leaves no Chinese text in the English catalogue', () => {
    const han = /\p{Script=Han}/u;
    for (const b of ALL_BODIES) {
      const english = [
        b.name.en, b.tagline.en, b.description.en, ...b.facts.en,
        b.physical.atmosphere?.en ?? '', b.discovery?.by.en ?? '', ...(b.missions?.en ?? []),
      ].join(' ');
      expect(han.test(english), b.id).toBe(false);
    }
  });

  it('links the Galilean moons to Jupiter', () => {
    const ids = moonsOf('jupiter').map((m) => m.id);
    expect(ids).toContain('io');
    expect(ids).toContain('europa');
    expect(ids).toContain('ganymede');
    expect(ids).toContain('callisto');
  });
});
