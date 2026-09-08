/**
 * The sky as seen from the surface of any body, not just the Earth.
 *
 * The Earth-specific path in riseset.ts uses sidereal time; this one works from
 * the IAU rotation elements, so it gives sunrise on Mars, the two-week lunar day
 * and Mercury's 176-day solar day from the same code.
 */
import { RAD, bisect, clamp } from './math';
import { Vec3, orbitalPosition } from './kepler';
import { PLANET_IDS, PlanetId, earthHelio, planetHelio, vecAdd } from './planets';
import { ROTATION_MODELS, OBLIQUITY_J2000 } from './rotation';
import { SATELLITE_ELEMENTS, equatorialBasis, lunarPositionJ2000, satellitePosition } from './satellites';
import { SMALL_BODY_BY_ID } from './smallbodies';
import { BODY_BY_ID } from '../data';
import { cos, sin } from './math';

const PLANET_SET = new Set<string>(PLANET_IDS);
const SATELLITE_BY_ID = new Map(SATELLITE_ELEMENTS.map((s) => [s.id, s]));

/** Heliocentric ecliptic J2000 position of any catalogued body, in AU. */
export function heliocentricPosition(id: string, jdtt: number): Vec3 | null {
  if (id === 'sun') return [0, 0, 0];
  if (id === 'earth') return earthHelio(jdtt, lunarPositionJ2000(jdtt));
  if (PLANET_SET.has(id)) return planetHelio(id as PlanetId, jdtt);
  const small = SMALL_BODY_BY_ID.get(id);
  if (small) return orbitalPosition(small.elements, jdtt);
  if (id === 'moon') {
    const earth = earthHelio(jdtt, lunarPositionJ2000(jdtt));
    return vecAdd(earth, lunarPositionJ2000(jdtt));
  }
  const satellite = SATELLITE_BY_ID.get(id);
  if (satellite) {
    const parent = heliocentricPosition(satellite.parent, jdtt);
    if (!parent) return null;
    return vecAdd(parent, satellitePosition(satellite, jdtt, equatorialBasis(satellite.parent, jdtt)));
  }
  return null;
}

/** Body-fixed axes expressed in ecliptic J2000: [prime meridian, 90 east, pole]. */
export function bodyFrame(id: string, jdtt: number): [Vec3, Vec3, Vec3] | null {
  const model = ROTATION_MODELS[id];
  let ra0: number;
  let dec0: number;
  let w: number;
  if (model) {
    const r = model(jdtt);
    ra0 = r.ra0;
    dec0 = r.dec0;
    w = r.w;
  } else {
    const satellite = SATELLITE_BY_ID.get(id);
    if (!satellite) return null;
    // Moons without an IAU model keep one face towards their parent.
    const basis = equatorialBasis(satellite.parent, jdtt);
    const relative = satellitePosition(satellite, jdtt, basis);
    const x = relative[0] * basis[0][0] + relative[1] * basis[0][1] + relative[2] * basis[0][2];
    const y = relative[0] * basis[1][0] + relative[1] * basis[1][1] + relative[2] * basis[1][2];
    const lon = Math.atan2(y, x) * RAD;
    const pole = basis[2];
    const eq = poleToEquatorial(pole);
    ra0 = eq.ra0;
    dec0 = eq.dec0;
    w = (lon + 180) % 360;
  }
  return frameFromIau(ra0, dec0, w);
}

function poleToEquatorial(pole: Vec3): { ra0: number; dec0: number } {
  const c = cos(OBLIQUITY_J2000);
  const s = sin(OBLIQUITY_J2000);
  const x = pole[0];
  const y = pole[1] * c - pole[2] * s;
  const z = pole[1] * s + pole[2] * c;
  return { ra0: Math.atan2(y, x) * RAD, dec0: Math.asin(clamp(z, -1, 1)) * RAD };
}

/**
 * Body-fixed axes from the IAU angles, in ecliptic J2000.
 * The equatorial construction is R = Rz(a0 + 90) Rx(90 - d0) Rz(W); the columns
 * of that matrix are the body's X, Y and Z axes.
 */
