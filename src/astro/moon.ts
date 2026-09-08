/**
 * Lunar position from the truncated ELP-2000/82 series in Meeus ch. 47.
 * Accuracy: about 10" in longitude, 4" in latitude and 20 km in distance -
 * enough for eclipse contact times and moonrise to well under a minute.
 */
import { RAD, cos, norm360, sin } from './math';
import { Equatorial, eclipticToEquatorial, trueObliquity } from './coords';
import { Vec3 } from './kepler';
import { centuries } from './time';

/** D, M, M', F, coefficient for longitude (1e-6 deg), coefficient for distance (1e-3 km). */
const TERMS_LR: Array<[number, number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

/** D, M, M', F, coefficient for latitude (1e-6 deg). */
const TERMS_B: Array<[number, number, number, number, number]> = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366], [2, 1, 0, 1, -351], [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166], [1, 0, 1, -1, -164], [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107],
];

export interface MoonPosition {
  /** apparent geocentric ecliptic longitude, degrees */
  lon: number;
  /** ecliptic latitude, degrees */
  lat: number;
  /** distance from the Earth's centre, km */
  distKm: number;
  /** equatorial horizontal parallax, degrees */
  parallax: number;
  /** apparent angular radius, degrees */
  angularRadius: number;
  /** mean elongation from the Sun, degrees */
  elongation: number;
}

export function moonPosition(jdtt: number): MoonPosition {
  const t = centuries(jdtt);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;

  const Lp = norm360(218.3164477 + 481267.88123421 * t - 0.0015786 * t2 + t3 / 538841 - t4 / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * t - 0.0018819 * t2 + t3 / 545868 - t4 / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * t - 0.0001536 * t2 + t3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * t + 0.0087414 * t2 + t3 / 69699 - t4 / 14712000);
  const F = norm360(93.272095 + 483202.0175233 * t - 0.0036539 * t2 - t3 / 3526000 + t4 / 863310000);

  const A1 = norm360(119.75 + 131.849 * t);
  const A2 = norm360(53.09 + 479264.29 * t);
  const A3 = norm360(313.45 + 481266.484 * t);
  const E = 1 - 0.002516 * t - 0.0000074 * t2;

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, cl, cr] of TERMS_LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumL += cl * ecc * sin(arg);
    sumR += cr * ecc * cos(arg);
  }
  let sumB = 0;
  for (const [d, m, mp, f, cb] of TERMS_B) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumB += cb * ecc * sin(arg);
  }

  sumL += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sumB +=
    -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) +
    127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);

  const lon = norm360(Lp + sumL / 1000000);
  const lat = sumB / 1000000;
  const distKm = 385000.56 + sumR / 1000;
  const parallax = Math.asin(6378.14 / distKm) * RAD;
  return {
    lon,
    lat,
    distKm,
    parallax,
    angularRadius: Math.asin(1737.4 / distKm) * RAD,
    elongation: norm360(D),
  };
}

/** Apparent geocentric equatorial coordinates of the Moon (distance in AU). */
export function moonEquatorial(jdtt: number): Equatorial {
  const m = moonPosition(jdtt);
  const eps = trueObliquity(jdtt);
  const eq = eclipticToEquatorial(m.lon, m.lat, eps, m.distKm / 149597870.7);
  return eq;
}

/** Geocentric ecliptic rectangular vector of the Moon, in AU. */
export function moonGeocentricVector(jdtt: number): Vec3 {
  const m = moonPosition(jdtt);
  const r = m.distKm / 149597870.7;
  return [r * cos(m.lat) * cos(m.lon), r * cos(m.lat) * sin(m.lon), r * sin(m.lat)];
}

export interface MoonPhase {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter */
  phase: number;
  /** illuminated fraction of the disc, 0..1 */
  illumination: number;
  /** phase angle Sun-Moon-Earth, degrees */
  phaseAngle: number;
  /** age in days since the last new moon */
  ageDays: number;
}

export function moonPhase(jdtt: number, sunLon: number, sunDistAu: number): MoonPhase {
  const m = moonPosition(jdtt);
  const elong = norm360(m.lon - sunLon);
  const distAu = m.distKm / 149597870.7;
  // Phase angle of the Moon (Meeus 48.3).
  const i =
    Math.atan2(sunDistAu * sin(elong), distAu - sunDistAu * cos(elong)) * RAD;
  const illumination = (1 + cos(i)) / 2;
  return {
    phase: elong / 360,
    illumination,
    phaseAngle: norm360(i),
    ageDays: (elong / 360) * 29.530588861,
  };
}
