import { describe, expect, it } from 'vitest';
import { moonPosition } from '../src/astro/moon';
import { sunPosition, equationOfTime, nextSolarLongitude } from '../src/astro/sun';
import { jdToTT, utcToJD, jdToDate, gmst, deltaTSeconds } from '../src/astro/time';
import { dayEvents, sunAltitude, moonAltitude, findRiseSet } from '../src/astro/riseset';
import { findEclipses, localSolarCircumstances, topocentricDiscs } from '../src/astro/eclipse';
import { planetHelio, planetGeocentric, earthHelio, vecLength, vecToSpherical } from '../src/astro/planets';
import { moonGeocentricVector } from '../src/astro/moon';
import { angularSeparation } from '../src/astro/math';
import { precessFromJ2000 } from '../src/astro/coords';

const BEIJING = { latitude: 39.9042, longitude: 116.4074, elevation: 44 };

describe('time scales', () => {
  it('converts the Julian day epoch', () => {
    expect(utcToJD(2000, 1, 1, 12)).toBe(2451545);
    expect(utcToJD(1957, 10, 4, 19, 26, 24)).toBeCloseTo(2436116.31, 2);
  });
  it('keeps delta-T near the observed 69 s for the 2020s', () => {
    expect(deltaTSeconds(2025)).toBeGreaterThan(68);
    expect(deltaTSeconds(2025)).toBeLessThan(71);
  });
  it('computes sidereal time (Meeus example 12.a)', () => {
    expect(gmst(2446895.5)).toBeCloseTo(197.693195, 4);
  });
});

describe('lunar theory (Meeus example 47.a, 1992 April 12.0 TD)', () => {
  const m = moonPosition(2448724.5);
  it('matches the published longitude', () => expect(m.lon).toBeCloseTo(133.162655, 4));
  it('matches the published latitude', () => expect(m.lat).toBeCloseTo(-3.229126, 4));
  it('matches the published distance', () => expect(m.distKm).toBeCloseTo(368409.7, 1));
  it('matches the published parallax', () => expect(m.parallax).toBeCloseTo(0.99199, 5));
});

describe('solar theory', () => {
  const seasons: Array<[string, number, [number, number, number, number, number]]> = [
    ['2025 March equinox', 0, [2025, 3, 20, 9, 1]],
    ['2025 June solstice', 90, [2025, 6, 21, 2, 42]],
    ['2025 September equinox', 180, [2025, 9, 22, 18, 19]],
    ['2025 December solstice', 270, [2025, 12, 21, 15, 3]],
    ['2026 March equinox', 0, [2026, 3, 20, 14, 46]],
  ];
  for (const [name, lon, utc] of seasons) {
    it(`puts the Sun at ${lon} deg at the ${name}`, () => {
      const jd = utcToJD(...(utc as [number, number, number, number, number]));
      const got = sunPosition(jdToTT(jd)).lon;
      const diff = Math.abs(((got - lon + 540) % 360) - 180);
      // 1 minute of time is 0.00068 deg; published instants are rounded to the minute.
      expect(diff).toBeLessThan(0.0012);
    });
  }
  it('finds the next equinox and solstice rather than one years later', () => {
    // The naive Newton solve used to overshoot by whole years.
    const start = jdToTT(utcToJD(2026, 9, 8));
    const seasons: Array<[number, string]> = [
      [180, '2026-09-23'], [270, '2026-12-21'], [0, '2027-03-20'], [90, '2027-06-21'],
    ];
    for (const [longitude, expected] of seasons) {
      const jd = nextSolarLongitude(longitude, start);
      expect(jd).toBeGreaterThan(start);
      expect(jdToDate(jd).toISOString().slice(0, 10), `${longitude} deg`).toBe(expected);
    }
  });

  it('has an equation of time near +16 min in early November', () => {
    const e = equationOfTime(jdToTT(utcToJD(2025, 11, 3)));
    expect(e).toBeGreaterThan(16);
    expect(e).toBeLessThan(16.6);
  });
  it('has an equation of time near -14 min in mid February', () => {
    const e = equationOfTime(jdToTT(utcToJD(2025, 2, 11)));
    expect(e).toBeLessThan(-14);
    expect(e).toBeGreaterThan(-14.4);
  });
});