function frameFromIau(ra0: number, dec0: number, w: number): [Vec3, Vec3, Vec3] {
  const a = (ra0 + 90) * (Math.PI / 180);
  const b = (90 - dec0) * (Math.PI / 180);
  const c = w * (Math.PI / 180);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cc = Math.cos(c);
  const sc = Math.sin(c);

  // Rz(a) Rx(b) Rz(c), column by column, in equatorial J2000.
  const x: Vec3 = [
    ca * cc - sa * cb * sc,
    sa * cc + ca * cb * sc,
    sb * sc,
  ];
  const y: Vec3 = [
    -ca * sc - sa * cb * cc,
    -sa * sc + ca * cb * cc,
    sb * cc,
  ];
  const z: Vec3 = [sa * sb, -ca * sb, cb];
  return [toEcliptic(x), toEcliptic(y), toEcliptic(z)];
}

function toEcliptic(v: Vec3): Vec3 {
  const c = cos(OBLIQUITY_J2000);
  const s = sin(OBLIQUITY_J2000);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

/** Local vertical at a point on a body's surface, in ecliptic J2000. */
export function localUp(frame: [Vec3, Vec3, Vec3], latitude: number, longitude: number): Vec3 {
  const cl = cos(latitude);
  return [
    cl * cos(longitude) * frame[0][0] + cl * sin(longitude) * frame[1][0] + sin(latitude) * frame[2][0],
    cl * cos(longitude) * frame[0][1] + cl * sin(longitude) * frame[1][1] + sin(latitude) * frame[2][1],
    cl * cos(longitude) * frame[0][2] + cl * sin(longitude) * frame[1][2] + sin(latitude) * frame[2][2],
  ];
}

export interface SurfacePoint {
  bodyId: string;
  latitude: number;
  longitude: number;
}

/** Altitude of the Sun above the horizon at a point on any body, in degrees. */
export function sunAltitudeOnBody(point: SurfacePoint, jdtt: number): number | null {
  const position = heliocentricPosition(point.bodyId, jdtt);
  const frame = bodyFrame(point.bodyId, jdtt);
  if (!position || !frame) return null;
  const r = Math.hypot(position[0], position[1], position[2]);
  if (r === 0) return null;
  const toSun: Vec3 = [-position[0] / r, -position[1] / r, -position[2] / r];
  const up = localUp(frame, point.latitude, point.longitude);
  return Math.asin(clamp(toSun[0] * up[0] + toSun[1] * up[1] + toSun[2] * up[2], -1, 1)) * RAD;
}

/**
 * Length of a solar day: how long the Sun takes to come back to the same place
 * in the sky. Retrograde rotation gives a shorter solar day than sidereal.
 */
export function solarDayLength(bodyId: string): number {
  const info = BODY_BY_ID.get(bodyId);
  if (!info?.physical.rotationHours) return 1;
  const sidereal = info.physical.rotationHours / 24;
  const satellite = SATELLITE_BY_ID.get(bodyId);
  const orbitId = bodyId === 'moon' ? 'earth' : satellite?.parent ?? bodyId;
  const orbitInfo = BODY_BY_ID.get(orbitId);
  const orbitDays = orbitInfo?.orbit?.periodDays ?? 365.25;
  const denominator = 1 / sidereal - 1 / orbitDays;
  if (Math.abs(denominator) < 1e-9) return Infinity;
  return Math.abs(1 / denominator);
}

export interface SolarDayEvents {
  /** JD (TT) of sunrise */
  sunrise?: number;
  sunset?: number;
  noon?: number;
  /** hours of daylight in Earth hours */
  daylightHours: number;
  maxAltitude: number;
  polarDay: boolean;
  polarNight: boolean;
  /** length of one solar day on this body, in Earth days */
  solarDayDays: number;
}

/**
 * Sunrise, transit and sunset at a point on any body.
 * The search window is one solar day of that body, which is why this works for
 * Mercury's 176-day day just as well as for the Earth's.
 */
export function solarDayEvents(point: SurfacePoint, jdttStart: number): SolarDayEvents | null {
  const dayLength = solarDayLength(point.bodyId);
  if (!Number.isFinite(dayLength)) return null;
  const horizon = point.bodyId === 'earth' ? -0.8333 : -0.25;
  const f = (jd: number) => {
    const alt = sunAltitudeOnBody(point, jd);
    return alt === null ? -1 : alt - horizon;
  };

  const steps = 240;
  const step = dayLength / steps;
  let previous = f(jdttStart);
  let anyAbove = previous > 0;
  let anyBelow = previous <= 0;
  let maxAltitude = previous + horizon;
  let bestJd = jdttStart;
  const result: SolarDayEvents = {
    daylightHours: 0,
    maxAltitude,
    polarDay: false,
    polarNight: false,
    solarDayDays: dayLength,
  };

  for (let i = 1; i <= steps; i++) {
    const jd = jdttStart + i * step;
    const value = f(jd);
    const altitude = value + horizon;
    if (altitude > maxAltitude) {
      maxAltitude = altitude;
      bestJd = jd;
    }
    if (value > 0) anyAbove = true;
    else anyBelow = true;
    if (previous <= 0 && value > 0 && result.sunrise === undefined) {
      result.sunrise = bisect(f, jdttStart + (i - 1) * step, jd, step / 4000);
    } else if (previous > 0 && value <= 0 && result.sunset === undefined) {
      result.sunset = bisect((x) => -f(x), jdttStart + (i - 1) * step, jd, step / 4000);
    }
    previous = value;
  }

  result.maxAltitude = maxAltitude;
  result.noon = bestJd;
  result.polarDay = anyAbove && !anyBelow;
  result.polarNight = anyBelow && !anyAbove;
  if (result.sunrise !== undefined && result.sunset !== undefined) {
    const span = result.sunset > result.sunrise
      ? result.sunset - result.sunrise
      : result.sunset + dayLength - result.sunrise;
    result.daylightHours = span * 24;
  } else if (result.polarDay) {
    result.daylightHours = dayLength * 24;
  }
  return result;
}

export interface ApsisEvent {
  /** JD (TT) */
  jd: number;
  /** heliocentric distance in AU */
  distanceAu: number;
  kind: 'perihelion' | 'aphelion';
}

/** Next perihelion and aphelion passage after the given time. */
export function nextApsides(bodyId: string, jdttStart: number, horizonDays: number): ApsisEvent[] {
  const radius = (jd: number) => {
    const p = heliocentricPosition(bodyId, jd);
    return p ? Math.hypot(p[0], p[1], p[2]) : NaN;
  };
  const info = BODY_BY_ID.get(bodyId);
  const period = info?.orbit?.periodDays ?? 365.25;
  const step = Math.max(0.5, Math.min(period / 180, horizonDays / 200));
  const found: ApsisEvent[] = [];

  let previous = radius(jdttStart);
  let current = radius(jdttStart + step);
  for (let jd = jdttStart + step; jd < jdttStart + horizonDays && found.length < 2; jd += step) {
    const next = radius(jd + step);
    if (Number.isNaN(next)) break;
    if (current < previous && current < next) {
      found.push({ jd: refineExtremum(radius, jd - step, jd + step, true), distanceAu: current, kind: 'perihelion' });
    } else if (current > previous && current > next) {
      found.push({ jd: refineExtremum(radius, jd - step, jd + step, false), distanceAu: current, kind: 'aphelion' });
    }
    previous = current;
    current = next;
  }
  for (const event of found) event.distanceAu = radius(event.jd);
  return found;
}

/** Golden-section refinement of a bracketed extremum. */
function refineExtremum(f: (x: number) => number, lo: number, hi: number, minimum: boolean): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  const sign = minimum ? 1 : -1;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = sign * f(c);
  let fd = sign * f(d);
  for (let i = 0; i < 60 && b - a > 1e-4; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = sign * f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = sign * f(d);
    }
  }
  return (a + b) / 2;
}

