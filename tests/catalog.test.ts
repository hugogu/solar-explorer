import { describe, expect, it } from 'vitest';
import { ALL_BODIES, BODY_BY_ID, moonsOf } from '../src/data';
import { SATELLITE_ELEMENTS } from '../src/astro/satellites';
import { SMALL_BODIES } from '../src/astro/smallbodies';
import { PLANET_IDS } from '../src/astro/planets';

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
      expect(b.name.length, b.id).toBeGreaterThan(0);
      expect(b.nameEn.length, b.id).toBeGreaterThan(0);
      expect(b.tagline.length, b.id).toBeGreaterThan(4);
      expect(b.facts.length, b.id).toBeGreaterThanOrEqual(2);
      expect(b.physical.radiusKm, b.id).toBeGreaterThan(0);
      expect(/^#[0-9a-f]{6}$/i.test(b.color), b.id).toBe(true);
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
