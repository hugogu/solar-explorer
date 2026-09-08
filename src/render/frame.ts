/**
 * Scene units and the ecliptic -> three.js frame mapping.
 *
 * One scene unit is 1000 km, which keeps planet radii in a comfortable numeric
 * range while an astronomical unit is about 1.5e5 units. The ephemeris works in
 * the ecliptic frame with +Z towards the ecliptic north pole; three.js is
 * Y-up, so (x, y, z) becomes (x, z, -y).
 */
import * as THREE from 'three';
import type { Vec3 } from '../astro/kepler';

export const KM_PER_UNIT = 1000;
export const AU_UNITS = 149597.8707;

export function toScene(v: Vec3, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(v[0], v[2], -v[1]);
}

export function auToUnits(au: number): number {
  return au * AU_UNITS;
}

export function kmToUnits(km: number): number {
  return km / KM_PER_UNIT;
}

export interface ScaleSettings {
  /**
   * Exponent applied to heliocentric distances: 1 is the true layout, smaller
   * values pull the outer planets inwards so the whole system stays on screen.
   */
  distanceExponent: number;
  /** Multiplier applied to every body radius. */
  bodyScale: number;
  /** Extra multiplier applied to satellite orbits so moons clear their planet. */
  moonOrbitScale: number;
}

export const REAL_SCALE: ScaleSettings = {
  distanceExponent: 1,
  bodyScale: 1,
  moonOrbitScale: 1,
};

export const COMPACT_SCALE: ScaleSettings = {
  distanceExponent: 0.55,
  bodyScale: 12,
  moonOrbitScale: 6,
};

/**
 * Map a true heliocentric distance to the displayed one.
 * The exponent is applied around 1 AU so the inner system keeps its shape.
 */
export function displayDistanceAu(au: number, settings: ScaleSettings): number {
  if (settings.distanceExponent === 1) return au;
  return Math.pow(au, settings.distanceExponent);
}

/** Scale a heliocentric position vector, preserving direction. */
export function scaleHeliocentric(v: Vec3, settings: ScaleSettings): Vec3 {
  const r = Math.hypot(v[0], v[1], v[2]);
  if (r === 0 || settings.distanceExponent === 1) return v;
  const k = displayDistanceAu(r, settings) / r;
  return [v[0] * k, v[1] * k, v[2] * k];
}
