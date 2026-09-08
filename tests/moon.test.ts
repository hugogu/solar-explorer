import { describe, expect, it } from 'vitest';
import { moonPosition, moonPhase } from '../src/astro/moon';
import { sunPosition } from '../src/astro/sun';
import { jdToTT, utcToJD } from '../src/astro/time';

describe('lunar orbit over a full year', () => {
  it('stays inside the real perigee/apogee band', () => {
    let min = Infinity;
    let max = -Infinity;
    const start = utcToJD(2026, 1, 1);
    for (let d = 0; d < 365; d += 0.1) {
      const r = moonPosition(start + d).distKm;
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(min).toBeGreaterThan(356000);
    expect(min).toBeLessThan(363000);
    expect(max).toBeGreaterThan(404000);
    expect(max).toBeLessThan(407000);
  });
});

describe('lunar phase', () => {
  it('is full at the March 2025 total lunar eclipse', () => {
    const jd = jdToTT(utcToJD(2025, 3, 14, 6, 59));
    const p = moonPhase(jd, sunPosition(jd).lon, sunPosition(jd).dist);
    expect(p.illumination).toBeGreaterThan(0.999);
    expect(p.phase).toBeGreaterThan(0.49);
    expect(p.phase).toBeLessThan(0.51);
  });
  it('is new at the April 2024 total solar eclipse', () => {
    const jd = jdToTT(utcToJD(2024, 4, 8, 18, 17));
    const p = moonPhase(jd, sunPosition(jd).lon, sunPosition(jd).dist);
    expect(p.illumination).toBeLessThan(0.001);
  });
  it('is half lit at first quarter', () => {
    // 2025-04-05 first quarter.
    const jd = jdToTT(utcToJD(2025, 4, 5, 2, 15));
    const p = moonPhase(jd, sunPosition(jd).lon, sunPosition(jd).dist);
    expect(p.illumination).toBeGreaterThan(0.49);
    expect(p.illumination).toBeLessThan(0.51);
  });
});
