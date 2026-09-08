import { describe, expect, it } from 'vitest';
import { equatorialToGalactic } from '../src/astro/coords';

describe('galactic coordinates', () => {
  it('puts Sagittarius A* at the origin of the frame', () => {
    const g = equatorialToGalactic(266.41684, -29.00781);
    expect(Math.min(g.l, 360 - g.l)).toBeLessThan(0.2);
    expect(Math.abs(g.b)).toBeLessThan(0.2);
  });

  it('puts the north galactic pole at ninety degrees', () => {
    expect(equatorialToGalactic(192.85948, 27.12825).b).toBeCloseTo(90, 4);
  });

  it('places the galactic anticentre opposite the centre', () => {
    const g = equatorialToGalactic(86.405, 28.936);
    expect(Math.abs(g.l - 180)).toBeLessThan(0.3);
    expect(Math.abs(g.b)).toBeLessThan(0.3);
  });

  it('agrees with catalogued positions', () => {
    // Andromeda, well off the plane; Deneb, deep in the Cygnus star cloud.
    const m31 = equatorialToGalactic(10.6847, 41.2687);
    expect(m31.l).toBeCloseTo(121.17, 0);
    expect(m31.b).toBeCloseTo(-21.57, 0);

    const deneb = equatorialToGalactic(310.358, 45.28);
    expect(deneb.l).toBeCloseTo(84.3, 0);
    expect(deneb.b).toBeCloseTo(2.0, 0);
  });

  it('keeps latitude inside range everywhere', () => {
    for (let ra = 0; ra < 360; ra += 17) {
      for (let dec = -85; dec <= 85; dec += 13) {
        const g = equatorialToGalactic(ra, dec);
        expect(g.b).toBeGreaterThanOrEqual(-90);
        expect(g.b).toBeLessThanOrEqual(90);
        expect(g.l).toBeGreaterThanOrEqual(0);
        expect(g.l).toBeLessThan(360);
      }
    }
  });
});
