/**
 * Rotational elements from the IAU Working Group on Cartographic Coordinates
 * and Rotational Elements. The north pole is given as a fixed direction
 * (alpha0, delta0) in the ICRF equatorial frame and the prime meridian angle W
 * grows linearly with time.
 */
import { RAD, cos, norm360, sin } from './math';
import { J2000, gmst, ttToJD } from './time';
import { nutation, precessToJ2000, trueObliquity } from './coords';

export interface RotationState {
  /** north pole right ascension, degrees (equatorial J2000) */
  ra0: number;
  /** north pole declination, degrees */
  dec0: number;
  /** prime meridian angle measured from the ascending node, degrees */
  w: number;
}

export type RotationModel = (jdtt: number) => RotationState;

function days(jdtt: number): number {
  return jdtt - J2000;
}

function cent(jdtt: number): number {
  return (jdtt - J2000) / 36525;
}

export const ROTATION_MODELS: Record<string, RotationModel> = {
  sun: (jd) => ({ ra0: 286.13, dec0: 63.87, w: norm360(84.176 + 14.1844 * days(jd)) }),

  mercury: (jd) => {
    const d = days(jd);
    const T = cent(jd);
    const M1 = 174.791086 + 4.092335 * d;
    const M2 = 349.582171 + 8.18467 * d;
    const M3 = 164.373257 + 12.277005 * d;
    const M4 = 339.164343 + 16.36939 * d;
    const M5 = 153.955429 + 20.461675 * d;
    return {
      ra0: 281.0103 - 0.0328 * T,
      dec0: 61.4155 - 0.0049 * T,
      w: norm360(
        329.5988 + 6.1385108 * d +
          0.01067257 * sin(M1) - 0.00112309 * sin(M2) - 0.0001104 * sin(M3) -
          0.00002539 * sin(M4) - 0.00000571 * sin(M5),
      ),
    };
  },

  venus: (jd) => ({ ra0: 272.76, dec0: 67.16, w: norm360(160.2 - 1.4813688 * days(jd)) }),

  // The published IAU expression for the Earth is a linear approximation of
  // precession and drifts by a few tenths of a degree over decades. The scene
  // has to agree with the rise/set computations to the second, so the Earth's
  // orientation is derived from apparent sidereal time and precession instead.
  earth: (jd) => earthRotationExact(jd),

  moon: (jd) => {
    const d = days(jd);
    const T = cent(jd);
    const E1 = 125.045 - 0.0529921 * d;
    const E2 = 250.089 - 0.1059842 * d;
    const E3 = 260.008 + 13.0120009 * d;
    const E4 = 176.625 + 13.3407154 * d;
    const E5 = 357.529 + 0.9856003 * d;
    const E6 = 311.589 + 26.4057084 * d;
    const E7 = 134.963 + 13.064993 * d;
    const E8 = 276.617 + 0.3287146 * d;
    const E9 = 34.226 + 1.7484877 * d;
    const E10 = 15.134 - 0.1589763 * d;
    const E11 = 119.743 + 0.0036096 * d;
    const E12 = 239.961 + 0.1643573 * d;
    const E13 = 25.053 + 12.9590088 * d;
    return {
      ra0:
        269.9949 + 0.0031 * T - 3.8787 * sin(E1) - 0.1204 * sin(E2) + 0.07 * sin(E3) -
        0.0172 * sin(E4) + 0.0072 * sin(E6) - 0.0052 * sin(E10) + 0.0043 * sin(E13),
      dec0:
        66.5392 + 0.013 * T + 1.5419 * cos(E1) + 0.0239 * cos(E2) - 0.0278 * cos(E3) +
        0.0068 * cos(E4) - 0.0029 * cos(E6) + 0.0009 * cos(E7) + 0.0008 * cos(E10) -
        0.0009 * cos(E13),
      w: norm360(
        38.3213 + 13.17635815 * d - 1.4e-12 * d * d +
          3.561 * sin(E1) + 0.1208 * sin(E2) - 0.0642 * sin(E3) + 0.0158 * sin(E4) +
          0.0252 * sin(E5) - 0.0066 * sin(E6) - 0.0047 * sin(E7) - 0.0046 * sin(E8) +
          0.0028 * sin(E9) + 0.0052 * sin(E10) + 0.004 * sin(E11) + 0.0019 * sin(E12) -
          0.0044 * sin(E13),
      ),
    };
  },

  mars: (jd) => ({
    ra0: 317.269202 - 0.10927547 * cent(jd),
    dec0: 54.432516 - 0.05827105 * cent(jd),
    w: norm360(176.049863 + 350.891982443297 * days(jd)),
  }),

  jupiter: (jd) => ({
    ra0: 268.056595 - 0.006499 * cent(jd),
    dec0: 64.495303 + 0.002413 * cent(jd),
    // System III (magnetic field) rotation.
    w: norm360(284.95 + 870.536 * days(jd)),
  }),

  saturn: (jd) => ({
    ra0: 40.589 - 0.036 * cent(jd),
    dec0: 83.537 - 0.004 * cent(jd),
    w: norm360(38.9 + 810.7939024 * days(jd)),
  }),

  uranus: (jd) => ({ ra0: 257.311, dec0: -15.175, w: norm360(203.81 - 501.1600928 * days(jd)) }),

  neptune: (jd) => {
    const N = 357.85 + 52.316 * cent(jd);
    return {
      ra0: 299.36 + 0.7 * sin(N),
      dec0: 43.46 - 0.51 * cos(N),
      w: norm360(253.18 + 536.3128492 * days(jd) - 0.48 * sin(N)),
    };
  },

  pluto: (jd) => ({ ra0: 132.993, dec0: -6.163, w: norm360(302.695 + 56.3625225 * days(jd)) }),
};

