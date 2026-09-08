/**
 * Simulation state: given an instant, work out where every body is and how it
 * is oriented. This is the single bridge between the ephemeris code and the
 * renderer - nothing in src/render computes astronomy for itself.
 */
import { Vec3 } from '../astro/kepler';
import { orbitalPosition } from '../astro/kepler';
import {
  PLANET_IDS, PlanetId, earthHelio, planetHelio, vecAdd, vecLength,
} from '../astro/planets';
import { ROTATION_MODELS, RotationState, poleEclipticToEquatorial, poleVectorEcliptic } from '../astro/rotation';
import {
  SATELLITE_ELEMENTS, SatelliteElements, equatorialBasis, lunarPositionJ2000, satellitePosition,
} from '../astro/satellites';
import { COMETS, DWARF_PLANETS, SmallBody } from '../astro/smallbodies';
import { jdToTT } from '../astro/time';
import { ALL_BODIES, BodyInfo, BODY_BY_ID } from '../data';

export interface BodyState {
  id: string;
  info: BodyInfo;
  /** heliocentric ecliptic J2000 position, AU */
  position: Vec3;
  /** position relative to the parent body, AU (equals position for planets) */
  relative: Vec3;
  parentId?: string;
  /** north pole direction in ecliptic J2000 coordinates */
  pole: Vec3;
  /** the same pole as IAU right ascension and declination, degrees */
  raDec0: [number, number];
  /** prime meridian angle, degrees */
  meridian: number;
  /** distance from the Sun, AU */
  sunDistance: number;
  /** distance from the parent, AU */
  parentDistance: number;
  /** orbital speed, km/s (finite differenced) */
  speedKms: number;
}

const SATELLITE_BY_ID = new Map(SATELLITE_ELEMENTS.map((s) => [s.id, s]));
const SMALL_BODY_LIST: SmallBody[] = [...DWARF_PLANETS, ...COMETS];

/** Tidally locked moons keep one face towards their parent. */
const TIDALLY_LOCKED = new Set(
  SATELLITE_ELEMENTS.filter((s) => s.id !== 'hyperion' && s.id !== 'phoebe' && s.id !== 'nereid')
    .map((s) => s.id),
);

export class Simulation {
  /** current instant as a Julian day in UT */
  jd: number;
  readonly states = new Map<string, BodyState>();

  constructor(jd: number) {
    this.jd = jd;
    this.update(jd);
  }

  update(jd: number): void {
    this.jd = jd;
    const jdtt = jdToTT(jd);
    const dt = 0.01; // days, for finite-difference velocities

    // Planets (heliocentric).
    const moonVec = lunarPositionJ2000(jdtt);
    const positions = new Map<string, Vec3>();
    for (const id of PLANET_IDS) {
      positions.set(id, id === 'earth' ? earthHelio(jdtt, moonVec) : planetHelio(id, jdtt));
    }

    for (const id of PLANET_IDS) {
      const pos = positions.get(id) as Vec3;
      const prev = id === 'earth' ? earthHelio(jdtt - dt, moonVec) : planetHelio(id, jdtt - dt);
      this.setState(id, pos, pos, undefined, jdtt, speed(pos, prev, dt));
    }

    // Dwarf planets and comets (heliocentric, Pluto already covered above).
    for (const body of SMALL_BODY_LIST) {
      if (body.id === 'pluto') continue;
      const pos = orbitalPosition(body.elements, jdtt);
      const prev = orbitalPosition(body.elements, jdtt - dt);
      this.setState(body.id, pos, pos, undefined, jdtt, speed(pos, prev, dt));
    }

    // Moons (relative to their parent).
    const bases = new Map<string, [Vec3, Vec3, Vec3]>();
    for (const sat of SATELLITE_ELEMENTS) {
      if (!bases.has(sat.parent)) bases.set(sat.parent, equatorialBasis(sat.parent, jdtt));
    }
    for (const sat of SATELLITE_ELEMENTS) {
      const parentPos = this.states.get(sat.parent)?.position;
      if (!parentPos) continue;
      const basis = bases.get(sat.parent) as [Vec3, Vec3, Vec3];
      const rel = satellitePosition(sat, jdtt, basis);
      const relPrev = satellitePosition(sat, jdtt - dt, basis);
      this.setState(sat.id, vecAdd(parentPos, rel), rel, sat.parent, jdtt, speed(rel, relPrev, dt));
    }

    // The Earth's Moon uses the full lunar theory instead of Keplerian elements.
    const earth = this.states.get('earth');
    if (earth) {
      const prev = lunarPositionJ2000(jdtt - dt);
      this.setState('moon', vecAdd(earth.position, moonVec), moonVec, 'earth', jdtt, speed(moonVec, prev, dt));
    }

    // The Sun sits at the origin of the heliocentric frame.
    this.setState('sun', [0, 0, 0], [0, 0, 0], undefined, jdtt, 0);
  }

