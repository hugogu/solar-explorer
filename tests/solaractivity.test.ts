import { describe, expect, it } from 'vitest';
import { prominences, rotationRate, solarCycle, sunspots } from '../src/astro/solaractivity';
import { utcToJD } from '../src/astro/time';

const jdOf = (y: number, m: number, d = 15) => utcToJD(y, m, d, 0, 0, 0);

/** Julian day of the cycle's peak sunspot number, found by scanning. */
function maximumOf(fromYear: number, toYear: number): { year: number; number: number } {
  let best = { year: fromYear, number: -1 };
  for (let y = fromYear; y <= toYear; y += 1 / 12) {
    const n = solarCycle(jdOf(Math.floor(y), Math.round((y % 1) * 12) + 1)).sunspotNumber;
    if (n > best.number) best = { year: y, number: n };
  }
  return best;
}

describe('solar cycle', () => {
  it('numbers the cycles from the recorded minima', () => {
    expect(solarCycle(jdOf(2021, 6)).number).toBe(25);
    expect(solarCycle(jdOf(2015, 6)).number).toBe(24);
    expect(solarCycle(jdOf(2000, 6)).number).toBe(23);
    // Beyond the table it falls back to a mean-length cycle.
    expect(solarCycle(jdOf(2035, 6)).number).toBe(26);
  });

  /** Cycle 25 peaked in October 2024, cycle 24 in April 2014. */
  it('puts the maxima where they were observed', () => {
    expect(maximumOf(2020, 2030).year).toBeCloseTo(2024.3, 0);
    expect(maximumOf(2009, 2019).year).toBeCloseTo(2014.0, 0);
  });

  it('rises faster than it falls', () => {
    const min = jdOf(2019, 12);
    const rise = maximumOf(2020, 2030).year - 2019.92;
    expect(rise).toBeGreaterThan(4);
    expect(rise).toBeLessThan(5.5);
    // Still going at the end of the cycle, but far below the peak.
    expect(solarCycle(min + 10 * 365.25).activity)
      .toBeLessThan(solarCycle(min + 4.8 * 365.25).activity / 3);
  });

  /**
   * The Waldmeier effect: strong cycles rise faster. Cycle 24 was the weakest in
   * a century and took five and a half years to peak; cycle 22 took three.
   */
  it('reproduces the observed rise times', () => {
    expect(maximumOf(2009, 2019).year - 2008.96).toBeGreaterThan(
      maximumOf(1987, 1996).year - 1986.7,
    );
  });

  it('is quiet at minimum and loud at maximum', () => {
    expect(solarCycle(jdOf(2019, 12)).sunspotNumber).toBeLessThan(10);
    expect(solarCycle(jdOf(2024, 10)).sunspotNumber).toBeGreaterThan(120);
  });

  it('gives a weaker cycle 24 than cycle 25', () => {
    expect(maximumOf(2009, 2019).number).toBeLessThan(maximumOf(2020, 2030).number);
  });
});

describe('differential rotation', () => {
  it('turns the equator faster than the poles', () => {
    expect(rotationRate(0)).toBeCloseTo(14.713, 3);
    expect(rotationRate(60)).toBeLessThan(rotationRate(30));
    expect(rotationRate(30)).toBeLessThan(rotationRate(0));
    // The equator laps 60 degrees latitude in about four months.
    const lap = 360 / (rotationRate(0) - rotationRate(60));
    expect(lap).toBeGreaterThan(90);
    expect(lap).toBeLessThan(160);
  });
});

describe('sunspots', () => {
  it('produces far more groups at maximum than at minimum', () => {
    const quiet = sunspots(jdOf(2019, 12)).length;
    const busy = sunspots(jdOf(2024, 10)).length;
    expect(quiet).toBeLessThan(5);
    expect(busy).toBeGreaterThan(10);
  });

  /** Spörer's law: the belts start near 25-30 degrees and end near the equator. */
  it('drifts the spot belts towards the equator as the cycle ages', () => {
    const mean = (jd: number) => {
      const s = sunspots(jd, 64);
      return s.reduce((sum, spot) => sum + Math.abs(spot.latitude), 0) / s.length;
    };
    const early = mean(jdOf(2021, 6));
    const late = mean(jdOf(2029, 6));
    expect(early).toBeGreaterThan(late + 4);
    expect(early).toBeLessThan(35);
    expect(late).toBeGreaterThan(3);
  });

  /**
   * The clock can be scrubbed in any direction, so the same instant has to
   * produce the same Sun, and a small step has to move it only a little.
   */
  it('is continuous and reproducible in time', () => {
    const jd = jdOf(2024, 10);
    expect(sunspots(jd)).toEqual(sunspots(jd));
    const now = sunspots(jd, 64);
    const soon = sunspots(jd + 1 / 1440, 64);
    expect(soon.length).toBe(now.length);
    for (let i = 0; i < now.length; i++) {
      expect(Math.abs(soon[i].latitude - now[i].latitude)).toBeLessThan(0.001);
      expect(Math.abs(soon[i].strength - now[i].strength)).toBeLessThan(0.01);
    }
  });

  /**
   * The globe is drawn turning at the IAU mean rate, so a group has to carry
   * the difference itself: low latitudes creep forward, high ones fall back.
   */
  it('drifts each group at its own latitude\u2019s rotation rate', () => {
    const jd = jdOf(2024, 10);
    const days = 6;
    const before = sunspots(jd, 64);
    const after = sunspots(jd + days, 64);
    let checked = 0;
    for (const spot of before) {
      // Latitude is fixed for a group's whole life, so it identifies it.
      const same = after.find((s) => Math.abs(s.latitude - spot.latitude) < 1e-9);
      if (!same) continue;
      const expected = (rotationRate(spot.latitude) - 14.1844) * days;
      const moved = ((same.longitude - spot.longitude + 540) % 360) - 180;
      expect(moved).toBeCloseTo(expected, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('keeps every spot on the sphere', () => {
    for (const jd of [jdOf(2019, 12), jdOf(2022, 3), jdOf(2024, 10), jdOf(2028, 8)]) {
      for (const spot of sunspots(jd, 64)) {
        expect(Math.abs(spot.latitude)).toBeLessThanOrEqual(90);
        expect(spot.radius).toBeGreaterThan(0);
        expect(spot.radius).toBeLessThan(12);
        expect(spot.strength).toBeGreaterThan(0);
        expect(spot.strength).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('prominences', () => {
  it('follows the cycle and reaches beyond the spot belts', () => {
    const busy = prominences(jdOf(2024, 10), 32);
    expect(busy.length).toBeGreaterThan(prominences(jdOf(2019, 12), 32).length);
    expect(Math.max(...busy.map((p) => Math.abs(p.latitude)))).toBeGreaterThan(40);
    for (const p of busy) {
      expect(p.height).toBeGreaterThan(0);
      expect(p.height).toBeLessThan(0.23);
    }
  });
});
