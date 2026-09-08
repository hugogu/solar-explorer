/**
 * The track an eclipse shadow sweeps across a planet.
 *
 * The renderer already darkens each surface fragment by how much of the Sun is
 * blocked, which is the eclipse as it looks at one instant. This module answers
 * the other half of the question: where the umbra has been and where it is
 * going. It returns the central line in geographic coordinates, the width of
 * totality and how long it lasts at each point along it.
 *
 * Everything is derived from the same disc geometry the shading uses, so the
 * drawn track and the shaded globe cannot disagree.
 */
import { RAD, clamp, cos, norm360, sin } from './math';
import { Vec3 } from './kepler';
import { eclipticToEquatorial, trueObliquity } from './coords';
import { moonPosition } from './moon';
import { sunPosition } from './sun';
import { jdToTT, lmst } from './time';
import { EARTH_RADIUS_AU, EARTH_RADIUS_KM, SolarEclipse, discCoverage } from './eclipse';

const AU_KM = 149597870.7;
/**
 * How completely the Sun must be hidden to count as totality.
 *
 * It has to be this close to 1: coverage approaches unity smoothly as the last
 * sliver of photosphere closes, so a looser test like 0.999 sits appreciably
 * outside the true umbral edge and stretches both the measured width and the
 * measured duration by about ten per cent.
 */
const TOTALITY_COVERAGE = 1 - 1e-6;
const SUN_RADIUS_KM = 696000;
const MOON_RADIUS_KM = 1737.4;
/** Flattening term of the reference ellipsoid, as used for observer positions. */
const POLAR_RATIO = 0.99664719;

/** Geocentric equatorial vectors of the Sun and Moon at one instant, in AU. */
export interface Geometry {
  jd: number;
  sun: Vec3;
  moon: Vec3;
  /** Greenwich sidereal time, degrees */
  gst: number;
}

