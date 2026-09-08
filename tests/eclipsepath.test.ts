import { describe, expect, it } from 'vitest';
import { findEclipses, SolarEclipse } from '../src/astro/eclipse';
import {
  axisDistance, geometryAt, groundPoint, groundView, penumbraOutline, shadowPositionAt,
  solarEclipsePath,
} from '../src/astro/eclipsepath';
import { jdToDate, utcToJD } from '../src/astro/time';

function solarEclipseOn(prefix: string): SolarEclipse {
  const found = findEclipses(utcToJD(2023, 10, 1), { limit: 24, lunar: false })
    .find((e) => jdToDate(e.jdMax).toISOString().startsWith(prefix));
  if (!found || found.kind !== 'solar') throw new Error(`no solar eclipse on ${prefix}`);
  return found;
}

describe('solar eclipse tracks', () => {
  // Published greatest width and central duration, from the eclipse canon.
  const cases: Array<[string, number, number, number, number]> = [
    // date, width km, duration s, greatest latitude, greatest longitude
    ['2024-04-08', 197, 268, 25.3, -104.1],
    ['2027-08-02', 258, 383, 25.5, 33.2],
  ];

  for (const [date, width, duration, latitude, longitude] of cases) {
    it(`reproduces the ${date} track`, () => {
      const path = solarEclipsePath(solarEclipseOn(date), 4);
      expect(path.centralStart).toBeDefined();
      expect(path.samples.length).toBeGreaterThan(20);

      // Duration is measured directly at each point rather than inferred from
      // width over speed, and lands within a couple of per cent of the canon.
      expect(Math.abs(path.maxDurationSeconds / duration - 1)).toBeLessThan(0.05);
      expect(Math.abs(path.maxWidthKm / width - 1)).toBeLessThan(0.12);

      // The track passes over the published point of greatest eclipse at the
      // published moment. (The width plateaus for half an hour either side, so
      // the widest sample is not a reliable way to find that moment.)
      const eclipse = solarEclipseOn(date);
      const nearest = path.samples.reduce((a, b) =>
        (Math.abs(b.jd - eclipse.jdMax) < Math.abs(a.jd - eclipse.jdMax) ? b : a));
      expect(Math.abs(nearest.latitude - latitude)).toBeLessThan(2);
      expect(Math.abs(nearest.longitude - longitude)).toBeLessThan(2);
      expect(nearest.sunAltitude).toBeGreaterThan(60);
    });
  }

  it('gets the duration right for a grazing eclipse too', () => {
    // 2026-08-12 has gamma near 0.9; the umbra hits at a shallow angle, so
    // width over speed would badly overestimate how long totality lasts.
    const path = solarEclipsePath(solarEclipseOn('2026-08-12'), 4);
    expect(Math.abs(path.maxDurationSeconds / 138 - 1)).toBeLessThan(0.08);
  });

  it('runs the central track right to both ends', () => {
    // The contacts either side of greatest eclipse are searched in opposite
    // directions; getting the bracket order wrong silently truncated the
    // second half of every track.
    for (const date of ['2024-04-08', '2027-08-02', '2030-11-25']) {
      const eclipse = solarEclipseOn(date);
      const path = solarEclipsePath(eclipse, 6);
      const before = (eclipse.jdMax - (path.centralStart as number)) * 1440;
      const after = ((path.centralEnd as number) - eclipse.jdMax) * 1440;
      expect(before, date).toBeGreaterThan(60);
      expect(after, date).toBeGreaterThan(60);
      // A central track is very nearly symmetric about greatest eclipse.
      expect(Math.abs(after / before - 1), date).toBeLessThan(0.15);

      // Both ends are exactly where the axis grazes the limb.
      for (const jd of [path.centralStart as number, path.centralEnd as number]) {
        expect(axisDistance(geometryAt(jd)), date).toBeCloseTo(0.9972, 3);
      }
    }
  });

  it('carries the 2030 track all the way to Australia', () => {
    // It starts in the South Atlantic, crosses southern Africa and makes
    // landfall again in Queensland; the truncated version stopped mid-ocean.
    const path = solarEclipsePath(solarEclipseOn('2030-11-25'), 4);
    const first = path.samples[0];
    const last = path.samples[path.samples.length - 1];
    expect(first.longitude).toBeLessThan(20);
    expect(last.longitude).toBeGreaterThan(140);
    expect(last.latitude).toBeLessThan(-20);
  });

  it('leaves the umbra marker on the track at the last moment of the track', () => {
    const path = solarEclipsePath(solarEclipseOn('2027-08-02'), 4);
    const last = path.samples[path.samples.length - 1];
    const marker = shadowPositionAt(path.centralEnd as number);
    expect(Math.abs(marker.latitude - last.latitude)).toBeLessThan(3);
    expect(Math.abs(marker.longitude - last.longitude)).toBeLessThan(3);
  });

  it('orders the contact times', () => {
    const path = solarEclipsePath(solarEclipseOn('2024-04-08'), 6);
    expect(path.penumbraStart).toBeLessThan(path.centralStart as number);
    expect(path.centralStart as number).toBeLessThan(path.centralEnd as number);
    expect(path.centralEnd as number).toBeLessThan(path.penumbraEnd);
    // The whole event runs a few hours.
    expect((path.penumbraEnd - path.penumbraStart) * 24).toBeGreaterThan(3);
    expect((path.penumbraEnd - path.penumbraStart) * 24).toBeLessThan(6);
  });

  it('tracks eastwards across the globe', () => {
    // The shadow always sweeps west to east relative to the ground.
    const path = solarEclipsePath(solarEclipseOn('2027-08-02'), 6);
    const central = path.samples.filter((s) => s.central);
    for (let i = 1; i < central.length; i++) {
      const step = ((central[i].longitude - central[i - 1].longitude + 540) % 360) - 180;
      expect(step, `sample ${i}`).toBeGreaterThan(0);
    }
  });

  it('has no central track when the axis misses the Earth', () => {
    // 2025-03-29 is partial everywhere: the shadow axis passes north of Earth.
    const path = solarEclipsePath(solarEclipseOn('2025-03-29'), 8);
    expect(path.centralStart).toBeUndefined();
    expect(path.samples.every((s) => !s.central)).toBe(true);
  });

  it('puts the live shadow position on the published greatest-eclipse point', () => {
    const eclipse = solarEclipseOn('2027-08-02');
    const now = shadowPositionAt(eclipse.jdMax);
    expect(now).not.toBeNull();
    expect(now!.onEarth).toBe(true);
    expect(Math.abs(now!.latitude - 25.5)).toBeLessThan(1.5);
    expect(Math.abs(now!.longitude - 33.2)).toBeLessThan(1.5);
    expect(now!.coverage).toBeGreaterThan(0.999);
  });

  it('draws a penumbra outline that everyone inside can see the eclipse from', () => {
    const eclipse = solarEclipseOn('2024-04-08');
    const outline = penumbraOutline(eclipse.jdMax, 48);
    expect(outline.length).toBeGreaterThan(30);
    const g = geometryAt(eclipse.jdMax);
    for (const point of outline) {
      // On the edge the Sun is only just touched.
      const view = groundView(g, groundPoint(point.latitude, point.longitude, eclipse.jdMax));
      expect(view.coverage).toBeLessThan(0.02);
    }
    // ... while the centre of the region is fully eclipsed.
    const centre = groundView(g, groundPoint(25.3, -104.1, eclipse.jdMax));
    expect(centre.coverage).toBeGreaterThan(0.999);
  });
});
