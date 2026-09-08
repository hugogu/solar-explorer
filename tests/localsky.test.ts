import { describe, expect, it } from 'vitest';
import {
  bodyFrame, elongationFromEarth, heliocentricPosition, localUp, nextApsides,
  nextElongationEvents, solarDayEvents, solarDayLength, sunAltitudeOnBody,
} from '../src/astro/localsky';
import { dayEvents, sunAltitude } from '../src/astro/riseset';
import { jdToDate, jdToTT, utcToJD } from '../src/astro/time';
import { surfaceFrame } from '../src/render/orientation';
import { ROTATION_MODELS } from '../src/astro/rotation';

const BEIJING = { latitude: 39.9042, longitude: 116.4074, elevation: 0 };

describe('body-fixed frames', () => {
  it('agrees with the renderer on the local vertical', () => {
    // Two independent constructions of the same frame: pure arithmetic here,
    // three.js matrices in the render layer.
    const jdtt = jdToTT(utcToJD(2026, 9, 8, 3, 30));
    const frame = bodyFrame('earth', jdtt);
    expect(frame).not.toBeNull();
    const up = localUp(frame!, BEIJING.latitude, BEIJING.longitude);
    const r = ROTATION_MODELS.earth(jdtt);
    const reference = surfaceFrame(r.ra0, r.dec0, r.w, BEIJING.latitude, BEIJING.longitude, 1);
    // Ecliptic (z north) -> scene (y up).
    expect(up[0]).toBeCloseTo(reference.up.x, 9);
    expect(up[2]).toBeCloseTo(reference.up.y, 9);
    expect(-up[1]).toBeCloseTo(reference.up.z, 9);
  });

  it('builds an orthonormal right-handed frame for every planet', () => {
    const jdtt = jdToTT(utcToJD(2026, 3, 1));
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'moon', 'io', 'titan']) {
      const frame = bodyFrame(id, jdtt);
      expect(frame, id).not.toBeNull();
      const [x, y, z] = frame!;
      const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
      expect(len(x), id).toBeCloseTo(1, 9);
      expect(len(y), id).toBeCloseTo(1, 9);
      expect(len(z), id).toBeCloseTo(1, 9);
      expect(x[0] * y[0] + x[1] * y[1] + x[2] * y[2], id).toBeCloseTo(0, 9);
      const cross = [
        x[1] * y[2] - x[2] * y[1],
        x[2] * y[0] - x[0] * y[2],
        x[0] * y[1] - x[1] * y[0],
      ];
      expect(cross[0] * z[0] + cross[1] * z[1] + cross[2] * z[2], id).toBeCloseTo(1, 9);
    }
  });
});

describe('solar day length', () => {
  const cases: Array<[string, number, number]> = [
    ['mercury', 175.94, 0.5],
    ['venus', 116.75, 0.5],
    ['earth', 1.0, 0.001],
    ['mars', 1.0275, 0.005],
    ['jupiter', 0.4136, 0.001],
    ['moon', 29.53, 0.1],
  ];
  for (const [id, expected, tolerance] of cases) {
    it(`is about ${expected} days on ${id}`, () => {
      expect(Math.abs(solarDayLength(id) - expected)).toBeLessThan(tolerance);
    });
  }
});

