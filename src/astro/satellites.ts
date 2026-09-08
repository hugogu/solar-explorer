/**
 * Natural satellite positions.
 *
 * Every moon except ours is propagated on a Keplerian orbit expressed in its
 * parent's equatorial plane, which is what makes the Uranian system look like a
 * bullseye and keeps Triton retrograde. Semi-major axes, eccentricities,
 * inclinations and periods are the published values; the epoch phase is only
 * accurate for the Galilean moons, whose mean longitudes come from Meeus ch. 44.
 * The Earth's Moon uses the full ELP series instead.
 */
import { DEG, RAD, norm360 } from './math';
import { Vec3 } from './kepler';
import { solveKeplerElliptic } from './kepler';
import { J2000 } from './time';
import { poleVectorEcliptic, ROTATION_MODELS } from './rotation';
import { moonPosition } from './moon';
import { precessToJ2000 } from './coords';

const AU_KM = 149597870.7;

export interface SatelliteElements {
  id: string;
  parent: string;
  /** semi-major axis, km */
  aKm: number;
  e: number;
  /** inclination to the parent's equator, degrees (>90 means retrograde) */
  i: number;
  /** longitude of the ascending node measured in the parent's equatorial plane */
  node: number;
  /** argument of pericentre, degrees */
  peri: number;
  /** mean longitude at J2000, degrees */
  L0: number;
  /** sidereal period, days */
  periodDays: number;
  /** true when the epoch phase is a real ephemeris value rather than a placeholder */
  phaseIsReal: boolean;
}

/**
 * Galilean mean longitudes (Meeus ch. 44) - real ephemeris phases.
 * The remaining moons carry correct geometry and periods with a nominal epoch
 * phase, which the UI states explicitly.
 */
export const SATELLITE_ELEMENTS: SatelliteElements[] = [
  // Mars
  { id: 'phobos', parent: 'mars', aKm: 9376, e: 0.0151, i: 1.093, node: 0, peri: 150, L0: 232, periodDays: 0.31891023, phaseIsReal: false },
  { id: 'deimos', parent: 'mars', aKm: 23463.2, e: 0.00033, i: 1.788, node: 0, peri: 260, L0: 63, periodDays: 1.263, phaseIsReal: false },
  // Jupiter
  { id: 'amalthea', parent: 'jupiter', aKm: 181365, e: 0.0032, i: 0.374, node: 0, peri: 155, L0: 20, periodDays: 0.49817905, phaseIsReal: false },
  { id: 'io', parent: 'jupiter', aKm: 421800, e: 0.0041, i: 0.036, node: 0, peri: 84.129, L0: 106.07719, periodDays: 1.769137786, phaseIsReal: true },
  { id: 'europa', parent: 'jupiter', aKm: 671100, e: 0.0094, i: 0.466, node: 0, peri: 88.97, L0: 175.73161, periodDays: 3.551181041, phaseIsReal: true },
  { id: 'ganymede', parent: 'jupiter', aKm: 1070400, e: 0.0013, i: 0.177, node: 0, peri: 192.417, L0: 120.55883, periodDays: 7.15455296, phaseIsReal: true },
  { id: 'callisto', parent: 'jupiter', aKm: 1882700, e: 0.0074, i: 0.192, node: 0, peri: 52.643, L0: 84.44459, periodDays: 16.6890184, phaseIsReal: true },
  // Saturn
  { id: 'mimas', parent: 'saturn', aKm: 185539, e: 0.0196, i: 1.574, node: 0, peri: 14, L0: 105, periodDays: 0.9424218, phaseIsReal: false },
  { id: 'enceladus', parent: 'saturn', aKm: 237948, e: 0.0047, i: 0.009, node: 0, peri: 210, L0: 312, periodDays: 1.3702180, phaseIsReal: false },
  { id: 'tethys', parent: 'saturn', aKm: 294619, e: 0.0001, i: 1.091, node: 0, peri: 45, L0: 26, periodDays: 1.8878020, phaseIsReal: false },
  { id: 'dione', parent: 'saturn', aKm: 377396, e: 0.0022, i: 0.028, node: 0, peri: 284, L0: 200, periodDays: 2.7369150, phaseIsReal: false },
  { id: 'rhea', parent: 'saturn', aKm: 527108, e: 0.001, i: 0.331, node: 0, peri: 120, L0: 78, periodDays: 4.5182120, phaseIsReal: false },
  { id: 'titan', parent: 'saturn', aKm: 1221870, e: 0.0288, i: 0.34854, node: 0, peri: 180.532, L0: 163, periodDays: 15.945421, phaseIsReal: false },
  { id: 'hyperion', parent: 'saturn', aKm: 1481009, e: 0.1230, i: 0.568, node: 0, peri: 300, L0: 250, periodDays: 21.276, phaseIsReal: false },
  { id: 'iapetus', parent: 'saturn', aKm: 3560820, e: 0.0286, i: 15.47, node: 0, peri: 271, L0: 40, periodDays: 79.3215, phaseIsReal: false },
  { id: 'phoebe', parent: 'saturn', aKm: 12947780, e: 0.1562, i: 175.3, node: 0, peri: 342, L0: 130, periodDays: 550.31, phaseIsReal: false },
  // Uranus
  { id: 'miranda', parent: 'uranus', aKm: 129390, e: 0.0013, i: 4.338, node: 0, peri: 68, L0: 30, periodDays: 1.413479, phaseIsReal: false },
  { id: 'ariel', parent: 'uranus', aKm: 190900, e: 0.0012, i: 0.041, node: 0, peri: 115, L0: 190, periodDays: 2.520379, phaseIsReal: false },
  { id: 'umbriel', parent: 'uranus', aKm: 266000, e: 0.0039, i: 0.128, node: 0, peri: 84, L0: 300, periodDays: 4.144177, phaseIsReal: false },
  { id: 'titania', parent: 'uranus', aKm: 436300, e: 0.0011, i: 0.079, node: 0, peri: 284, L0: 100, periodDays: 8.705872, phaseIsReal: false },
  { id: 'oberon', parent: 'uranus', aKm: 583500, e: 0.0014, i: 0.068, node: 0, peri: 104, L0: 240, periodDays: 13.463239, phaseIsReal: false },
  // Neptune
  { id: 'proteus', parent: 'neptune', aKm: 117647, e: 0.00053, i: 0.524, node: 0, peri: 60, L0: 15, periodDays: 1.12231477, phaseIsReal: false },
  { id: 'triton', parent: 'neptune', aKm: 354759, e: 0.000016, i: 156.885, node: 0, peri: 0, L0: 245, periodDays: 5.876854, phaseIsReal: false },
  { id: 'nereid', parent: 'neptune', aKm: 5513818, e: 0.7507, i: 7.232, node: 0, peri: 280.83, L0: 330, periodDays: 360.1362, phaseIsReal: false },
  // Pluto
  { id: 'charon', parent: 'pluto', aKm: 19591.4, e: 0.0002, i: 0.08, node: 0, peri: 0, L0: 60, periodDays: 6.3872304, phaseIsReal: false },
  { id: 'nix', parent: 'pluto', aKm: 48694, e: 0.002, i: 0.133, node: 0, peri: 30, L0: 200, periodDays: 24.85463, phaseIsReal: false },
  { id: 'hydra', parent: 'pluto', aKm: 64738, e: 0.0059, i: 0.242, node: 0, peri: 100, L0: 320, periodDays: 38.20177, phaseIsReal: false },
  // Eris
  { id: 'dysnomia', parent: 'eris', aKm: 37273, e: 0.0062, i: 0, node: 0, peri: 0, L0: 130, periodDays: 15.7859, phaseIsReal: false },
];

