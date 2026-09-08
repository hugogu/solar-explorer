/**
 * Time scales: Julian dates, UT <-> TT via delta-T, and sidereal time.
 * All "jd" values are Julian Days in UT unless the name says TT/TD.
 */
import { norm360, poly } from './math';

export const J2000 = 2451545.0;
export const DAY_MS = 86400000;
export const UNIX_EPOCH_JD = 2440587.5;

export function dateToJD(date: Date): number {
  return date.getTime() / DAY_MS + UNIX_EPOCH_JD;
}

export function jdToDate(jd: number): Date {
  return new Date(Math.round((jd - UNIX_EPOCH_JD) * DAY_MS));
}

/** Julian day from a UTC calendar date (Gregorian). */
export function utcToJD(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return dateToJD(new Date(Date.UTC(y, m - 1, d, h, min, s)));
}

/** Julian centuries from J2000. */
export function centuries(jd: number): number {
  return (jd - J2000) / 36525;
}

/** Decimal year, good enough for delta-T interpolation. */
export function decimalYear(jd: number): number {
  const d = jdToDate(jd);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

/**
 * TT - UT1 in seconds.
 * 1970-2025 uses observed values (5-year table, linearly interpolated); outside
 * that range the Espenak & Meeus polynomial expressions are used. Recent years
 * are essentially flat near 69 s because Earth's rotation sped up after 2020.
 */
const DELTA_T_TABLE: Array<[number, number]> = [
  [1970, 40.18], [1975, 45.48], [1980, 50.54], [1985, 54.34], [1990, 56.86],
  [1995, 60.78], [2000, 63.83], [2005, 64.69], [2010, 66.07], [2015, 67.64],
  [2020, 69.36], [2025, 69.2], [2030, 70.6],
];

export function deltaTSeconds(year: number): number {
  const first = DELTA_T_TABLE[0];
  const last = DELTA_T_TABLE[DELTA_T_TABLE.length - 1];
  if (year >= first[0] && year <= last[0]) {
    for (let i = 1; i < DELTA_T_TABLE.length; i++) {
      const [y1, v1] = DELTA_T_TABLE[i];
      if (year <= y1) {
        const [y0, v0] = DELTA_T_TABLE[i - 1];
        return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
      }
    }
  }
  if (year > last[0]) {
    if (year <= 2150) {
      // Blend smoothly out of the table into the long-term parabola.
      const u = (year - 1820) / 100;
      const parabola = -20 + 32 * u * u - 0.5628 * (2150 - year);
      const w = Math.min(1, (year - last[0]) / 60);
      return last[1] * (1 - w) + parabola * w;
    }
    const u = (year - 1820) / 100;
    return -20 + 32 * u * u;
  }
  if (year >= 1900) return poly([-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197], year - 1900);
  if (year >= 1860) {
    return poly([7.62, 0.5737, -0.251754, 0.01680668, -0.0004473624, 1 / 233174], year - 1860);
  }
  if (year >= 1800) {
    return poly(
      [13.72, -0.332447, 0.0068612, 0.0041116, -0.00037436, 0.0000121272, -0.0000001699, 0.000000000875],
      year - 1800,
    );
  }
  const u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Terrestrial Time JD from UT JD. */
export function jdToTT(jd: number): number {
  return jd + deltaTSeconds(decimalYear(jd)) / 86400;
}

/** UT JD from Terrestrial Time JD. */
export function ttToJD(jdtt: number): number {
  return jdtt - deltaTSeconds(decimalYear(jdtt)) / 86400;
}

/** Greenwich mean sidereal time in degrees, from a UT Julian day. */
export function gmst(jd: number): number {
  const t = centuries(jd);
  const theta =
    280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * t * t - (t * t * t) / 38710000;
  return norm360(theta);
}

/** Local mean sidereal time in degrees (east longitude positive). */
export function lmst(jd: number, longitudeEast: number): number {
  return norm360(gmst(jd) + longitudeEast);
}