describe('sunrise on any body', () => {
  it('agrees with the Earth-specific rise/set code', () => {
    // The generic path uses IAU rotation elements, the Earth path uses sidereal
    // time; they should land on the same minute.
    const jd0 = utcToJD(2026, 6, 21) - 8 / 24;
    const reference = dayEvents(jd0, BEIJING);
    const generic = solarDayEvents(
      { bodyId: 'earth', latitude: BEIJING.latitude, longitude: BEIJING.longitude },
      jdToTT(jd0),
    );
    expect(generic).not.toBeNull();
    const minutes = (jdToTT(reference.sunrise as number) - (generic!.sunrise as number)) * 1440;
    expect(Math.abs(minutes)).toBeLessThan(1);
    expect(Math.abs(generic!.daylightHours - reference.dayLength)).toBeLessThan(0.05);
    expect(Math.abs(generic!.maxAltitude - reference.maxSunAltitude)).toBeLessThan(0.2);
  });

  it('gives Mars a day just over 24 hours long', () => {
    const events = solarDayEvents({ bodyId: 'mars', latitude: 18.4, longitude: 77.5 }, jdToTT(utcToJD(2026, 9, 8)));
    expect(events).not.toBeNull();
    expect(events!.solarDayDays * 24).toBeGreaterThan(24.6);
    expect(events!.solarDayDays * 24).toBeLessThan(24.7);
    expect(events!.sunrise).toBeDefined();
    expect(events!.sunset).toBeDefined();
  });

  it('gives the Moon a fortnight of daylight', () => {
    const events = solarDayEvents({ bodyId: 'moon', latitude: 0, longitude: 0 }, jdToTT(utcToJD(2026, 9, 8)));
    expect(events).not.toBeNull();
    expect(events!.daylightHours).toBeGreaterThan(300);
    expect(events!.daylightHours).toBeLessThan(410);
  });

  it('reports polar night at the winter pole', () => {
    const events = solarDayEvents({ bodyId: 'earth', latitude: 89, longitude: 0 }, jdToTT(utcToJD(2026, 12, 21)));
    expect(events!.polarNight).toBe(true);
  });

  it('puts the Sun on the horizon at the computed sunrise', () => {
    const point = { bodyId: 'mars', latitude: -14.6, longitude: 175.5 };
    const events = solarDayEvents(point, jdToTT(utcToJD(2026, 5, 5)));
    const altitude = sunAltitudeOnBody(point, events!.sunrise as number);
    expect(altitude).toBeCloseTo(-0.25, 2);
  });

  it('matches the Earth path hour by hour', () => {
    const start = utcToJD(2026, 10, 2);
    for (let h = 0; h < 24; h += 3) {
      const jd = start + h / 24;
      const generic = sunAltitudeOnBody({ bodyId: 'earth', ...BEIJING }, jdToTT(jd)) as number;
      expect(Math.abs(generic - sunAltitude(jd, BEIJING).altitude)).toBeLessThan(0.03);
    }
  });
});

describe('orbital events', () => {
  it('finds the Earth perihelion in early January', () => {
    const apsides = nextApsides('earth', jdToTT(utcToJD(2026, 9, 1)), 400);
    const perihelion = apsides.find((a) => a.kind === 'perihelion');
    expect(perihelion).toBeDefined();
    const date = jdToDate(perihelion!.jd);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBeLessThan(8);
    expect(perihelion!.distanceAu).toBeGreaterThan(0.983);
    expect(perihelion!.distanceAu).toBeLessThan(0.9835);
  });

  it('finds the Mars opposition of February 2027', () => {
    const events = nextElongationEvents('mars', jdToTT(utcToJD(2026, 9, 1)), 900);
    const opposition = events.find((e) => e.kind === 'opposition');
    expect(opposition).toBeDefined();
    const date = jdToDate(opposition!.jd);
    expect(date.getUTCFullYear()).toBe(2027);
    expect(date.getUTCMonth()).toBe(1);
    expect(opposition!.elongation).toBeGreaterThan(174);
    expect(opposition!.distanceAu).toBeLessThan(0.8);
  });

  it('keeps Venus within its known greatest elongation', () => {
    const events = nextElongationEvents('venus', jdToTT(utcToJD(2026, 1, 1)), 700);
    const greatest = events.filter((e) => e.kind.startsWith('greatestElongation'));
    expect(greatest.length).toBeGreaterThan(0);
    for (const event of greatest) {
      expect(event.elongation).toBeGreaterThan(45);
      expect(event.elongation).toBeLessThan(48);
    }
  });

  it('agrees with the geometry at a known opposition', () => {
    // Jupiter was at opposition on 2026-01-10.
    const value = elongationFromEarth('jupiter', jdToTT(utcToJD(2026, 1, 10)));
    expect(value).not.toBeNull();
    expect(value!.elongation).toBeGreaterThan(175);
  });

  it('predicts Halley returning in July 2061', () => {
    const list = nextApsides('halley', jdToTT(utcToJD(2026, 9, 8)), 40000);
    const perihelion = list.find((a) => a.kind === 'perihelion');
    expect(perihelion).toBeDefined();
    const date = jdToDate(perihelion!.jd);
    expect(date.getUTCFullYear()).toBe(2061);
    expect(date.getUTCMonth()).toBe(6);
    expect(perihelion!.distanceAu).toBeCloseTo(0.587, 2);
  });

  it('resolves positions for every catalogued body', () => {
    const jdtt = jdToTT(utcToJD(2026, 9, 8));
    for (const id of ['sun', 'earth', 'moon', 'io', 'titan', 'triton', 'charon', 'ceres', 'halley', 'sedna']) {
      expect(heliocentricPosition(id, jdtt), id).not.toBeNull();
    }
  });
});
