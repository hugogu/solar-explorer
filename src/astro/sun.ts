/**
 * Solar position built on the truncated VSOP87D Earth series, with the FK5
 * correction, nutation and annual aberration applied. Accurate to a few
 * arcseconds, which keeps equinox instants and eclipse contacts within seconds.
 */
import { ARCSEC, RAD, cos, norm360, sin } from './math';
import { Equatorial, eclipticToEquatorial, nutation, trueObliquity } from './coords';
import { centuries } from './time';
import { earthVsop87 } from './vsop87-earth';

export interface SunPosition {
  /** apparent geocentric ecliptic longitude referred to the true equinox of date, degrees */
  lon: number;
  /** apparent geocentric ecliptic latitude, degrees */
  lat: number;
  /** geometric longitude before nutation and aberration, degrees */
  geometricLon: number;
  /** Earth-Sun distance in AU */
  dist: number;
  /** apparent angular radius in degrees */
  angularRadius: number;
}

export function sunPosition(jdtt: number): SunPosition {
  const t = centuries(jdtt);
  const earth = earthVsop87(jdtt);
  const theta = norm360(earth.L * RAD + 180);
  const beta = -earth.B * RAD;

  // VSOP87 -> FK5 (Meeus 25.9)
  const lambdaPrime = theta - 1.397 * t - 0.00031 * t * t;
  const dLon = -0.09033 * ARCSEC * RAD;
  const dLat = 0.03916 * (cos(lambdaPrime) - sin(lambdaPrime)) * ARCSEC * RAD;

  const geometricLon = norm360(theta + dLon);
  const aberration = (-20.4898 / earth.R) * ARCSEC * RAD;
  const lon = norm360(geometricLon + nutation(jdtt).dpsi + aberration);
  return {
    lon,
    lat: beta + dLat,
    geometricLon,
    dist: earth.R,
    angularRadius: 0.2665822 / earth.R,
  };
}

/** Apparent geocentric equatorial coordinates of the Sun. */
export function sunEquatorial(jdtt: number): Equatorial {
  const s = sunPosition(jdtt);
  return eclipticToEquatorial(s.lon, s.lat, trueObliquity(jdtt), s.dist);
}

/**
 * Equation of time in minutes: apparent solar time minus mean solar time.
 * Positive means a sundial runs ahead of the clock.
 */
export function equationOfTime(jdtt: number): number {
  const tau = (jdtt - 2451545.0) / 365250;
  const L0 = norm360(
    280.4664567 + 360007.6982779 * tau + 0.03032028 * tau * tau + (tau ** 3) / 49931 -
      (tau ** 4) / 15300 - (tau ** 5) / 2000000,
  );
  const eq = sunEquatorial(jdtt);
  const nut = nutation(jdtt);
  const eps = trueObliquity(jdtt);
  let e = L0 - 0.0057183 - eq.ra + nut.dpsi * cos(eps);
  e = ((((e + 180) % 360) + 360) % 360) - 180;
  return e * 4;
}
