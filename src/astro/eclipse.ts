/**
 * Solar and lunar eclipse prediction (Meeus ch. 54) plus local circumstances.
 *
 * Global circumstances - time of greatest eclipse, gamma, magnitude, type - come
 * from the periodic series around new/full moon. Local circumstances for a solar
 * eclipse are then derived geometrically from the topocentric separation of the
 * two discs, which needs no Besselian elements and stays honest about what the
 * observer actually sees.
 */
import { Observer, eclipticToEquatorial, trueObliquity } from './coords';
import { DEG, RAD, angularSeparation, clamp, cos, minimize, norm360, sin } from './math';
import { Vec3 } from './kepler';
import { moonPosition } from './moon';
import { sunPosition } from './sun';
import { J2000, jdToTT, lmst, ttToJD } from './time';

export const EARTH_RADIUS_AU = 6378.14 / 149597870.7;
export const EARTH_RADIUS_KM = 6378.14;

export type SolarEclipseType = 'total' | 'annular' | 'hybrid' | 'partial';
export type LunarEclipseType = 'total' | 'partial' | 'penumbral';

export interface SolarEclipse {
  kind: 'solar';
  type: SolarEclipseType;
  /** JD (UT) of greatest eclipse */
  jdMax: number;
  /** least distance of the shadow axis from Earth's centre, in Earth radii */
  gamma: number;
  /** radius of the umbral cone at the fundamental plane, in Earth radii */
  u: number;
  /** greatest magnitude anywhere on Earth */
  magnitude: number;
  /** true when the shadow axis misses the Earth entirely (partial only) */
  central: boolean;
  /** geographic point of greatest eclipse (sub-lunar point), degrees */
  greatestAt: { latitude: number; longitude: number; central: boolean };
}

export interface LunarEclipse {
  kind: 'lunar';
  type: LunarEclipseType;
  jdMax: number;
  gamma: number;
  u: number;
  /** magnitude in the umbra (negative for a purely penumbral eclipse) */
  umbralMagnitude: number;
  penumbralMagnitude: number;
  /** half-durations in minutes */
  semiDurationTotal?: number;
  semiDurationPartial?: number;
  semiDurationPenumbral: number;
}

export type Eclipse = SolarEclipse | LunarEclipse;

interface LunationArgs {
  jde: number;
  E: number;
  M: number;
  Mp: number;
  F: number;
  F1: number;
  omega: number;
  A1: number;
  gamma: number;
  u: number;
}

/** Evaluate the eclipse series for lunation k (integer = new moon, +0.5 = full). */
function lunation(k: number): LunationArgs {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  let jde =
    2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = norm360(2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3);
  const Mp = norm360(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4);
  const F = norm360(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4);
  const omega = norm360(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);

  const F1 = F - 0.02665 * sin(omega);
  const A1 = norm360(299.77 + 0.107408 * k - 0.009173 * T2);

  jde +=
    -0.4075 * sin(Mp) +
    0.1721 * E * sin(M) +
    0.0161 * sin(2 * Mp) +
    -0.0097 * sin(2 * F1) +
    0.0073 * E * sin(Mp - M) +
    -0.005 * E * sin(Mp + M) +
    -0.0023 * sin(Mp - 2 * F1) +
    0.0021 * E * sin(2 * M) +
    0.0012 * sin(Mp + 2 * F1) +
    0.0006 * E * sin(2 * Mp + M) +
    -0.0004 * sin(3 * Mp) +
    -0.0003 * E * sin(M + 2 * F1) +
    0.0003 * sin(A1) +
    -0.0002 * E * sin(M - 2 * F1) +
    -0.0002 * E * sin(2 * Mp - M) +
    -0.0002 * sin(omega);

  const P =
    0.207 * E * sin(M) +
    0.0024 * E * sin(2 * M) +
    -0.0392 * sin(Mp) +
    0.0116 * sin(2 * Mp) +
    -0.0073 * E * sin(Mp + M) +
    0.0067 * E * sin(Mp - M) +
    0.0118 * sin(2 * F1);
  const Q =
    5.2207 +
    -0.0048 * E * cos(M) +
    0.002 * E * cos(2 * M) +
    -0.3299 * cos(Mp) +
    -0.006 * E * cos(Mp + M) +
    0.0041 * E * cos(Mp - M);
  const W = Math.abs(cos(F1));
  const gamma = (P * cos(F1) + Q * sin(F1)) * (1 - 0.0048 * W);
  const u =
    0.0059 +
    0.0046 * E * cos(M) +
    -0.0182 * cos(Mp) +
    0.0004 * cos(2 * Mp) +
    -0.0005 * cos(M + Mp);

  return { jde, E, M, Mp, F, F1, omega, A1, gamma, u };
}