  private setState(
    id: string,
    position: Vec3,
    relative: Vec3,
    parentId: string | undefined,
    jdtt: number,
    speedKms: number,
  ): void {
    const info = BODY_BY_ID.get(id);
    if (!info) return;
    const rotation = this.rotationOf(id, jdtt, relative, parentId);
    const existing = this.states.get(id);
    const state: BodyState = existing ?? {
      id, info, position, relative, parentId,
      pole: [0, 0, 1], raDec0: [0, 90], meridian: 0,
      sunDistance: 0, parentDistance: 0, speedKms: 0,
    };
    state.position = position;
    state.relative = relative;
    state.parentId = parentId;
    state.pole = rotation.pole;
    state.raDec0 = rotation.raDec0;
    state.meridian = rotation.meridian;
    state.sunDistance = vecLength(position);
    state.parentDistance = vecLength(relative);
    state.speedKms = speedKms;
    this.states.set(id, state);
  }

  /**
   * Orientation of a body: IAU pole and prime meridian when a model exists,
   * otherwise a tidally locked moon facing its parent, otherwise a simple
   * spin about the parent's pole using the catalogued rotation period.
   */
  private rotationOf(
    id: string,
    jdtt: number,
    relative: Vec3,
    parentId: string | undefined,
  ): { pole: Vec3; raDec0: [number, number]; meridian: number } {
    const model = ROTATION_MODELS[id];
    if (model) {
      const r: RotationState = model(jdtt);
      return { pole: poleVectorEcliptic(r.ra0, r.dec0), raDec0: [r.ra0, r.dec0], meridian: r.w };
    }
    const sat = SATELLITE_BY_ID.get(id);
    if (sat && parentId) {
      const basis = equatorialBasis(parentId, jdtt);
      if (TIDALLY_LOCKED.has(id)) {
        // Prime meridian pointing at the parent: the sub-parent longitude.
        const x = relative[0] * basis[0][0] + relative[1] * basis[0][1] + relative[2] * basis[0][2];
        const y = relative[0] * basis[1][0] + relative[1] * basis[1][1] + relative[2] * basis[1][2];
        const lon = (Math.atan2(y, x) * 180) / Math.PI;
        const eq = poleEclipticToEquatorial(basis[2]);
        return { pole: basis[2], raDec0: [eq.ra0, eq.dec0], meridian: (lon + 180) % 360 };
      }
      const info = BODY_BY_ID.get(id);
      const period = info?.physical.rotationHours ?? 24;
      const eq = poleEclipticToEquatorial(basis[2]);
      return {
        pole: basis[2],
        raDec0: [eq.ra0, eq.dec0],
        meridian: (((jdtt * 24) / period) * 360) % 360,
      };
    }
    const info = BODY_BY_ID.get(id);
    const period = info?.physical.rotationHours ?? 24;
    return { pole: [0, 0, 1], raDec0: [270, 66.56], meridian: (((jdtt * 24) / period) * 360) % 360 };
  }

  get(id: string): BodyState | undefined {
    return this.states.get(id);
  }

  /** Every body that has a state, in catalogue order. */
  list(): BodyState[] {
    return ALL_BODIES.map((b) => this.states.get(b.id)).filter((s): s is BodyState => !!s);
  }
}

function speed(now: Vec3, before: Vec3, dtDays: number): number {
  const dx = now[0] - before[0];
  const dy = now[1] - before[1];
  const dz = now[2] - before[2];
  const au = Math.hypot(dx, dy, dz);
  return (au * 149597870.7) / (dtDays * 86400);
}

export { PLANET_IDS };
export type { PlanetId, SatelliteElements };