/**
 * Exact Earth orientation, expressed in the same (ra0, dec0, W) form as the IAU
 * models so that callers need not special-case it.
 *
 * The chain is: Earth-fixed -> equator of date (rotate by apparent sidereal
 * time) -> ecliptic of date -> ecliptic J2000 -> equatorial J2000.
 */
export function earthRotationExact(jdtt: number): RotationState {
  const jdut = ttToJD(jdtt);
  const eps = trueObliquity(jdtt);
  const gast = gmst(jdut) + nutation(jdtt).dpsi * cos(eps);

  const toJ2000Equatorial = (raOfDate: number, decOfDate: number): [number, number, number] => {
    // Equator of date -> ecliptic of date.
    const x = cos(decOfDate) * cos(raOfDate);
    const y = cos(decOfDate) * sin(raOfDate);
    const z = sin(decOfDate);
    const ey = y * cos(eps) + z * sin(eps);
    const ez = -y * sin(eps) + z * cos(eps);
    const lon = (Math.atan2(ey, x) * RAD + 360) % 360;
    const lat = Math.asin(Math.max(-1, Math.min(1, ez))) * RAD;
    // Precess into the J2000 ecliptic, then back to the equator.
    const p = precessToJ2000(lon, lat, jdtt);
    const px = cos(p.lat) * cos(p.lon);
    const py = cos(p.lat) * sin(p.lon);
    const pz = sin(p.lat);
    const c = cos(OBLIQUITY_J2000);
    const sN = sin(OBLIQUITY_J2000);
    return [px, py * c - pz * sN, py * sN + pz * c];
  };

  const pole = toJ2000Equatorial(0, 90);
  const prime = toJ2000Equatorial(gast, 0);
  const ra0 = norm360(Math.atan2(pole[1], pole[0]) * RAD);
  const dec0 = Math.asin(Math.max(-1, Math.min(1, pole[2]))) * RAD;

  // Ascending node of the Earth's equator on the ICRF equator: z x pole.
  const nodeLen = Math.hypot(-pole[1], pole[0]) || 1;
  const node: [number, number, number] = [-pole[1] / nodeLen, pole[0] / nodeLen, 0];
  const cross: [number, number, number] = [
    node[1] * prime[2] - node[2] * prime[1],
    node[2] * prime[0] - node[0] * prime[2],
    node[0] * prime[1] - node[1] * prime[0],
  ];
  const sinW = cross[0] * pole[0] + cross[1] * pole[1] + cross[2] * pole[2];
  const cosW = node[0] * prime[0] + node[1] * prime[1] + node[2] * prime[2];
  return { ra0, dec0, w: norm360(Math.atan2(sinW, cosW) * RAD) };
}

/** Obliquity of the ecliptic at J2000, used to move poles into the scene frame. */
export const OBLIQUITY_J2000 = 23.4392911;

/**
 * Unit vector of a body's north pole in ecliptic J2000 coordinates.
 * The IAU frame is equatorial, the simulation works in the ecliptic.
 */
export function poleVectorEcliptic(ra0: number, dec0: number): [number, number, number] {
  const x = cos(dec0) * cos(ra0);
  const y = cos(dec0) * sin(ra0);
  const z = sin(dec0);
  const c = cos(OBLIQUITY_J2000);
  const s = sin(OBLIQUITY_J2000);
  return [x, y * c + z * s, -y * s + z * c];
}

/** Inverse of poleVectorEcliptic: an ecliptic pole direction as IAU ra0/dec0. */
export function poleEclipticToEquatorial(pole: [number, number, number]): { ra0: number; dec0: number } {
  const c = cos(OBLIQUITY_J2000);
  const s = sin(OBLIQUITY_J2000);
  const x = pole[0];
  const y = pole[1] * c - pole[2] * s;
  const z = pole[1] * s + pole[2] * c;
  const r = Math.hypot(x, y, z) || 1;
  return {
    ra0: norm360((Math.atan2(y, x) * 180) / Math.PI),
    dec0: (Math.asin(Math.max(-1, Math.min(1, z / r))) * 180) / Math.PI,
  };
}

/** Axial tilt relative to the body's own orbital plane, degrees. */
export function obliquityToOrbit(pole: [number, number, number], orbitNormal: [number, number, number]): number {
  const dot = pole[0] * orbitNormal[0] + pole[1] * orbitNormal[1] + pole[2] * orbitNormal[2];
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}