export type ElongationKind =
  | 'opposition'
  | 'conjunction'
  | 'inferiorConjunction'
  | 'superiorConjunction'
  | 'greatestElongationEast'
  | 'greatestElongationWest';

export interface ElongationEvent {
  jd: number;
  kind: ElongationKind;
  /** true angular separation from the Sun as seen from Earth, degrees */
  elongation: number;
  /** distance from the Earth in AU */
  distanceAu: number;
}

/** Angle Sun-Earth-body, in degrees, and the geocentric distance. */
export function elongationFromEarth(bodyId: string, jdtt: number): { elongation: number; distanceAu: number } | null {
  const geometry = geocentricGeometry(bodyId, jdtt);
  if (!geometry) return null;
  return { elongation: geometry.elongation, distanceAu: geometry.distanceAu };
}

interface GeocentricGeometry {
  /** true angular separation from the Sun, degrees */
  elongation: number;
  /**
   * Difference in geocentric ecliptic longitude between the body and the Sun,
   * wrapped to (-180, 180]. Opposition is the moment this passes 180 and
   * conjunction the moment it passes zero - that is the classical definition,
   * and unlike the 3-D angle it reaches those values exactly.
   */
  longitudeDifference: number;
  distanceAu: number;
}

function geocentricGeometry(bodyId: string, jdtt: number): GeocentricGeometry | null {
  const earth = heliocentricPosition('earth', jdtt);
  const body = heliocentricPosition(bodyId, jdtt);
  if (!earth || !body) return null;
  const toBody: Vec3 = [body[0] - earth[0], body[1] - earth[1], body[2] - earth[2]];
  const toSun: Vec3 = [-earth[0], -earth[1], -earth[2]];
  const db = Math.hypot(toBody[0], toBody[1], toBody[2]);
  const ds = Math.hypot(toSun[0], toSun[1], toSun[2]);
  if (db === 0 || ds === 0) return null;
  const dot = (toBody[0] * toSun[0] + toBody[1] * toSun[1] + toBody[2] * toSun[2]) / (db * ds);
  const lonBody = Math.atan2(toBody[1], toBody[0]) * RAD;
  const lonSun = Math.atan2(toSun[1], toSun[0]) * RAD;
  return {
    elongation: Math.acos(clamp(dot, -1, 1)) * RAD,
    longitudeDifference: ((((lonBody - lonSun) % 360) + 540) % 360) - 180,
    distanceAu: db,
  };
}

