/**
 * Solar activity: the sunspot cycle, the spot groups it produces, and the
 * prominences standing off the limb.
 *
 * Individual spots cannot be predicted, but their statistics can, and those
 * statistics are what a viewer actually recognises: the 11-year swell and ebb
 * of the cycle, groups living for days to weeks, the belts of activity drifting
 * from mid latitudes towards the equator as a cycle ages, and the equator
 * carrying spots round faster than the mean rotation the globe is drawn at.
 *
 * Everything here is a pure function of the Julian day, so the same instant
 * always produces the same Sun however the clock got there - forwards, backwards
 * or by jumping.
 */

/**
 * Observed cycles, from the SIDC international sunspot number (version 2.0):
 * the minimum that opens each cycle, the month it peaked, and the smoothed
 * number it reached.
 */
const CYCLES: Array<{ cycle: number; minimum: number; maximum: number; amplitude: number }> = [
  { cycle: 21, minimum: 2442960.5, maximum: 2444224.5, amplitude: 232.9 }, // 1976-06, 1979-12
  { cycle: 22, minimum: 2446674.5, maximum: 2447850.5, amplitude: 212.5 }, // 1986-09, 1989-11
  { cycle: 23, minimum: 2450297.5, maximum: 2452214.5, amplitude: 180.3 }, // 1996-08, 2001-11
  { cycle: 24, minimum: 2454801.5, maximum: 2456748.5, amplitude: 116.4 }, // 2008-12, 2014-04
  { cycle: 25, minimum: 2458818.5, maximum: 2460584.5, amplitude: 156.0 }, // 2019-12, 2024-10
];

/** Mean cycle length, used to extrapolate outside the recorded cycles. */
const CYCLE_DAYS = 11.0 * 365.25;
/** Rise and amplitude for an unrecorded cycle: the average of the recorded ones. */
const DEFAULT_RISE_DAYS = 4.6 * 365.25;
const DEFAULT_AMPLITUDE = 180;

/**
 * Hathaway's cycle shape, f(t) = t^3 / (exp(t^2/b^2) - c) with t in months.
 * Unlike a sine wave it rises in about four years and takes seven to fall away,
 * which is what makes a cycle recognisable on sight.
 */
const SHAPE_C = 0.71;

/**
 * Where f peaks, as a multiple of b. Solved once rather than hard-coded so the
 * constant cannot drift away from SHAPE_C.
 */
const PEAK_OVER_B = (() => {
  let best = 0;
  let at = 1;
  for (let k = 0.2; k < 3; k += 0.0005) {
    const v = (k * k * k) / (Math.exp(k * k) - SHAPE_C);
    if (v > best) { best = v; at = k; }
  }
  return at;
})();

const PEAK_VALUE = (PEAK_OVER_B ** 3) / (Math.exp(PEAK_OVER_B ** 2) - SHAPE_C);

/** Normalised 0..1 cycle profile, `riseMonths` after the minimum. */
function shape(months: number, riseMonths: number): number {
  if (months <= 0) return 0;
  const b = riseMonths / PEAK_OVER_B;
  const t = months / b;
  return (t * t * t) / (Math.exp(t * t) - SHAPE_C) / PEAK_VALUE;
}

export interface SolarCycleState {
  /** cycle number in the Zurich series */
  number: number;
  /** days since this cycle's minimum */
  daysIntoCycle: number;
  /** length of this cycle, days */
  lengthDays: number;
  /** smoothed international sunspot number */
  sunspotNumber: number;
  /** sunspot number scaled into 0..1 against a strong cycle */
  activity: number;
}

interface CycleBounds {
  cycle: number;
  start: number;
  length: number;
  riseDays: number;
  amplitude: number;
}

/** The cycle containing `jd`, extrapolated at mean length outside the table. */
function cycleBounds(jd: number): CycleBounds {
  const first = CYCLES[0];
  const last = CYCLES[CYCLES.length - 1];
  const extrapolated = (cycle: number, start: number): CycleBounds => ({
    cycle, start, length: CYCLE_DAYS, riseDays: DEFAULT_RISE_DAYS, amplitude: DEFAULT_AMPLITUDE,
  });
  if (jd < first.minimum) {
    const back = Math.ceil((first.minimum - jd) / CYCLE_DAYS);
    return extrapolated(first.cycle - back, first.minimum - back * CYCLE_DAYS);
  }
  if (jd >= last.minimum + CYCLE_DAYS) {
    const forward = Math.floor((jd - last.minimum) / CYCLE_DAYS);
    return extrapolated(last.cycle + forward, last.minimum + forward * CYCLE_DAYS);
  }
  for (let i = CYCLES.length - 1; i >= 0; i--) {
    const c = CYCLES[i];
    if (jd < c.minimum) continue;
    const next = CYCLES[i + 1];
    return {
      cycle: c.cycle,
      start: c.minimum,
      length: next ? next.minimum - c.minimum : CYCLE_DAYS,
      riseDays: c.maximum - c.minimum,
      amplitude: c.amplitude,
    };
  }
  return extrapolated(first.cycle, first.minimum);
}

export function solarCycle(jd: number): SolarCycleState {
  const { cycle, start, length, riseDays, amplitude } = cycleBounds(jd);
  const daysIntoCycle = jd - start;
  const sunspotNumber = shape(daysIntoCycle / 30.4375, riseDays / 30.4375) * amplitude;
  return {
    number: cycle,
    daysIntoCycle,
    lengthDays: length,
    sunspotNumber,
    activity: Math.min(1, sunspotNumber / 180),
  };
}

