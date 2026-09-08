/**
 * Planetary positions from JPL's "Approximate Positions of the Major Planets"
 * (Standish) Keplerian elements with linear rates. Valid 1800-2050 with errors
 * of roughly an arcminute for the inner planets and a few arcminutes for the
 * outer ones - far below anything visible in this simulation.
 */
import { DEG, RAD, norm180, norm360 } from './math';
import { OrbitalElements, Vec3, perifocalToEcliptic, solveKeplerElliptic } from './kepler';
import { J2000 } from './time';

export type PlanetId =
  | 'mercury' | 'venus' | 'earth' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

interface ElementSet {
  /** a, e, I, L, longPeri, node at J2000 */
  base: [number, number, number, number, number, number];
  /** rates per Julian century */
  rate: [number, number, number, number, number, number];
}

/** a (AU), e, I (deg), L (deg), longitude of perihelion (deg), longitude of node (deg). */
const ELEMENTS: Record<PlanetId, ElementSet> = {
  mercury: {
    base: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    base: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  // Earth-Moon barycentre; converted to Earth's centre in earthHelio().
  earth: {
    base: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    base: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    base: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    base: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    base: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    base: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
  pluto: {
    base: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  },
};

export const PLANET_IDS = Object.keys(ELEMENTS) as PlanetId[];

/** Osculating elements of a planet at the given time (TT). */
export function planetElements(id: PlanetId, jdtt: number): OrbitalElements & { L: number } {
  const t = (jdtt - J2000) / 36525;
  const { base, rate } = ELEMENTS[id];
  const a = base[0] + rate[0] * t;
  const e = base[1] + rate[1] * t;
  const i = base[2] + rate[2] * t;
  const L = base[3] + rate[3] * t;
  const longPeri = base[4] + rate[4] * t;
  const node = base[5] + rate[5] * t;
  return {
    a,
    e,
    i,
    node: norm360(node),
    peri: norm360(longPeri - node),
    M0: norm180(L - longPeri),
    epoch: jdtt,
    L: norm360(L),
  };
}

/** Heliocentric ecliptic J2000 rectangular position in AU. */
export function planetHelio(id: PlanetId, jdtt: number): Vec3 {
  const el = planetElements(id, jdtt);
  const E = solveKeplerElliptic((el.M0 as number) * DEG, el.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = el.a * (1 - el.e * Math.cos(E));
  return perifocalToEcliptic(r, nu, el);
}

/** Ratio of the Moon's mass to the Earth+Moon mass, used to shift the barycentre. */
const MOON_MASS_FRACTION = 1 / (1 + 81.30056);
const AU_KM = 149597870.7;

/**
 * Earth's centre, correcting the Earth-Moon barycentre with the Moon's
 * geocentric vector (about 4670 km, i.e. 3e-5 AU).
 */
export function earthHelio(jdtt: number, moonGeocentricAu?: Vec3): Vec3 {
  const bary = planetHelio('earth', jdtt);
  if (!moonGeocentricAu) return bary;
  return [
    bary[0] - moonGeocentricAu[0] * MOON_MASS_FRACTION,
    bary[1] - moonGeocentricAu[1] * MOON_MASS_FRACTION,
    bary[2] - moonGeocentricAu[2] * MOON_MASS_FRACTION,
  ];
}

export function vecLength(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecScale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Ecliptic longitude/latitude (deg) and distance of a rectangular vector. */
export function vecToSpherical(v: Vec3): { lon: number; lat: number; dist: number } {
  const dist = vecLength(v);
  return {
    lon: norm360(Math.atan2(v[1], v[0]) * RAD),
    lat: Math.asin(v[2] / dist) * RAD,
    dist,
  };
}

/** Light travel time in days for a distance in AU. */
export function lightTimeDays(distAu: number): number {
  return distAu * 0.0057755183;
}

/**
 * Geocentric ecliptic position of a planet, corrected for light time.
 * Returns the vector from the Earth's centre in AU.
 */
export function planetGeocentric(id: PlanetId, jdtt: number, earthPos: Vec3): Vec3 {
  let pos = planetHelio(id, jdtt);
  for (let i = 0; i < 2; i++) {
    const delta = vecSub(pos, earthPos);
    pos = planetHelio(id, jdtt - lightTimeDays(vecLength(delta)));
  }
  return vecSub(pos, earthPos);
}

export { AU_KM };