/**
 * Oppositions and conjunctions for outer bodies; for Mercury and Venus the
 * greatest elongations are reported as well, since those are the moments they
 * are actually worth looking for.
 */
export function nextElongationEvents(bodyId: string, jdttStart: number, horizonDays: number): ElongationEvent[] {
  if (bodyId === 'earth' || bodyId === 'sun') return [];
  const inner = bodyId === 'mercury' || bodyId === 'venus';
  const geometry = (jd: number) => geocentricGeometry(bodyId, jd);
  if (!geometry(jdttStart)) return [];

  const step = Math.max(0.25, horizonDays / 1200);
  const events: ElongationEvent[] = [];

  let previousJd = jdttStart;
  let previous = geometry(jdttStart) as GeocentricGeometry;
  let elongationPrev = previous.elongation;
  let elongationCurrent = (geometry(jdttStart + step) as GeocentricGeometry).elongation;

  for (let jd = jdttStart + step; jd < jdttStart + horizonDays && events.length < 4; jd += step) {
    const current = geometry(jd);
    const ahead = geometry(jd + step);
    if (!current || !ahead) break;

    const a = previous.longitudeDifference;
    const b = current.longitudeDifference;
    if (a * b < 0) {
      if (Math.abs(a) < 90) {
        // Crossing zero: conjunction.
        const at = bisectAngle((x) => geometry(x)?.longitudeDifference ?? 0, previousJd, jd);
        const value = geometry(at);
        if (value) {
          const kind: ElongationKind = inner
            ? (value.distanceAu < 0.9 ? 'inferiorConjunction' : 'superiorConjunction')
            : 'conjunction';
          events.push({ jd: at, kind, elongation: value.elongation, distanceAu: value.distanceAu });
        }
      } else {
        // Wrapping through 180: opposition.
        const at = bisectAngle(
          (x) => {
            const g = geometry(x);
            return g ? ((((g.longitudeDifference + 360) % 360) - 180)) : 0;
          },
          previousJd, jd,
        );
        const value = geometry(at);
        if (value && !inner) {
          events.push({ jd: at, kind: 'opposition', elongation: value.elongation, distanceAu: value.distanceAu });
        }
      }
    }

    if (inner && elongationCurrent > elongationPrev && elongationCurrent > ahead.elongation) {
      const at = refineExtremum((x) => geometry(x)?.elongation ?? 0, jd - step, jd + step, false);
      const value = geometry(at);
      if (value) {
        events.push({
          jd: at,
          kind: value.longitudeDifference > 0 ? 'greatestElongationEast' : 'greatestElongationWest',
          elongation: value.elongation,
          distanceAu: value.distanceAu,
        });
      }
    }

    previousJd = jd;
    previous = current;
    elongationPrev = elongationCurrent;
    elongationCurrent = ahead.elongation;
  }

  events.sort((x, y) => x.jd - y.jd);
  return events;
}

/** Bisection for a function that crosses zero once inside the bracket. */
function bisectAngle(f: (x: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  for (let i = 0; i < 60 && b - a > 1e-5; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fa * fm <= 0) b = m;
    else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
