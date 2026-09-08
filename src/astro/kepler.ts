/** Kepler orbit propagation: elliptic, parabolic and hyperbolic. */
import { DEG, RAD, norm360, norm2pi } from './math';

export interface OrbitalElements {
  /** semi-major axis, AU (Infinity/undefined for parabolic orbits) */
  a: number;
  /** eccentricity */
  e: number;
  /** inclination, degrees */
  i: number;
  /** longitude of ascending node, degrees */
  node: number;
  /** argument of perihelion, degrees */
  peri: number;
  /** mean anomaly at the epoch, degrees (elliptic orbits) */
  M0?: number;
  /** epoch as a Julian day (TT) */
  epoch: number;
  /** perihelion distance, AU (used by parabolic / hyperbolic orbits) */
  q?: number;
  /** time of perihelion passage, JD (TT) */
  tp?: number;
  /** orbital period in days; derived from a when omitted */
  periodDays?: number;
}

export type Vec3 = [number, number, number];

const GAUSS_K = 0.01720209895; // Gaussian gravitational constant, AU^1.5/day

/** Solve Kepler's equation M = E - e sin E. M in radians, result in radians. */
export function solveKeplerElliptic(M: number, e: number): number {
  const m = norm2pi(M);
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 60; i++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e sinh H - H. */
export function solveKeplerHyperbolic(M: number, e: number): number {
  let H = Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8);
  for (let i = 0; i < 100; i++) {
    const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < 1e-12) break;
  }
  return H;
}

/** True anomaly (rad) and heliocentric distance (AU) at a given time. */
export function anomalyAt(el: OrbitalElements, jdtt: number): { nu: number; r: number } {
  const dt = jdtt - (el.tp ?? el.epoch);
  if (el.e < 1) {
    const a = el.a;
    const n = el.periodDays ? 360 / el.periodDays : (GAUSS_K / Math.sqrt(a * a * a)) * RAD;
    const M = (el.M0 !== undefined ? el.M0 + n * (jdtt - el.epoch) : n * dt) * DEG;
    const E = solveKeplerElliptic(M, el.e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
    return { nu, r: a * (1 - el.e * Math.cos(E)) };
  }
  if (el.e === 1) {
    const q = el.q ?? el.a;
    const W = (3 * GAUSS_K * dt) / (Math.sqrt(2) * 2 * Math.pow(q, 1.5));
    const y = Math.cbrt(W + Math.sqrt(W * W + 1));
    const s = y - 1 / y;
    const nu = 2 * Math.atan(s);
    return { nu, r: q * (1 + s * s) };
  }
  const q = el.q ?? Math.abs(el.a) * (el.e - 1);
  const a = q / (el.e - 1);
  const M = (GAUSS_K * dt) / Math.sqrt(a * a * a);
  const H = solveKeplerHyperbolic(M, el.e);
  const nu = 2 * Math.atan2(Math.sqrt(el.e + 1) * Math.sinh(H / 2), Math.sqrt(el.e - 1) * Math.cosh(H / 2));
  return { nu, r: a * (el.e * Math.cosh(H) - 1) };
}

/**
 * Heliocentric ecliptic rectangular coordinates (AU) of a body on the given orbit.
 * Reference plane is the ecliptic and equinox of J2000.
 */
export function orbitalPosition(el: OrbitalElements, jdtt: number): Vec3 {
  const { nu, r } = anomalyAt(el, jdtt);
  return perifocalToEcliptic(r, nu, el);
}

export function perifocalToEcliptic(r: number, nu: number, el: OrbitalElements): Vec3 {
  const u = nu + el.peri * DEG; // argument of latitude
  const node = el.node * DEG;
  const inc = el.i * DEG;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  return [
    r * (cosN * cosU - sinN * sinU * cosI),
    r * (sinN * cosU + cosN * sinU * cosI),
    r * (sinU * sinI),
  ];
}

/** Sample a full orbit as a closed polyline of ecliptic points (AU). */
export function sampleOrbit(el: OrbitalElements, segments = 512): Vec3[] {
  const pts: Vec3[] = [];
  if (el.e < 1) {
    for (let s = 0; s <= segments; s++) {
      const E = (s / segments) * 2 * Math.PI;
      const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
      const r = el.a * (1 - el.e * Math.cos(E));
      pts.push(perifocalToEcliptic(r, nu, el));
    }
  } else {
    // Open orbit: sample true anomaly inside the asymptote limit.
    const nuMax = Math.acos(-1 / el.e) * 0.92;
    const q = el.q ?? Math.abs(el.a) * (el.e - 1);
    for (let s = 0; s <= segments; s++) {
      const nu = -nuMax + (2 * nuMax * s) / segments;
      const r = (q * (1 + el.e)) / (1 + el.e * Math.cos(nu));
      pts.push(perifocalToEcliptic(r, nu, el));
    }
  }
  return pts;
}

/** Orbital period in days from the semi-major axis (heliocentric). */
export function periodFromSemiMajorAxis(aAu: number): number {
  return 365.256898326 * Math.pow(aAu, 1.5);
}

export function meanAnomalyAt(el: OrbitalElements, jdtt: number): number {
  const period = el.periodDays ?? periodFromSemiMajorAxis(el.a);
  return norm360((el.M0 ?? 0) + (360 / period) * (jdtt - el.epoch));
}