/**
 * Point of greatest eclipse: where the shadow axis (the Sun-Moon centre line
 * continued past the Moon) meets the Earth. When the axis misses the Earth the
 * closest point of the surface is returned instead, which is what a partial
 * eclipse's "greatest" point means.
 */
export function shadowAxisPoint(jd: number): { latitude: number; longitude: number; central: boolean } {
  const jdtt = jdToTT(jd);
  const eps = trueObliquity(jdtt);
  const s = sunPosition(jdtt);
  const m = moonPosition(jdtt);
  const sunEq = eclipticToEquatorial(s.lon, s.lat, eps, s.dist);
  const moonEq = eclipticToEquatorial(m.lon, m.lat, eps, m.distKm / 149597870.7);

  const toVec = (ra: number, dec: number, dist: number): Vec3 => [
    dist * cos(dec) * cos(ra),
    dist * cos(dec) * sin(ra),
    dist * sin(dec),
  ];
  const S = toVec(sunEq.ra, sunEq.dec, sunEq.dist);
  const M = toVec(moonEq.ra, moonEq.dec, moonEq.dist);
  const dir: Vec3 = [M[0] - S[0], M[1] - S[1], M[2] - S[2]];
  const dlen = Math.hypot(dir[0], dir[1], dir[2]);
  const u: Vec3 = [dir[0] / dlen, dir[1] / dlen, dir[2] / dlen];

  const b = M[0] * u[0] + M[1] * u[1] + M[2] * u[2];
  const c = M[0] * M[0] + M[1] * M[1] + M[2] * M[2] - EARTH_RADIUS_AU * EARTH_RADIUS_AU;
  const disc = b * b - c;

  let point: Vec3;
  let central: boolean;
  if (disc >= 0) {
    // Near-side intersection: the smaller positive root along the axis.
    const t = -b - Math.sqrt(disc);
    point = [M[0] + t * u[0], M[1] + t * u[1], M[2] + t * u[2]];
    central = true;
  } else {
    // Foot of the perpendicular from the Earth's centre, projected to the surface.
    const foot: Vec3 = [M[0] - b * u[0], M[1] - b * u[1], M[2] - b * u[2]];
    const flen = Math.hypot(foot[0], foot[1], foot[2]);
    point = [
      (foot[0] / flen) * EARTH_RADIUS_AU,
      (foot[1] / flen) * EARTH_RADIUS_AU,
      (foot[2] / flen) * EARTH_RADIUS_AU,
    ];
    central = false;
  }

  const r = Math.hypot(point[0], point[1], point[2]);
  const geocentricLat = Math.asin(clamp(point[2] / r, -1, 1)) * RAD;
  // Geocentric -> geodetic latitude on the reference ellipsoid.
  const latitude = Math.atan(Math.tan(geocentricLat * DEG) / (0.99664719 * 0.99664719)) * RAD;
  const ra = norm360(Math.atan2(point[1], point[0]) * RAD);
  let lon = ra - lmst(jd, 0);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { latitude, longitude: lon, central };
}

