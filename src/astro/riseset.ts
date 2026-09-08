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

/** One sampled instant of the Sun's altitude. */
interface SunSample {
  jd: number;
  altitude: number;
}

/**
 * Crossings of one horizon, refined from a shared set of samples.
 *
 * The Sun's position is the expensive part and does not depend on which
 * horizon is being tested, so all four twilight levels reuse the same scan
 * and only pay for the handful of bisection steps around each crossing.
 */
function crossingsOf(
  samples: SunSample[],
  horizon: number,
  altitudeAt: (jd: number) => number,
): { rise?: number; set?: number } {
  const result: { rise?: number; set?: number } = {};
  const f = (jd: number) => altitudeAt(jd) - horizon;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1].altitude - horizon;
    const current = samples[i].altitude - horizon;
    if (previous <= 0 && current > 0 && result.rise === undefined) {
      result.rise = bisect(f, samples[i - 1].jd, samples[i].jd, 0.02 / 86400);
    } else if (previous > 0 && current <= 0 && result.set === undefined) {
      result.set = bisect((x) => -f(x), samples[i - 1].jd, samples[i].jd, 0.02 / 86400);
    }
  }
  return result;
}

/**
 * All Sun/Moon events for one local day.
 * @param jdLocalMidnight JD (UT) of the start of the local day
 */
export function dayEvents(jdLocalMidnight: number, observer: Observer): DayEvents {
  const altitudeAt = (jd: number) => sunAltitude(jd, observer).altitude;

  // Single pass over the day; every horizon is read off these samples. The
  // step only has to be fine enough not to step over a crossing - the times
  // themselves come from bisection afterwards.
  const stepMinutes = 4;
  const count = Math.round(1440 / stepMinutes);
  const samples: SunSample[] = [];
  let maxAltitude = -Infinity;
  let minAltitude = Infinity;
  let peakJd = jdLocalMidnight;
  for (let i = 0; i <= count; i++) {
    const jd = jdLocalMidnight + (i * stepMinutes) / 1440;
    const altitude = altitudeAt(jd);
    samples.push({ jd, altitude });
    if (altitude > maxAltitude) {
      maxAltitude = altitude;
      peakJd = jd;
    }
    if (altitude < minAltitude) minAltitude = altitude;
  }

  const daylight = crossingsOf(samples, -0.8333, altitudeAt);
  const civil = crossingsOf(samples, -6, altitudeAt);
  const nautical = crossingsOf(samples, -12, altitudeAt);
  const astro = crossingsOf(samples, -18, altitudeAt);
  const moon = findRiseSet(jdLocalMidnight, (jd) => moonAltitude(jd, observer), 1, 4);

  // Refine the transit as the vertex of a parabola through the peak sample.
  const h = stepMinutes / 1440;
  const a = altitudeAt(peakJd - h);
  const b = maxAltitude;
  const c = altitudeAt(peakJd + h);
  const denominator = a - 2 * b + c;
  const solarNoon = denominator !== 0 ? peakJd - (h * (c - a)) / (2 * denominator) : peakJd;

  const polarDay = minAltitude > -0.8333;
  const polarNight = maxAltitude <= -0.8333;
  const dayLength =
    daylight.rise !== undefined && daylight.set !== undefined
      ? (daylight.set > daylight.rise ? daylight.set - daylight.rise : daylight.set + 1 - daylight.rise) * 24
      : polarDay
        ? 24
        : 0;

  return {
    sunrise: daylight.rise,
    sunset: daylight.set,
    solarNoon,
    dayLength,
    civilDawn: civil.rise,
    civilDusk: civil.set,
    nauticalDawn: nautical.rise,
    nauticalDusk: nautical.set,
    astronomicalDawn: astro.rise,
    astronomicalDusk: astro.set,
    moonrise: moon.rise,
    moonset: moon.set,
    polarDay,
    polarNight,
    maxSunAltitude: maxAltitude,
  };
}