/**
 * Deterministic value in [0, 1) from two integers.
 *
 * A hash rather than a seeded generator because features are addressed by the
 * day they emerged: the same day must produce the same spot whether the clock
 * arrived there running forwards, backwards or in one jump.
 */
function rand(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Sidereal rotation rate at a heliographic latitude, degrees per day
 * (Snodgrass & Ulrich 1990). The Sun is fluid: the equator laps the poles about
 * every four months.
 */
export function rotationRate(latitudeDeg: number): number {
  const s = Math.sin((latitudeDeg * Math.PI) / 180) ** 2;
  return 14.713 - 2.396 * s - 1.787 * s * s;
}

/** Rate the rendered globe turns at, from the IAU rotation elements. */
const MEAN_ROTATION = 14.1844;

export interface Sunspot {
  /** heliographic latitude, degrees */
  latitude: number;
  /** heliographic east longitude in the drawn body frame, degrees */
  longitude: number;
  /** angular radius of the penumbra as seen from the Sun's centre, degrees */
  radius: number;
  /** 0..1: grows quickly after emergence, then decays */
  strength: number;
}

export interface Prominence {
  latitude: number;
  longitude: number;
  /** height above the photosphere, in solar radii */
  height: number;
  /** angular half-width along the limb, degrees */
  width: number;
  strength: number;
}

/** Longest group we model; older cells cannot still be alive. */
const SPOT_WINDOW_DAYS = 60;
/** Emergence slots per day. Four is enough for the busiest cycle maximum. */
const SLOTS = 4;

/**
 * Growth and decay envelope.
 *
 * Real groups appear over a day or two and take far longer to disperse, so the
 * rise is steep and the fall is a long shoulder.
 */
const GROWTH = 0.12;

function envelope(age: number): number {
  if (age <= 0 || age >= 1) return 0;
  if (age < GROWTH) return age / GROWTH;
  return Math.pow(1 - (age - GROWTH) / (1 - GROWTH), 0.6);
}

export function sunspots(jd: number, limit = 24): Sunspot[] {
  const spots: Sunspot[] = [];
  const today = Math.floor(jd);
  for (let day = today - SPOT_WINDOW_DAYS; day <= today; day++) {
    const cycle = solarCycle(day);
    // Groups per day at this point in the cycle; a strong maximum runs a little
    // over one a day, which with these lifetimes keeps a dozen or two on show.
    const rate = 0.05 + cycle.activity * 1.25;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (rand(day, slot) >= rate / SLOTS) continue;
      const birth = day + rand(day, slot + 11);
      const life = 2 + rand(day, slot + 23) ** 2 * 45;
      const age = (jd - birth) / life;
      const strength = envelope(age);
      if (strength <= 0.01) continue;

      // Spörer's law: a cycle opens at mid latitudes and works its way down.
      const through = Math.min(1, Math.max(0, cycle.daysIntoCycle / cycle.lengthDays));
      const belt = 8 + 20 * (1 - through);
      const scatter = (rand(day, slot + 37) + rand(day, slot + 41) - 1) * 7;
      const latitude = (rand(day, slot + 53) < 0.5 ? -1 : 1) * Math.max(2, belt + scatter);
      const born = rand(day, slot + 67) * 360;
      // The globe spins at the mean rate, so a spot has to carry the difference
      // itself. Equatorial groups creep forward, high-latitude ones fall back.
      const drift = (rotationRate(latitude) - MEAN_ROTATION) * (jd - birth);
      spots.push({
        latitude,
        longitude: (born + drift) % 360,
        // Heliographic radius of the whole group. One degree is 12,150 km at the
        // Sun, so this runs from a single spot up to the largest groups on
        // record. A group keeps most of its size while it fades.
        radius: (1.0 + rand(day, slot + 71) ** 2 * 6.0) * (0.45 + 0.55 * strength),
        strength,
      });
    }
  }
  // Biggest first, so a cap trims the ones nobody would notice.
  spots.sort((a, b) => b.radius * b.strength - a.radius * a.strength);
  return spots.slice(0, limit);
}

/** Prominences live in their own cells, at higher latitudes and for longer. */
const PROMINENCE_WINDOW_DAYS = 45;

export function prominences(jd: number, limit = 14): Prominence[] {
  const result: Prominence[] = [];
  const today = Math.floor(jd);
  for (let day = today - PROMINENCE_WINDOW_DAYS; day <= today; day++) {
    const cycle = solarCycle(day);
    const rate = 0.08 + cycle.activity * 0.7;
    for (let slot = 0; slot < 2; slot++) {
      if (rand(day, slot + 101) >= rate / 2) continue;
      const birth = day + rand(day, slot + 113);
      const life = 1.5 + rand(day, slot + 127) ** 2 * 30;
      const strength = envelope((jd - birth) / life);
      if (strength <= 0.02) continue;
      // Quiescent prominences reach well beyond the spot belts, right up to the
      // polar crown, so their latitudes are drawn from a much wider band.
      const latitude = (rand(day, slot + 131) < 0.5 ? -1 : 1) * (12 + rand(day, slot + 137) * 60);
      const drift = (rotationRate(latitude) - MEAN_ROTATION) * (jd - birth);
      result.push({
        latitude,
        longitude: (rand(day, slot + 149) * 360 + drift) % 360,
        // Quiescent prominences run from a few per cent of a solar radius to a
        // fifth of one. Height is set at birth; fading is left to the opacity.
        height: 0.03 + rand(day, slot + 151) ** 2 * 0.19,
        width: 3 + rand(day, slot + 157) * 9,
        strength,
      });
    }
  }
  result.sort((a, b) => b.height - a.height);
  return result.slice(0, limit);
}