function solarEclipseFromLunation(k: number): SolarEclipse | null {
  const a = lunation(k);
  if (Math.abs(sin(a.F)) > 0.36) return null;
  const absG = Math.abs(a.gamma);
  if (absG > 1.5433 + a.u) return null;

  const jdMax = ttToJD(a.jde);
  const central = absG < 0.9972;
  let type: SolarEclipseType;
  let magnitude: number;
  if (!central) {
    type = 'partial';
    magnitude = (1.5433 + a.u - absG) / (0.5461 + 2 * a.u);
  } else if (a.u < 0) {
    type = 'total';
    magnitude = 1;
  } else if (a.u > 0.0047) {
    type = 'annular';
    magnitude = 1;
  } else {
    const omega = 0.00464 * Math.sqrt(1 - a.gamma * a.gamma);
    type = a.u < omega ? 'hybrid' : 'annular';
    magnitude = 1;
  }
  return {
    kind: 'solar',
    type,
    jdMax,
    gamma: a.gamma,
    u: a.u,
    magnitude,
    central,
    greatestAt: shadowAxisPoint(jdMax),
  };
}

function lunarEclipseFromLunation(k: number): LunarEclipse | null {
  const a = lunation(k + 0.5);
  if (Math.abs(sin(a.F)) > 0.36) return null;
  const absG = Math.abs(a.gamma);
  const penumbralMagnitude = (1.5573 + a.u - absG) / 0.545;
  if (penumbralMagnitude <= 0) return null;
  const umbralMagnitude = (1.0128 - a.u - absG) / 0.545;

  const p = 1.0128 - a.u;
  const tt = 0.4678 - a.u;
  const n = 0.5458 + 0.04 * cos(a.Mp);
  const h = 1.5573 + a.u;

  const semiDurationPenumbral = (60 / n) * Math.sqrt(Math.max(0, h * h - a.gamma * a.gamma));
  const partialArg = p * p - a.gamma * a.gamma;
  const totalArg = tt * tt - a.gamma * a.gamma;

  const type: LunarEclipseType =
    umbralMagnitude >= 1 ? 'total' : umbralMagnitude > 0 ? 'partial' : 'penumbral';

  const result: LunarEclipse = {
    kind: 'lunar',
    type,
    jdMax: ttToJD(a.jde),
    gamma: a.gamma,
    u: a.u,
    umbralMagnitude,
    penumbralMagnitude,
    semiDurationPenumbral,
  };
  if (partialArg > 0) result.semiDurationPartial = (60 / n) * Math.sqrt(partialArg);
  if (totalArg > 0 && type === 'total') result.semiDurationTotal = (60 / n) * Math.sqrt(totalArg);
  return result;
}

/** Approximate lunation index for a Julian day. */
function lunationIndex(jd: number): number {
  const year = 2000 + (jd - J2000) / 365.25;
  return (year - 2000) * 12.3685;
}

export interface EclipseSearchOptions {
  /** how many eclipses to return */
  limit?: number;
  /** include solar eclipses */
  solar?: boolean;
  /** include lunar eclipses */
  lunar?: boolean;
  /** stop after this many lunations regardless of how many were found */
  maxLunations?: number;
}

/** Eclipses occurring after jdFrom, in chronological order. */
export function findEclipses(jdFrom: number, options: EclipseSearchOptions = {}): Eclipse[] {
  const { limit = 6, solar = true, lunar = true, maxLunations = 400 } = options;
  const kStart = Math.floor(lunationIndex(jdFrom)) - 2;
  const found: Eclipse[] = [];
  for (let i = 0; i < maxLunations && found.length < limit + 4; i++) {
    const k = kStart + i;
    if (solar) {
      const e = solarEclipseFromLunation(k);
      if (e && e.jdMax > jdFrom) found.push(e);
    }
    if (lunar) {
      const e = lunarEclipseFromLunation(k);
      if (e && e.jdMax > jdFrom) found.push(e);
    }
  }
  found.sort((a, b) => a.jdMax - b.jdMax);
  return found.slice(0, limit);
}

/** Observer's geocentric position as an equatorial rectangular vector, in AU. */
export function observerVector(jd: number, observer: Observer): Vec3 {
  const u = Math.atan(0.99664719 * Math.tan(observer.latitude * DEG));
  const rhoSin = 0.99664719 * Math.sin(u) + (observer.elevation / 6378140) * sin(observer.latitude);
  const rhoCos = Math.cos(u) + (observer.elevation / 6378140) * cos(observer.latitude);
  const theta = lmst(jd, observer.longitude);
  return [
    rhoCos * cos(theta) * EARTH_RADIUS_AU,
    rhoCos * sin(theta) * EARTH_RADIUS_AU,
    rhoSin * EARTH_RADIUS_AU,
  ];
}