export const SATELLITES_BY_PARENT = SATELLITE_ELEMENTS.reduce<Record<string, SatelliteElements[]>>(
  (acc, sat) => {
    (acc[sat.parent] ??= []).push(sat);
    return acc;
  },
  {},
);

/**
 * Orthonormal basis of a parent's equatorial plane in ecliptic J2000
 * coordinates: [node direction, in-plane perpendicular, pole].
 */
export function equatorialBasis(parentId: string, jdtt: number): [Vec3, Vec3, Vec3] {
  const model = ROTATION_MODELS[parentId];
  const pole: Vec3 = model
    ? poleVectorEcliptic(model(jdtt).ra0, model(jdtt).dec0)
    : [0, 0, 1];
  // Ascending node of the plane on the ecliptic: z x pole.
  let nx = -pole[1];
  let ny = pole[0];
  const nl = Math.hypot(nx, ny);
  if (nl < 1e-9) {
    nx = 1;
    ny = 0;
  } else {
    nx /= nl;
    ny /= nl;
  }
  const xAxis: Vec3 = [nx, ny, 0];
  const yAxis: Vec3 = [
    pole[1] * xAxis[2] - pole[2] * xAxis[1],
    pole[2] * xAxis[0] - pole[0] * xAxis[2],
    pole[0] * xAxis[1] - pole[1] * xAxis[0],
  ];
  return [xAxis, yAxis, pole];
}

/** Longitude of the parent's equatorial ascending node on the ecliptic, degrees. */
function equatorNodeLongitude(basis: [Vec3, Vec3, Vec3]): number {
  return norm360(Math.atan2(basis[0][1], basis[0][0]) * RAD);
}

/**
 * Position of a satellite relative to its parent, in AU, ecliptic J2000.
 * @param basis parent's equatorial basis, reused across all of its moons
 */
export function satellitePosition(
  sat: SatelliteElements,
  jdtt: number,
  basis: [Vec3, Vec3, Vec3],
): Vec3 {
  const d = jdtt - J2000;
  const meanLongitude = sat.L0 + (360 / sat.periodDays) * d;
  // Mean longitudes are referred to the equinox; convert to an argument of
  // latitude measured from the parent's equatorial node.
  const M = (meanLongitude - equatorNodeLongitude(basis) - sat.peri - sat.node) * DEG;
  const E = solveKeplerElliptic(M, sat.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + sat.e) * Math.sin(E / 2), Math.sqrt(1 - sat.e) * Math.cos(E / 2));
  const r = (sat.aKm / AU_KM) * (1 - sat.e * Math.cos(E));

  const u = nu + sat.peri * DEG;
  const node = sat.node * DEG;
  const inc = sat.i * DEG;
  // Position in the parent's equatorial frame.
  const px = r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(inc));
  const py = r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(inc));
  const pz = r * Math.sin(u) * Math.sin(inc);

  const [ex, ey, ez] = basis;
  return [
    px * ex[0] + py * ey[0] + pz * ez[0],
    px * ex[1] + py * ey[1] + pz * ez[1],
    px * ex[2] + py * ey[2] + pz * ez[2],
  ];
}

/** The Earth's Moon, from the ELP series, expressed in ecliptic J2000. */
export function lunarPositionJ2000(jdtt: number): Vec3 {
  const m = moonPosition(jdtt);
  const { lon, lat } = precessToJ2000(m.lon, m.lat, jdtt);
  const r = m.distKm / AU_KM;
  return [
    r * Math.cos(lat * DEG) * Math.cos(lon * DEG),
    r * Math.cos(lat * DEG) * Math.sin(lon * DEG),
    r * Math.sin(lat * DEG),
  ];
}
