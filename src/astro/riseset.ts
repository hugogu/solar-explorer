/**
 * Rise, transit and set times for the Sun and Moon, plus twilight.
 *
 * Rather than the classic interpolation scheme this samples the altitude on a
 * short step and refines each crossing by bisection: it costs a few hundred
 * cheap evaluations, never fails near the poles, and handles the Moon's fast
 * motion without special cases.
 */
import { Observer, equatorialToHorizontal } from './coords';
import { bisect, norm180 } from './math';
import { moonPosition } from './moon';
import { sunEquatorial } from './sun';
import { jdToTT, lmst } from './time';
import { eclipticToEquatorial, trueObliquity } from './coords';

/** An altitude sample plus the horizon altitude the body must cross. */
export interface AltitudeSample {
  altitude: number;
  horizon: number;
}

export type AltitudeFn = (jd: number) => AltitudeSample;

/** Geometric altitude of the Sun's centre, and the horizon it must cross. */
export function sunAltitude(jd: number, observer: Observer, horizon = -0.8333): AltitudeSample {
  const eq = sunEquatorial(jdToTT(jd));
  const H = norm180(lmst(jd, observer.longitude) - eq.ra);
  const { alt } = equatorialToHorizontal(H, eq.dec, observer.latitude);
  return { altitude: alt, horizon };
}

/** Moon altitude; the horizon accounts for parallax, refraction and semidiameter. */
export function moonAltitude(jd: number, observer: Observer): AltitudeSample {
  const jdtt = jdToTT(jd);
  const m = moonPosition(jdtt);
  const eq = eclipticToEquatorial(m.lon, m.lat, trueObliquity(jdtt), m.distKm);
  const H = norm180(lmst(jd, observer.longitude) - eq.ra);
  const { alt } = equatorialToHorizontal(H, eq.dec, observer.latitude);
  return { altitude: alt, horizon: 0.7275 * m.parallax - 0.5667 };
}

export interface RiseSetResult {
  /** JD (UT) of rising, undefined when the body does not rise that day */
  rise?: number;
  /** JD (UT) of setting */
  set?: number;
  /** JD (UT) of upper transit */
  transit?: number;
  /** maximum altitude reached during the window, degrees */
  maxAltitude: number;
  /** minimum altitude during the window, degrees */
  minAltitude: number;
  /** true when the body stays above the horizon for the whole window */
  alwaysUp: boolean;
  /** true when it never rises */
  alwaysDown: boolean;
}

/** Scan [jdStart, jdStart + days] for horizon crossings of an altitude function. */
export function findRiseSet(
  jdStart: number,
  altitudeFn: AltitudeFn,
  days = 1,
  stepMinutes = 4,
): RiseSetResult {
  const step = stepMinutes / 1440;
  const n = Math.ceil(days / step);
  /** Altitude above the crossing horizon: positive when the body is visible. */
  const f = (jd: number) => {
    const a = altitudeFn(jd);
    return a.altitude - a.horizon;
  };

  const first = altitudeFn(jdStart);
  const result: RiseSetResult = {
    maxAltitude: first.altitude,
    minAltitude: first.altitude,
    alwaysUp: false,
    alwaysDown: false,
  };
  let prevJd = jdStart;
  let prevVal = first.altitude - first.horizon;
  let bestJd = jdStart;
  let anyAbove = prevVal > 0;
  let anyBelow = prevVal <= 0;

  for (let i = 1; i <= n; i++) {
    const jd = jdStart + i * step;
    const sample = altitudeFn(jd);
    const val = sample.altitude - sample.horizon;
    if (sample.altitude > result.maxAltitude) {
      result.maxAltitude = sample.altitude;
      bestJd = jd;
    }
    if (sample.altitude < result.minAltitude) result.minAltitude = sample.altitude;
    if (val > 0) anyAbove = true;
    else anyBelow = true;
    if (prevVal <= 0 && val > 0 && result.rise === undefined) {
      result.rise = bisect(f, prevJd, jd, 0.02 / 86400);
    } else if (prevVal > 0 && val <= 0 && result.set === undefined) {
      result.set = bisect((x) => -f(x), prevJd, jd, 0.02 / 86400);
    }
    prevJd = jd;
    prevVal = val;
  }

  result.alwaysUp = anyAbove && !anyBelow;
  result.alwaysDown = anyBelow && !anyAbove;

  // Refine the transit as the vertex of a parabola through the peak sample.
  const h = step;
  const a = altitudeFn(bestJd - h).altitude;
  const b = altitudeFn(bestJd).altitude;
  const c = altitudeFn(bestJd + h).altitude;
  const denom = a - 2 * b + c;
  result.transit = denom !== 0 ? bestJd - (h * (c - a)) / (2 * denom) : bestJd;
  return result;
}

export interface DayEvents {
  sunrise?: number;
  sunset?: number;
  solarNoon?: number;
  /** hours of daylight */
  dayLength: number;
  civilDawn?: number;
  civilDusk?: number;
  nauticalDawn?: number;
  nauticalDusk?: number;
  astronomicalDawn?: number;
  astronomicalDusk?: number;
  moonrise?: number;
  moonset?: number;
  polarDay: boolean;
  polarNight: boolean;
  maxSunAltitude: number;
}

/**
 * All Sun/Moon events for one local day.
 * @param jdLocalMidnight JD (UT) of the start of the local day
 */
export function dayEvents(jdLocalMidnight: number, observer: Observer): DayEvents {
  const sun = findRiseSet(jdLocalMidnight, (jd) => sunAltitude(jd, observer), 1, 2);
  const civil = findRiseSet(jdLocalMidnight, (jd) => sunAltitude(jd, observer, -6), 1, 2);
  const nautical = findRiseSet(jdLocalMidnight, (jd) => sunAltitude(jd, observer, -12), 1, 2);
  const astro = findRiseSet(jdLocalMidnight, (jd) => sunAltitude(jd, observer, -18), 1, 2);
  const moon = findRiseSet(jdLocalMidnight, (jd) => moonAltitude(jd, observer), 1, 4);

  const dayLength =
    sun.rise !== undefined && sun.set !== undefined
      ? ((sun.set > sun.rise ? sun.set - sun.rise : sun.set + 1 - sun.rise) * 24)
      : sun.alwaysUp
        ? 24
        : 0;

  return {
    sunrise: sun.rise,
    sunset: sun.set,
    solarNoon: sun.transit,
    dayLength,
    civilDawn: civil.rise,
    civilDusk: civil.set,
    nauticalDawn: nautical.rise,
    nauticalDusk: nautical.set,
    astronomicalDawn: astro.rise,
    astronomicalDusk: astro.set,
    moonrise: moon.rise,
    moonset: moon.set,
    polarDay: sun.alwaysUp,
    polarNight: sun.alwaysDown,
    maxSunAltitude: sun.maxAltitude,
  };
}