function sphericalOf(v: Vec3): { ra: number; dec: number; dist: number } {
  const dist = Math.hypot(v[0], v[1], v[2]);
  return { ra: norm360(Math.atan2(v[1], v[0]) * RAD), dec: Math.asin(v[2] / dist) * RAD, dist };
}

export interface DiscPair {
  sunRa: number;
  sunDec: number;
  sunRadius: number;
  moonRa: number;
  moonDec: number;
  moonRadius: number;
  separation: number;
}

/** Topocentric apparent discs of the Sun and Moon for an observer. */
export function topocentricDiscs(jd: number, observer: Observer): DiscPair {
  const jdtt = jdToTT(jd);
  const eps = trueObliquity(jdtt);
  const s = sunPosition(jdtt);
  const m = moonPosition(jdtt);

  const sunEq = eclipticToEquatorial(s.lon, s.lat, eps, s.dist);
  const moonEq = eclipticToEquatorial(m.lon, m.lat, eps, m.distKm / 149597870.7);
  const obs = observerVector(jd, observer);

  const toVec = (ra: number, dec: number, dist: number): Vec3 => [
    dist * cos(dec) * cos(ra),
    dist * cos(dec) * sin(ra),
    dist * sin(dec),
  ];
  const sunTopo = sphericalOf(
    toVec(sunEq.ra, sunEq.dec, sunEq.dist).map((c, i) => c - obs[i]) as Vec3,
  );
  const moonTopo = sphericalOf(
    toVec(moonEq.ra, moonEq.dec, moonEq.dist).map((c, i) => c - obs[i]) as Vec3,
  );
  return {
    sunRa: sunTopo.ra,
    sunDec: sunTopo.dec,
    sunRadius: 0.2665822 / sunTopo.dist,
    moonRa: moonTopo.ra,
    moonDec: moonTopo.dec,
    moonRadius: Math.asin(clamp(1737.4 / (moonTopo.dist * 149597870.7), -1, 1)) * RAD,
    separation: angularSeparation(sunTopo.ra, sunTopo.dec, moonTopo.ra, moonTopo.dec),
  };
}

export interface LocalSolarCircumstances {
  visible: boolean;
  type: 'total' | 'annular' | 'partial' | 'none';
  /** JD (UT) of local maximum */
  jdMax: number;
  /** fraction of the solar diameter covered */
  magnitude: number;
  /** fraction of the solar disc area covered */
  obscuration: number;
  firstContact?: number;
  lastContact?: number;
  /** start/end of totality or annularity */
  centralStart?: number;
  centralEnd?: number;
  /** Sun altitude at local maximum, degrees */
  sunAltitude: number;
}

/** Area of intersection of two discs of radii r1, r2 with centres d apart. */
function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = Math.acos(clamp((d * d + r1 * r1 - r2 * r2) / (2 * d * r1), -1, 1));
  const a2 = Math.acos(clamp((d * d + r2 * r2 - r1 * r1) / (2 * d * r2), -1, 1));
  return (
    r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2)
  );
}

/**
 * Fraction of the Sun's disc hidden by a body in front of it.
 *
 * One expression covers the whole eclipse: partial where the discs merely
 * overlap, 1 inside the umbra, and the ratio of the areas inside the antumbra
 * of an annular eclipse. The fragment shader in the renderer mirrors this.
 *
 * @param rSun apparent radius of the Sun, radians
 * @param rCaster apparent radius of the occulting body, radians
 * @param separation angle between the two centres, radians
 */
