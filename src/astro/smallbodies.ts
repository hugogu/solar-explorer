/**
 * Dwarf planets and comets.
 *
 * Comet orbits are anchored on their observed perihelion passage, so their
 * positions are genuine. Dwarf planet geometry (a, e, i, node, argument of
 * perihelion) is the published element set, while the epoch mean anomaly is
 * reconstructed from the known perihelion or aphelion epoch and is therefore
 * approximate - the UI says so.
 */
import { OrbitalElements } from './kepler';
import { utcToJD } from './time';

export interface SmallBody {
  id: string;
  elements: OrbitalElements;
  /** true when the phase along the orbit is anchored on an observed passage */
  phaseIsReal: boolean;
}

const J2000 = 2451545.0;

/** Mean anomaly at J2000 implied by a perihelion passage year. */
function m0FromPerihelionYear(year: number, periodYears: number): number {
  return (((2000 - year) / periodYears) * 360) % 360;
}

export const DWARF_PLANETS: SmallBody[] = [
  {
    id: 'ceres',
    elements: {
      a: 2.7658, e: 0.0785, i: 10.587, node: 80.26, peri: 73.71,
      M0: 7.2, epoch: J2000, periodDays: 1681.63,
    },
    phaseIsReal: false,
  },
  {
    id: 'haumea',
    elements: {
      a: 43.13, e: 0.195, i: 28.21, node: 122.03, peri: 239.0,
      M0: 190.2, epoch: J2000, periodDays: 283.3 * 365.25,
    },
    phaseIsReal: false,
  },
  {
    id: 'makemake',
    elements: {
      a: 45.43, e: 0.161, i: 28.98, node: 79.38, peri: 294.83,
      M0: 141.2, epoch: J2000, periodDays: 306.2 * 365.25,
    },
    phaseIsReal: false,
  },
  {
    id: 'eris',
    elements: {
      a: 67.78, e: 0.4416, i: 44.04, node: 35.95, peri: 151.64,
      M0: 194.8, epoch: J2000, periodDays: 558.0 * 365.25,
    },
    phaseIsReal: false,
  },
  {
    id: 'quaoar',
    elements: {
      a: 43.69, e: 0.0392, i: 7.99, node: 188.8, peri: 147.5,
      M0: m0FromPerihelionYear(2075, 288.8), epoch: J2000, periodDays: 288.8 * 365.25,
    },
    phaseIsReal: false,
  },
  {
    id: 'gonggong',
    elements: {
      a: 67.38, e: 0.5019, i: 30.7, node: 336.83, peri: 207.0,
      M0: 93.1, epoch: J2000, periodDays: 553.0 * 365.25,
    },
    phaseIsReal: false,
  },
  {
    id: 'sedna',
    elements: {
      a: 506.0, e: 0.8496, i: 11.93, node: 144.25, peri: 311.29,
      M0: 357.6, epoch: J2000, periodDays: 11400 * 365.25,
    },
    phaseIsReal: false,
  },
];

export const COMETS: SmallBody[] = [
  {
    id: 'halley',
    elements: {
      a: 17.874, e: 0.96714, i: 162.26, node: 58.42, peri: 111.33,
      q: 0.5871, tp: utcToJD(1986, 2, 9, 11, 0), epoch: J2000, periodDays: 27563.4,
    },
    phaseIsReal: true,
  },
  {
    id: 'encke',
    elements: {
      a: 2.2152, e: 0.84833, i: 11.78, node: 334.57, peri: 186.55,
      q: 0.336, tp: utcToJD(2023, 10, 22), epoch: J2000, periodDays: 1204.0,
    },
    phaseIsReal: true,
  },
  {
    id: 'swift-tuttle',
    elements: {
      a: 26.092, e: 0.963, i: 113.45, node: 139.38, peri: 152.98,
      q: 0.9595, tp: utcToJD(1992, 12, 12), epoch: J2000, periodDays: 133.28 * 365.25,
    },
    phaseIsReal: true,
  },
  {
    id: 'tempel-tuttle',
    elements: {
      a: 10.337, e: 0.9055, i: 162.49, node: 235.27, peri: 172.5,
      q: 0.9765, tp: utcToJD(1998, 2, 28), epoch: J2000, periodDays: 33.24 * 365.25,
    },
    phaseIsReal: true,
  },
  {
    id: 'churyumov-gerasimenko',
    elements: {
      a: 3.4626, e: 0.64102, i: 7.04, node: 50.14, peri: 12.69,
      q: 1.2432, tp: utcToJD(2021, 11, 2), epoch: J2000, periodDays: 2354.0,
    },
    phaseIsReal: true,
  },
  {
    id: 'hale-bopp',
    elements: {
      a: 186.0, e: 0.99509, i: 89.43, node: 282.47, peri: 130.59,
      q: 0.9141, tp: utcToJD(1997, 4, 1), epoch: J2000, periodDays: 2533 * 365.25,
    },
    phaseIsReal: true,
  },
  {
    id: 'hyakutake',
    elements: {
      a: 1165.0, e: 0.99980, i: 124.92, node: 188.05, peri: 130.18,
      q: 0.2302, tp: utcToJD(1996, 5, 1, 15, 0), epoch: J2000, periodDays: 39790 * 365.25,
    },
    phaseIsReal: true,
  },
  {
    id: 'neowise',
    elements: {
      a: 358.0, e: 0.99918, i: 128.94, node: 61.0, peri: 37.28,
      q: 0.29478, tp: utcToJD(2020, 7, 3, 16, 0), epoch: J2000, periodDays: 6767 * 365.25,
    },
    phaseIsReal: true,
  },
];

export const SMALL_BODIES: SmallBody[] = [...DWARF_PLANETS, ...COMETS];

export const SMALL_BODY_BY_ID = new Map(SMALL_BODIES.map((b) => [b.id, b]));
