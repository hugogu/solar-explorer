/** Orbit paths for planets, small bodies and moons. */
import * as THREE from 'three';
import { OrbitalElements, Vec3, sampleOrbit } from '../astro/kepler';
import { planetElements, PlanetId } from '../astro/planets';
import { SATELLITE_ELEMENTS, equatorialBasis } from '../astro/satellites';
import { SMALL_BODIES } from '../astro/smallbodies';
import { AU_UNITS, KM_PER_UNIT, ScaleSettings, displayDistanceAu } from './frame';
import { BODY_BY_ID } from '../data';

export interface OrbitLine {
  id: string;
  line: THREE.Line;
  /** moon orbits are drawn in their parent's local group */
  parentId?: string;
  /** unscaled sample points, AU for heliocentric orbits and km for moons */
  points: Vec3[];
}

function makeLine(points: Vec3[], color: string, opacity: number): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.length * 3), 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

/**
 * Vertices per orbit.
 *
 * A polyline cuts the corner of the curve it approximates, and the body itself
 * is drawn on the true curve, so too few segments leave the body sitting beside
 * its own orbit by the chord's sagitta - roughly L^2/8r. At five hundred
 * segments that was a few thousand kilometres for the Earth, which reads as the
 * line drifting against the body as it crosses each segment. Quadrupling the
 * count cuts the error sixteenfold for a few hundred kilobytes.
 */
const ORBIT_SEGMENTS = 2048;
const SATELLITE_ORBIT_SEGMENTS = 512;

/** All heliocentric orbits: eight planets, the dwarf planets and the comets. */
export function createHeliocentricOrbits(jdtt: number): OrbitLine[] {
  const orbits: OrbitLine[] = [];
  const planetIds: PlanetId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  for (const id of planetIds) {
    const el = planetElements(id, jdtt);
    const info = BODY_BY_ID.get(id);
    orbits.push({
      id,
      points: sampleOrbit(el, ORBIT_SEGMENTS),
      line: makeLine(sampleOrbit(el, ORBIT_SEGMENTS), info?.color ?? '#8899aa', 0.42),
    });
  }
  for (const body of SMALL_BODIES) {
    if (body.id === 'pluto') continue;
    const info = BODY_BY_ID.get(body.id);
    const points = sampleOrbit(body.elements as OrbitalElements, ORBIT_SEGMENTS);
    orbits.push({
      id: body.id,
      points,
      line: makeLine(points, info?.kind === 'comet' ? '#7fd4ff' : '#c9a2ff', 0.3),
    });
  }
  return orbits;
}

/** Satellite orbits, expressed relative to the parent in kilometres. */
export function createSatelliteOrbits(jdtt: number): OrbitLine[] {
  const bases = new Map<string, [Vec3, Vec3, Vec3]>();
  return SATELLITE_ELEMENTS.map((sat) => {
    if (!bases.has(sat.parent)) bases.set(sat.parent, equatorialBasis(sat.parent, jdtt));
    const basis = bases.get(sat.parent) as [Vec3, Vec3, Vec3];
    const points: Vec3[] = [];
    const segments = SATELLITE_ORBIT_SEGMENTS;
    for (let s = 0; s <= segments; s++) {
      const E = (s / segments) * Math.PI * 2;
      const nu = 2 * Math.atan2(
        Math.sqrt(1 + sat.e) * Math.sin(E / 2),
        Math.sqrt(1 - sat.e) * Math.cos(E / 2),
      );
      const r = sat.aKm * (1 - sat.e * Math.cos(E));
      const u = nu + (sat.peri * Math.PI) / 180;
      const node = (sat.node * Math.PI) / 180;
      const inc = (sat.i * Math.PI) / 180;
      const px = r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(inc));
      const py = r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(inc));
      const pz = r * Math.sin(u) * Math.sin(inc);
      points.push([
        px * basis[0][0] + py * basis[1][0] + pz * basis[2][0],
        px * basis[0][1] + py * basis[1][1] + pz * basis[2][1],
        px * basis[0][2] + py * basis[1][2] + pz * basis[2][2],
      ]);
    }
    const info = BODY_BY_ID.get(sat.id);
    return {
      id: sat.id,
      parentId: sat.parent,
      points,
      line: makeLine(points, info?.color ?? '#9fb4c8', 0.35),
    };
  });
}

/** The Moon's path, sampled from the real lunar theory rather than an ellipse. */
export function createLunarOrbit(sample: (jdtt: number) => Vec3, jdtt: number): OrbitLine {
  const points: Vec3[] = [];
  const segments = SATELLITE_ORBIT_SEGMENTS;
  for (let s = 0; s <= segments; s++) {
    points.push(sample(jdtt - 27.321661 / 2 + (27.321661 * s) / segments));
  }
  return {
    id: 'moon',
    parentId: 'earth',
    points: points.map((p) => [p[0] * 149597870.7, p[1] * 149597870.7, p[2] * 149597870.7] as Vec3),
    line: makeLine(points, '#c8c8c8', 0.4),
  };
}

/** Rewrite an orbit's vertex buffer for the current scale settings. */
export function applyOrbitScale(orbit: OrbitLine, scale: ScaleSettings): void {
  const attribute = orbit.line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = attribute.array as Float32Array;
  const isSatellite = orbit.parentId !== undefined;
  for (let i = 0; i < orbit.points.length; i++) {
    const [x, y, z] = orbit.points[i];
    let sx: number;
    let sy: number;
    let sz: number;
    if (isSatellite) {
      const k = scale.moonOrbitScale / KM_PER_UNIT;
      sx = x * k;
      sy = y * k;
      sz = z * k;
    } else {
      const r = Math.hypot(x, y, z);
      const k = r === 0 ? 0 : (displayDistanceAu(r, scale) / r) * AU_UNITS;
      sx = x * k;
      sy = y * k;
      sz = z * k;
    }
    // Ecliptic (z north) -> scene (y up).
    array[i * 3] = sx;
    array[i * 3 + 1] = sz;
    array[i * 3 + 2] = -sy;
  }
  attribute.needsUpdate = true;
  orbit.line.geometry.computeBoundingSphere();
}