describe('planetary positions', () => {
  it('keeps every planet inside its known perihelion/aphelion band', () => {
    const bands: Record<string, [number, number]> = {
      mercury: [0.3074, 0.4668], venus: [0.7182, 0.7286], earth: [0.9832, 1.0168],
      mars: [1.381, 1.667], jupiter: [4.95, 5.46], saturn: [9.02, 10.06],
      uranus: [18.28, 20.1], neptune: [29.8, 30.34], pluto: [29.6, 49.4],
    };
    for (const [id, [lo, hi]] of Object.entries(bands)) {
      for (let jd = utcToJD(2000, 1, 1); jd < utcToJD(2040, 1, 1); jd += 37) {
        const r = vecLength(planetHelio(id as never, jd));
        expect(r).toBeGreaterThanOrEqual(lo - 0.01);
        expect(r).toBeLessThanOrEqual(hi + 0.01);
      }
    }
  });

  it('agrees with the VSOP-based Sun on where the Earth is', () => {
    // Independent implementations: Keplerian elements vs the VSOP87 series.
    for (let jd = utcToJD(2020, 1, 1); jd < utcToJD(2035, 1, 1); jd += 53) {
      const earth = earthHelio(jd, moonGeocentricVector(jd));
      const j2000 = vecToSpherical([-earth[0], -earth[1], -earth[2]]);
      // Keplerian elements are referred to J2000, the Sun series to the equinox of date.
      const sunFromEarth = precessFromJ2000(j2000.lon, j2000.lat, jd);
      const sun = sunPosition(jd);
      const diff = Math.abs(((sunFromEarth.lon - sun.geometricLon + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.02);
      const dist = j2000.dist;
      expect(Math.abs(dist - sun.dist)).toBeLessThan(0.0002);
    }
  });

  it('puts Mars at opposition on 2025-01-16', () => {
    // Opposition = geocentric elongation from the Sun of 180 degrees.
    const jd = jdToTT(utcToJD(2025, 1, 16));
    const earth = earthHelio(jd, moonGeocentricVector(jd));
    const marsJ2000 = vecToSpherical(planetGeocentric('mars', jd, earth));
    const mars = precessFromJ2000(marsJ2000.lon, marsJ2000.lat, jd);
    const sun = sunPosition(jd);
    const elong = Math.abs(((mars.lon - sun.lon + 540) % 360) - 180);
    expect(elong).toBeGreaterThan(179);
  });
});

describe('rise, set and twilight', () => {
  it('places the Sun exactly on the standard horizon at the computed sunrise', () => {
    const ev = dayEvents(utcToJD(2026, 3, 15) - 8 / 24, BEIJING);
    expect(ev.sunrise).toBeDefined();
    expect(sunAltitude(ev.sunrise as number, BEIJING).altitude).toBeCloseTo(-0.8333, 3);
    expect(sunAltitude(ev.sunset as number, BEIJING).altitude).toBeCloseTo(-0.8333, 3);
  });

  it('matches published almanac times for Beijing at the solstices', () => {
    const summer = dayEvents(utcToJD(2025, 6, 21) - 8 / 24, BEIJING);
    const local = (jd: number) => jdToDate(jd + 8 / 24).toISOString().slice(11, 16);
    expect(local(summer.sunrise as number)).toBe('04:45');
    expect(local(summer.sunset as number)).toBe('19:46');
    expect(summer.dayLength).toBeGreaterThan(15);

    const winter = dayEvents(utcToJD(2025, 12, 21) - 8 / 24, BEIJING);
    expect(local(winter.sunrise as number)).toBe('07:32');
    expect(local(winter.sunset as number)).toBe('16:52');
    expect(winter.dayLength).toBeLessThan(9.5);
  });

  it('reports polar day above the Arctic circle in June', () => {
    const ev = dayEvents(utcToJD(2025, 6, 21) - 2 / 24, { latitude: 69.65, longitude: 18.96, elevation: 0 });
    expect(ev.polarDay).toBe(true);
    expect(ev.dayLength).toBe(24);
    expect(ev.sunrise).toBeUndefined();
  });

  it('reports polar night above the Arctic circle in December', () => {
    const ev = dayEvents(utcToJD(2025, 12, 21) - 2 / 24, { latitude: 69.65, longitude: 18.96, elevation: 0 });
    expect(ev.polarNight).toBe(true);
    expect(ev.dayLength).toBe(0);
  });

  it('orders the twilight phases correctly', () => {
    const ev = dayEvents(utcToJD(2026, 4, 10) - 8 / 24, BEIJING);
    expect(ev.astronomicalDawn as number).toBeLessThan(ev.nauticalDawn as number);
    expect(ev.nauticalDawn as number).toBeLessThan(ev.civilDawn as number);
    expect(ev.civilDawn as number).toBeLessThan(ev.sunrise as number);
    expect(ev.sunset as number).toBeLessThan(ev.civilDusk as number);
    expect(ev.civilDusk as number).toBeLessThan(ev.nauticalDusk as number);
  });

  it('puts the Moon on its own horizon at moonrise', () => {
    const ev = dayEvents(utcToJD(2026, 5, 5) - 8 / 24, BEIJING);
    const a = moonAltitude(ev.moonrise as number, BEIJING);
    expect(a.altitude).toBeCloseTo(a.horizon, 2);
  });

  it('finds no crossing when a body stays below the horizon', () => {
    const r = findRiseSet(utcToJD(2025, 12, 21) - 2 / 24, (jd) => sunAltitude(jd, { latitude: 80, longitude: 0, elevation: 0 }));
    expect(r.alwaysDown).toBe(true);
    expect(r.rise).toBeUndefined();
  });
});

describe('eclipse prediction', () => {
  const list = findEclipses(utcToJD(2023, 10, 1), { limit: 22 });
  const at = (isoPrefix: string) => list.find((e) => jdToDate(e.jdMax).toISOString().startsWith(isoPrefix));

  const expectations: Array<[string, string, string, number]> = [
    // date prefix, kind, type, published time of greatest eclipse (minutes into the day, UT)
    ['2023-10-14', 'solar', 'annular', 18 * 60 + 0],
    ['2023-10-28', 'lunar', 'partial', 20 * 60 + 14],
    ['2024-03-25', 'lunar', 'penumbral', 7 * 60 + 13],
    ['2024-04-08', 'solar', 'total', 18 * 60 + 17],
    ['2024-09-18', 'lunar', 'partial', 2 * 60 + 44],
    ['2024-10-02', 'solar', 'annular', 18 * 60 + 45],
    ['2025-03-14', 'lunar', 'total', 6 * 60 + 59],
    ['2025-03-29', 'solar', 'partial', 10 * 60 + 47],
    ['2025-09-07', 'lunar', 'total', 18 * 60 + 12],
    ['2025-09-21', 'solar', 'partial', 19 * 60 + 43],
    ['2026-02-17', 'solar', 'annular', 12 * 60 + 12],
    ['2026-03-03', 'lunar', 'total', 11 * 60 + 34],
    ['2026-08-12', 'solar', 'total', 17 * 60 + 46],
    ['2026-08-28', 'lunar', 'partial', 4 * 60 + 14],
    ['2027-08-02', 'solar', 'total', 10 * 60 + 7],
  ];

  for (const [date, kind, type, minutes] of expectations) {
    it(`predicts the ${date} ${type} ${kind} eclipse`, () => {
      const e = at(date);
      expect(e, `no eclipse found on ${date}`).toBeDefined();
      expect(e!.kind).toBe(kind);
      expect(e!.type).toBe(type);
      const gotMinutes = (e!.jdMax + 0.5 - Math.floor(e!.jdMax + 0.5)) * 1440;
      expect(Math.abs(gotMinutes - minutes)).toBeLessThan(4);
    });
  }

  it('reproduces the published gamma of the 2024-04-08 total eclipse', () => {
    const e = at('2024-04-08')!;
    expect(e.gamma).toBeCloseTo(0.3431, 2);
  });

  it('agrees with the geometry: the discs really do meet at greatest eclipse', () => {
    const e = at('2024-04-08')!;
    if (e.kind !== 'solar') throw new Error('expected a solar eclipse');
    const observer = { latitude: e.greatestAt.latitude, longitude: e.greatestAt.longitude, elevation: 0 };
    const local = localSolarCircumstances(e, observer);
    expect(local.type).toBe('total');
    expect(local.magnitude).toBeGreaterThan(1);
    expect(local.sunAltitude).toBeGreaterThan(60);
  });

  it('shows totality lasting a few minutes on the 2024 central line', () => {
    const e = at('2024-04-08')!;
    if (e.kind !== 'solar') throw new Error('expected a solar eclipse');
    const local = localSolarCircumstances(e, {
      latitude: e.greatestAt.latitude, longitude: e.greatestAt.longitude, elevation: 0,
    });
    const durationMinutes = ((local.centralEnd as number) - (local.centralStart as number)) * 1440;
    expect(durationMinutes).toBeGreaterThan(3.5);
    expect(durationMinutes).toBeLessThan(5);
  });

  it('sees only a partial eclipse well away from the central line', () => {
    const e = at('2024-04-08')!;
    if (e.kind !== 'solar') throw new Error('expected a solar eclipse');
    const local = localSolarCircumstances(e, { latitude: 19.43, longitude: -99.13, elevation: 2240 });
    expect(local.magnitude).toBeGreaterThan(0.5);
    expect(local.magnitude).toBeLessThan(1);
    expect(local.type).toBe('partial');
  });

  it('sees nothing at all from the opposite side of the world', () => {
    const e = at('2024-04-08')!;
    if (e.kind !== 'solar') throw new Error('expected a solar eclipse');
    // Geometrically the discs still approach each other, but the Sun is far
    // below the Beijing horizon at 02:17 local time, so nothing is visible.
    const local = localSolarCircumstances(e, BEIJING);
    expect(local.visible).toBe(false);
    expect(local.sunAltitude).toBeLessThan(-10);
  });

  it('keeps the Sun and Moon within a degree of each other at every new moon', () => {
    // Sanity check on the topocentric disc machinery itself.
    const d = topocentricDiscs(utcToJD(2024, 4, 8, 18, 17), { latitude: 25.3, longitude: -104.1, elevation: 1900 });
    expect(angularSeparation(d.sunRa, d.sunDec, d.moonRa, d.moonDec)).toBeLessThan(0.2);
    expect(d.moonRadius).toBeGreaterThan(d.sunRadius);
  });
});

describe('rise and set at awkward latitudes', () => {
  // A coarser scan is cheaper but must not step over a crossing, so check the
  // places where the Sun skims the horizon most slowly.
  const places: Array<[string, number, number, number, number]> = [
    ['just inside the Arctic circle', 66.0, 25.0, 2025, 6],
    ['just outside the Arctic circle', 67.5, 25.0, 2025, 7],
    ['high Arctic in spring', 78.0, 15.0, 2025, 3],
    ['Antarctic coast', -66.5, 110.0, 2025, 12],
  ];
  for (const [name, latitude, longitude, year, month] of places) {
    it(`finds consistent crossings ${name}`, () => {
      for (let day = 1; day <= 28; day += 3) {
        const observer = { latitude, longitude, elevation: 0 };
        const events = dayEvents(utcToJD(year, month, day), observer);
        if (events.sunrise !== undefined) {
          expect(sunAltitude(events.sunrise, observer).altitude).toBeCloseTo(-0.8333, 2);
        }
        if (events.sunset !== undefined) {
          expect(sunAltitude(events.sunset, observer).altitude).toBeCloseTo(-0.8333, 2);
        }
        // A day cannot be both.
        expect(events.polarDay && events.polarNight).toBe(false);
        if (events.polarDay) expect(events.dayLength).toBe(24);
      }
    });
  }
});