export function discCoverage(rSun: number, rCaster: number, separation: number): number {
  if (rSun <= 0) return 0;
  if (separation >= rSun + rCaster) return 0;
  if (separation <= Math.abs(rSun - rCaster)) {
    return clamp((rCaster * rCaster) / (rSun * rSun), 0, 1);
  }
  return clamp(lensArea(rSun, rCaster, separation) / (Math.PI * rSun * rSun), 0, 1);
}

/**
 * What an observer at a given place actually sees during a solar eclipse.
 * Searches a +/-4 h window around greatest eclipse for the minimum separation.
 */
export function localSolarCircumstances(
  eclipse: SolarEclipse,
  observer: Observer,
): LocalSolarCircumstances {
  const sep = (jd: number) => topocentricDiscs(jd, observer).separation;
  const window = 4 / 24;
  // Coarse scan first: the separation curve is V-shaped but the minimum can sit
  // anywhere in the window depending on longitude.
  let bestJd = eclipse.jdMax;
  let bestSep = Infinity;
  const stepCount = 96;
  for (let i = 0; i <= stepCount; i++) {
    const jd = eclipse.jdMax - window + (2 * window * i) / stepCount;
    const s = sep(jd);
    if (s < bestSep) {
      bestSep = s;
      bestJd = jd;
    }
  }
  const half = (2 * window) / stepCount;
  const jdMax = minimize(sep, bestJd - half, bestJd + half, 0.2 / 86400);

  const discs = topocentricDiscs(jdMax, observer);
  const { sunRadius: rs, moonRadius: rm, separation: d } = discs;
  const sunAlt = sunAltitudeAt(jdMax, observer);

  if (d >= rs + rm) {
    return {
      visible: false,
      type: 'none',
      jdMax,
      magnitude: 0,
      obscuration: 0,
      sunAltitude: sunAlt,
    };
  }

  const magnitude = (rs + rm - d) / (2 * rs);
  const obscuration = lensArea(rs, rm, d) / (Math.PI * rs * rs);
  const central = d <= Math.abs(rm - rs);
  const type: LocalSolarCircumstances['type'] = central ? (rm >= rs ? 'total' : 'annular') : 'partial';

  const contact = (targetSep: number, from: number, to: number): number | undefined => {
    const f = (jd: number) => sep(jd) - targetSep;
    if (f(from) * f(to) > 0) return undefined;
    let lo = from;
    let hi = to;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };

  const result: LocalSolarCircumstances = {
    visible: sunAlt > -0.85,
    type,
    jdMax,
    magnitude,
    obscuration,
    sunAltitude: sunAlt,
    firstContact: contact(rs + rm, jdMax - window, jdMax),
    lastContact: contact(rs + rm, jdMax + window, jdMax),
  };
  if (central) {
    result.centralStart = contact(Math.abs(rm - rs), jdMax - window, jdMax);
    result.centralEnd = contact(Math.abs(rm - rs), jdMax + window, jdMax);
  }
  return result;
}

function sunAltitudeAt(jd: number, observer: Observer): number {
  const jdtt = jdToTT(jd);
  const s = sunPosition(jdtt);
  const eq = eclipticToEquatorial(s.lon, s.lat, trueObliquity(jdtt), s.dist);
  const H = lmst(jd, observer.longitude) - eq.ra;
  return (
    Math.asin(
      clamp(sin(eq.dec) * sin(observer.latitude) + cos(eq.dec) * cos(observer.latitude) * cos(H), -1, 1),
    ) * RAD
  );
}

/** Whether a lunar eclipse is above the horizon for the observer at maximum. */
export function lunarEclipseVisible(eclipse: LunarEclipse, observer: Observer): { visible: boolean; moonAltitude: number } {
  const jdtt = jdToTT(eclipse.jdMax);
  const m = moonPosition(jdtt);
  const eq = eclipticToEquatorial(m.lon, m.lat, trueObliquity(jdtt));
  const H = lmst(eclipse.jdMax, observer.longitude) - eq.ra;
  const alt =
    Math.asin(
      clamp(sin(eq.dec) * sin(observer.latitude) + cos(eq.dec) * cos(observer.latitude) * cos(H), -1, 1),
    ) * RAD;
  return { visible: alt > 0, moonAltitude: alt };
}
