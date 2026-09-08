/** Coordinate frames: ecliptic, equatorial, horizontal + nutation and obliquity. */
import { ARCSEC, DEG, RAD, clamp, cos, norm360, poly, sin } from './math';
import { centuries } from './time';

export interface Spherical {
  /** degrees */
  lon: number;
  /** degrees */
  lat: number;
  /** AU or km depending on the producer */
  dist: number;
}

export interface Equatorial {
  /** right ascension, degrees */
  ra: number;
  /** declination, degrees */
  dec: number;
  dist: number;
}

export interface Horizontal {
  /** azimuth measured from north, eastwards, degrees */
  az: number;
  /** altitude above the horizon, degrees */
  alt: number;
}

/** Mean obliquity of the ecliptic in degrees (IAU 1980 / Laskar). */
export function meanObliquity(jdtt: number): number {
  const u = centuries(jdtt) / 100;
  const seconds = poly(
    [21.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45],
    u,
  );
  return 23 + 26 / 60 + seconds / 3600;
}

export interface Nutation {
  /** nutation in longitude, degrees */
  dpsi: number;
  /** nutation in obliquity, degrees */
  deps: number;
}

/** Low precision nutation (Meeus ch. 22), accurate to ~0.5". */
export function nutation(jdtt: number): Nutation {
  const t = centuries(jdtt);
  const omega = 125.04452 - 1934.136261 * t;
  const l = 280.4665 + 36000.7698 * t;
  const lp = 218.3165 + 481267.8813 * t;
  const dpsi = -17.2 * sin(omega) - 1.32 * sin(2 * l) - 0.23 * sin(2 * lp) + 0.21 * sin(2 * omega);
  const deps = 9.2 * cos(omega) + 0.57 * cos(2 * l) + 0.1 * cos(2 * lp) - 0.09 * cos(2 * omega);
  return { dpsi: dpsi * ARCSEC * RAD, deps: deps * ARCSEC * RAD };
}

/** True obliquity = mean obliquity + nutation in obliquity, degrees. */
export function trueObliquity(jdtt: number): number {
  return meanObliquity(jdtt) + nutation(jdtt).deps;
}

export function eclipticToEquatorial(lon: number, lat: number, obliquity: number, dist = 1): Equatorial {
  const ra = Math.atan2(
    sin(lon) * cos(obliquity) - tanSafe(lat) * sin(obliquity),
    cos(lon),
  ) * RAD;
  const dec = Math.asin(
    clamp(sin(lat) * cos(obliquity) + cos(lat) * sin(obliquity) * sin(lon), -1, 1),
  ) * RAD;
  return { ra: norm360(ra), dec, dist };
}

function tanSafe(latDeg: number): number {
  return Math.tan(latDeg * DEG);
}

export function equatorialToEcliptic(ra: number, dec: number, obliquity: number, dist = 1): Spherical {
  const lon = Math.atan2(sin(ra) * cos(obliquity) + tanSafe(dec) * sin(obliquity), cos(ra)) * RAD;
  const lat = Math.asin(clamp(sin(dec) * cos(obliquity) - cos(dec) * sin(obliquity) * sin(ra), -1, 1)) * RAD;
  return { lon: norm360(lon), lat, dist };
}

/**
 * Equatorial -> horizontal.
 * @param hourAngle local hour angle in degrees
 * @param dec declination in degrees
 * @param latitude observer latitude in degrees
 */
export function equatorialToHorizontal(hourAngle: number, dec: number, latitude: number): Horizontal {
  const sinAlt = sin(dec) * sin(latitude) + cos(dec) * cos(latitude) * cos(hourAngle);
  const alt = Math.asin(clamp(sinAlt, -1, 1)) * RAD;
  // Azimuth measured from north, increasing towards east.
  const az = norm360(
    Math.atan2(
      -cos(dec) * sin(hourAngle),
      sin(dec) * cos(latitude) - cos(dec) * sin(latitude) * cos(hourAngle),
    ) * RAD,
  );
  return { az, alt };
}

/** Atmospheric refraction in degrees for an apparent altitude (Bennett). */
export function refraction(altitudeDeg: number): number {
  if (altitudeDeg < -2) return 0;
  const r = 1.02 / Math.tan((altitudeDeg + 10.3 / (altitudeDeg + 5.11)) * DEG);
  return r / 60;
}

export interface Observer {
  /** degrees, north positive */
  latitude: number;
  /** degrees, east positive */
  longitude: number;
  /** metres above sea level */
  elevation: number;
}

/**
 * Geocentric -> topocentric equatorial coordinates (Meeus ch. 40).
 * @param dist distance in AU
 */
export function toTopocentric(
  eq: Equatorial,
  observer: Observer,
  localSiderealTimeDeg: number,
): Equatorial {
  const parallaxSin = 8.794 / (eq.dist * 3600); // equatorial horizontal parallax, degrees
  const u = Math.atan(0.99664719 * Math.tan(observer.latitude * DEG));
  const rhoSinPhi =
    0.99664719 * Math.sin(u) + (observer.elevation / 6378140) * Math.sin(observer.latitude * DEG);
  const rhoCosPhi = Math.cos(u) + (observer.elevation / 6378140) * Math.cos(observer.latitude * DEG);
  const H = localSiderealTimeDeg - eq.ra;
  const denom = cos(eq.dec) - rhoCosPhi * sin(parallaxSin) * cos(H);
  const dRa = Math.atan2(-rhoCosPhi * sin(parallaxSin) * sin(H), denom) * RAD;
  const dec =
    Math.atan2((sin(eq.dec) - rhoSinPhi * sin(parallaxSin)) * cos(dRa), denom) * RAD;
  return { ra: norm360(eq.ra + dRa), dec, dist: eq.dist };
}

/** Rotate a heliocentric ecliptic vector into equatorial coordinates. */
export function eclipticVectorToEquatorial(v: [number, number, number], obliquity: number): [number, number, number] {
  const c = cos(obliquity);
  const s = sin(obliquity);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/**
 * Precess ecliptic coordinates from the J2000 frame to the mean equinox of
 * date (Meeus ch. 21). Positions from Keplerian element sets are referred to
 * J2000, while apparent sky coordinates are referred to the equinox of date.
 */
export function precessFromJ2000(lon: number, lat: number, jdtt: number): { lon: number; lat: number } {
  const t = centuries(jdtt);
  const t2 = t * t;
  const eta = (47.0029 * t - 0.03302 * t2 + 0.00006 * t2 * t) / 3600;
  const pi = 174.876384 - (869.8089 * t - 0.03536 * t2) / 3600;
  const p = (5029.0966 * t + 1.11113 * t2 - 0.000006 * t2 * t) / 3600;

  const A = cos(eta) * cos(lat) * sin(pi - lon) - sin(eta) * sin(lat);
  const B = cos(lat) * cos(pi - lon);
  const C = cos(eta) * sin(lat) + sin(eta) * cos(lat) * sin(pi - lon);
  return {
    lon: norm360(p + pi - Math.atan2(A, B) * RAD),
    lat: Math.asin(clamp(C, -1, 1)) * RAD,
  };
}