export function geometryAt(jd: number): Geometry {
  const jdtt = jdToTT(jd);
  const eps = trueObliquity(jdtt);
  const s = sunPosition(jdtt);
  const m = moonPosition(jdtt);
  const sunEq = eclipticToEquatorial(s.lon, s.lat, eps, s.dist);
  const moonEq = eclipticToEquatorial(m.lon, m.lat, eps, m.distKm / AU_KM);
  const toVec = (ra: number, dec: number, dist: number): Vec3 => [
    dist * cos(dec) * cos(ra),
    dist * cos(dec) * sin(ra),
    dist * sin(dec),
  ];
  return {
    jd,
    sun: toVec(sunEq.ra, sunEq.dec, sunEq.dist),
    moon: toVec(moonEq.ra, moonEq.dec, moonEq.dist),
    gst: lmst(jd, 0),
  };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalise(v: Vec3): Vec3 {
  const l = length(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Unit vector along the shadow axis: from the Sun's centre past the Moon's. */
function shadowAxis(g: Geometry): Vec3 {
  return normalise(subtract(g.moon, g.sun));
}

/**
 * Perpendicular distance from the Earth's centre to the shadow axis, in Earth
 * radii - the instantaneous equivalent of the eclipse's gamma.
 */
export function axisDistance(g: Geometry): number {
  const u = shadowAxis(g);
  const foot = dot(g.moon, u);
  const perpendicular: Vec3 = [
    g.moon[0] - foot * u[0],
    g.moon[1] - foot * u[1],
    g.moon[2] - foot * u[2],
  ];
  return length(perpendicular) / EARTH_RADIUS_AU;
}

/**
 * The point of the surface the shadow axis is aimed at: the intersection when
 * the axis hits, otherwise the nearest point of the surface to it.
 *
 * Note this is not the foot of the perpendicular from the Earth's centre - that
 * lies on the terminator, ninety degrees from where the shadow actually is.
 */
function axisSurfacePoint(g: Geometry): { point: Vec3; onEarth: boolean } {
  const hit = axisIntersection(g);
  if (hit) return { point: hit, onEarth: true };
  const u = shadowAxis(g);
  const foot = dot(g.moon, u);
  const perpendicular: Vec3 = [
    g.moon[0] - foot * u[0],
    g.moon[1] - foot * u[1],
    g.moon[2] - foot * u[2],
  ];
  const surface = normalise(perpendicular);
  return {
    point: [surface[0] * EARTH_RADIUS_AU, surface[1] * EARTH_RADIUS_AU, surface[2] * EARTH_RADIUS_AU],
    onEarth: false,
  };
}

/** Where the shadow axis meets the Earth, or null when it misses. */
function axisIntersection(g: Geometry): Vec3 | null {
  const u = shadowAxis(g);
  const b = dot(g.moon, u);
  const c = dot(g.moon, g.moon) - EARTH_RADIUS_AU * EARTH_RADIUS_AU;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return [g.moon[0] + t * u[0], g.moon[1] + t * u[1], g.moon[2] + t * u[2]];
}

/** Geocentric equatorial point -> geodetic latitude and east longitude. */
function toGeographic(point: Vec3, gst: number): { latitude: number; longitude: number } {
  const r = length(point);
  const geocentricLat = Math.asin(clamp(point[2] / r, -1, 1)) * RAD;
  const latitude = Math.atan(Math.tan(geocentricLat / RAD) / (POLAR_RATIO * POLAR_RATIO)) * RAD;
  const ra = norm360(Math.atan2(point[1], point[0]) * RAD);
  let longitude = ra - gst;
  longitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return { latitude, longitude };
}

export interface GroundView {
  /** fraction of the Sun's disc covered, 0..1 */
  coverage: number;
  /** ratio of the two apparent diameters; above 1 means the umbra reaches here */
  ratio: number;
  /** Sun altitude above the horizon, degrees */
  sunAltitude: number;
}

/** Geodetic latitude and east longitude -> geocentric equatorial vector, in AU. */
export function groundPoint(latitude: number, longitude: number, jd: number): Vec3 {
  const u = Math.atan(POLAR_RATIO * Math.tan(latitude / RAD));
  const rhoSin = POLAR_RATIO * Math.sin(u);
  const rhoCos = Math.cos(u);
  const theta = lmst(jd, longitude);
  return [
    rhoCos * cos(theta) * EARTH_RADIUS_AU,
    rhoCos * sin(theta) * EARTH_RADIUS_AU,
    rhoSin * EARTH_RADIUS_AU,
  ];
}

/** What an observer standing at one point on the ground sees at one instant. */
export function groundView(g: Geometry, observer: Vec3): GroundView {
  const toSun = subtract(g.sun, observer);
  const toMoon = subtract(g.moon, observer);
  const dSun = length(toSun);
  const dMoon = length(toMoon);
  const rSun = Math.asin(clamp(SUN_RADIUS_KM / (dSun * AU_KM), -1, 1));
  const rMoon = Math.asin(clamp(MOON_RADIUS_KM / (dMoon * AU_KM), -1, 1));
  const separation = Math.acos(clamp(dot(normalise(toSun), normalise(toMoon)), -1, 1));
  const up = normalise(observer);
  return {
    coverage: discCoverage(rSun, rMoon, separation),
    ratio: rMoon / rSun,
    sunAltitude: Math.asin(clamp(dot(normalise(toSun), up), -1, 1)) * RAD,
  };
}

export interface ShadowSample {
  /** Julian day, UT */
  jd: number;
  latitude: number;
  longitude: number;
  /** true while the axis actually reaches the surface */
  central: boolean;
  /** width of the umbra measured across the track, km */
  widthKm: number;
  /** how long the central phase lasts for someone on the centre line, seconds */
  durationSeconds: number;
  /** Sun altitude at this point, degrees */
  sunAltitude: number;
  /** speed of the shadow over the ground, km/s */
  speedKms: number;
}

export interface EclipsePath {
  /** samples along the track, in time order */
  samples: ShadowSample[];
  /** first and last moment the penumbra touches the Earth at all */
  penumbraStart: number;
  penumbraEnd: number;
  /** first and last moment the axis reaches the surface, when it does */
  centralStart?: number;
  centralEnd?: number;
  /** greatest width and duration anywhere along the track */
  maxWidthKm: number;
  maxDurationSeconds: number;
}

/** Umbral cone radius at the fundamental plane, in Earth radii, plus Earth's own. */
function penumbraLimit(eclipse: SolarEclipse): number {
  return 1.5433 + eclipse.u;
}

function bisectDistance(target: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const f = (jd: number) => axisDistance(geometryAt(jd)) - target;
  let fa = f(a);
  for (let i = 0; i < 50 && b - a > 1e-6; i++) {
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

/** Unit vector in the Earth-fixed frame for a geographic position. */
function bodyFixed(latitude: number, longitude: number): Vec3 {
  return [
    cos(latitude) * cos(longitude),
    cos(latitude) * sin(longitude),
    sin(latitude),
  ];
}

function toLatLon(v: Vec3): { latitude: number; longitude: number } {
  const n = normalise(v);
  return {
    latitude: Math.asin(clamp(n[2], -1, 1)) * RAD,
    longitude: Math.atan2(n[1], n[0]) * RAD,
  };
}

/**
 * Half-width of the umbra, measured across the track.
 *
 * The offsets are taken in the Earth-fixed frame so "across the track" means
 * across the ground, then converted back to a real observer position for the
 * disc test. The edge of totality is where the Sun stops being fully covered.
 */
function umbraHalfWidthKm(
  g: Geometry,
  centre: { latitude: number; longitude: number },
  ahead: { latitude: number; longitude: number },
): number {
  const b1 = bodyFixed(centre.latitude, centre.longitude);
  const b2 = bodyFixed(ahead.latitude, ahead.longitude);
  const along = subtract(b2, [b1[0] * dot(b2, b1), b1[1] * dot(b2, b1), b1[2] * dot(b2, b1)]);
  if (length(along) < 1e-12) return 0;
  const sideways = normalise(cross(b1, normalise(along)));

  const at = (angle: number): number => {
    const offset: Vec3 = [
      b1[0] * Math.cos(angle) + sideways[0] * Math.sin(angle),
      b1[1] * Math.cos(angle) + sideways[1] * Math.sin(angle),
      b1[2] * Math.cos(angle) + sideways[2] * Math.sin(angle),
    ];
    const geographic = toLatLon(offset);
    return groundView(g, groundPoint(geographic.latitude, geographic.longitude, g.jd)).coverage;
  };
  if (at(0) < TOTALITY_COVERAGE) return 0;
  const bracket = 4 / RAD;
  if (at(bracket) >= TOTALITY_COVERAGE) return bracket * EARTH_RADIUS_KM;
  let lo = 0;
  let hi = bracket;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= TOTALITY_COVERAGE) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * EARTH_RADIUS_KM;
}

/**
 * How long the Sun stays completely covered at a fixed place on the ground.
 *
 * Measured directly rather than inferred from width divided by speed: for a
 * grazing eclipse the umbra's footprint is stretched along its track, so the
 * across-track width says very little about how long totality lasts.
 */
function centralDurationSeconds(latitude: number, longitude: number, jdCentre: number): number {
  const covered = (jd: number) =>
    groundView(geometryAt(jd), groundPoint(latitude, longitude, jd)).coverage >= TOTALITY_COVERAGE;
  if (!covered(jdCentre)) return 0;
  const limit = 8 / 1440; // no central phase runs longer than eight minutes either side
  const edge = (direction: 1 | -1): number => {
    let inside = 0;
    let outside = limit;
    if (covered(jdCentre + direction * limit)) return limit;
    for (let i = 0; i < 34; i++) {
      const mid = (inside + outside) / 2;
      if (covered(jdCentre + direction * mid)) inside = mid;
      else outside = mid;
    }
    return (inside + outside) / 2;
  };
  return (edge(1) + edge(-1)) * 86400;
}

/** Great-circle distance between two geographic points, in km. */
function groundDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const va = bodyFixed(a.latitude, a.longitude);
  const vb = bodyFixed(b.latitude, b.longitude);
  return Math.acos(clamp(dot(va, vb), -1, 1)) * EARTH_RADIUS_KM;
}

/**
 * The full track of a solar eclipse.
 * @param stepMinutes spacing of the samples along the track
 */
export function solarEclipsePath(eclipse: SolarEclipse, stepMinutes = 4): EclipsePath {
  const limit = penumbraLimit(eclipse);
  const window = 3.6 / 24;
  const centre = eclipse.jdMax;

  // The penumbra touches the Earth while the axis passes closer than the
  // combined radii; find those two moments by bisection.
  const penumbraStart = bisectDistance(limit, centre - window, centre);
  const penumbraEnd = bisectDistance(limit, centre + window, centre);

  let centralStart: number | undefined;
  let centralEnd: number | undefined;
  if (Math.abs(eclipse.gamma) < 0.9972) {
    centralStart = bisectDistance(0.9972, penumbraStart, centre);
    centralEnd = bisectDistance(0.9972, penumbraEnd, centre);
  }

  const step = stepMinutes / 1440;
  const samples: ShadowSample[] = [];
  const from = centralStart ?? penumbraStart;
  const to = centralEnd ?? penumbraEnd;
  const count = Math.max(2, Math.ceil((to - from) / step));

  for (let i = 0; i <= count; i++) {
    const jd = from + ((to - from) * i) / count;
    const g = geometryAt(jd);
    const point = axisIntersection(g);
    if (!point) continue;
    const geographic = toGeographic(point, g.gst);

    // Where the shadow will be a moment later, expressed geographically: the
    // ground turns under the shadow, so the speed that sets how long totality
    // lasts is the speed over the ground, not through space.
    const deltaSeconds = 30;
    const ahead = geometryAt(jd + deltaSeconds / 86400);
    const nextPoint = axisIntersection(ahead);
    let widthKm = 0;
    let speedKms = 0;
    if (nextPoint) {
      const nextGeographic = toGeographic(nextPoint, ahead.gst);
      speedKms = groundDistanceKm(geographic, nextGeographic) / deltaSeconds;
      widthKm = 2 * umbraHalfWidthKm(g, geographic, nextGeographic);
    }
    const view = groundView(g, point);
    samples.push({
      jd,
      latitude: geographic.latitude,
      longitude: geographic.longitude,
      central: view.coverage >= TOTALITY_COVERAGE,
      widthKm,
      durationSeconds: centralDurationSeconds(geographic.latitude, geographic.longitude, jd),
      sunAltitude: view.sunAltitude,
      speedKms,
    });
  }

  return {
    samples,
    penumbraStart,
    penumbraEnd,
    centralStart,
    centralEnd,
    maxWidthKm: samples.reduce((m, s) => Math.max(m, s.widthKm), 0),
    maxDurationSeconds: samples.reduce((m, s) => Math.max(m, s.durationSeconds), 0),
  };
}

/** Where the shadow axis is right now, for the moving marker on the globe. */
export function shadowPositionAt(jd: number): {
  latitude: number;
  longitude: number;
  onEarth: boolean;
  umbraWidthKm: number;
  coverage: number;
} {
  const g = geometryAt(jd);
  const { point, onEarth } = axisSurfacePoint(g);
  const geographic = toGeographic(point, g.gst);
  let umbraWidthKm = 0;
  if (onEarth) {
    const ahead = geometryAt(jd + 30 / 86400);
    const nextPoint = axisIntersection(ahead);
    if (nextPoint) {
      umbraWidthKm = 2 * umbraHalfWidthKm(g, geographic, toGeographic(nextPoint, ahead.gst));
    }
  }
  return {
    ...geographic,
    onEarth,
    umbraWidthKm,
    coverage: groundView(g, point).coverage,
  };
}

/**
 * Outline of the region that sees any part of the eclipse at one instant - the
 * edge of the penumbra where it falls on the Earth.
 * @returns geographic points around the outline, or an empty array if none
 */
export function penumbraOutline(jd: number, segments = 96): Array<{ latitude: number; longitude: number }> {
  const g = geometryAt(jd);
  const centreDirection = normalise(axisSurfacePoint(g).point);
  // Build a basis around the axis direction to sweep a cone of surface points.
  const helper: Vec3 = Math.abs(centreDirection[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const right = normalise(cross(centreDirection, helper));
  const up = cross(centreDirection, right);

  const outline: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 0; i < segments; i++) {
    const phi = (i / segments) * Math.PI * 2;
    const direction: Vec3 = [
      right[0] * Math.cos(phi) + up[0] * Math.sin(phi),
      right[1] * Math.cos(phi) + up[1] * Math.sin(phi),
      right[2] * Math.cos(phi) + up[2] * Math.sin(phi),
    ];
    // Walk out from the axis until the eclipse stops being visible.
    const at = (angle: number): number => {
      const p: Vec3 = [
        (centreDirection[0] * Math.cos(angle) + direction[0] * Math.sin(angle)) * EARTH_RADIUS_AU,
        (centreDirection[1] * Math.cos(angle) + direction[1] * Math.sin(angle)) * EARTH_RADIUS_AU,
        (centreDirection[2] * Math.cos(angle) + direction[2] * Math.sin(angle)) * EARTH_RADIUS_AU,
      ];
      const view = groundView(g, p);
      return view.sunAltitude > -0.6 && view.coverage > 0.0005 ? 1 : 0;
    };
    if (at(0) === 0) continue;
    let lo = 0;
    let hi = Math.PI;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid) === 1) lo = mid;
      else hi = mid;
    }
    const angle = (lo + hi) / 2;
    const p: Vec3 = [
      (centreDirection[0] * Math.cos(angle) + direction[0] * Math.sin(angle)) * EARTH_RADIUS_AU,
      (centreDirection[1] * Math.cos(angle) + direction[1] * Math.sin(angle)) * EARTH_RADIUS_AU,
      (centreDirection[2] * Math.cos(angle) + direction[2] * Math.sin(angle)) * EARTH_RADIUS_AU,
    ];
    outline.push(toGeographic(p, g.gst));
  }
  return outline;
}
