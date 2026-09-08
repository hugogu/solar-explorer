import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { directionToHorizon, iauFrame, surfaceFrame } from '../src/render/orientation';
import { ROTATION_MODELS } from '../src/astro/rotation';
import { earthHelio } from '../src/astro/planets';
import { moonGeocentricVector } from '../src/astro/moon';
import { dayEvents, sunAltitude } from '../src/astro/riseset';
import { jdToTT, utcToJD, gmst } from '../src/astro/time';
import { sunEquatorial } from '../src/astro/sun';
import { eclipticToEquatorial, nutation, precessFromJ2000, trueObliquity } from '../src/astro/coords';

const BEIJING = { latitude: 39.9042, longitude: 116.4074, elevation: 0 };
const EARTH_RADIUS_UNITS = 6.371;

/** Direction from the Earth to the Sun, expressed in scene coordinates. */
function sunDirectionScene(jdtt: number): THREE.Vector3 {
  const earth = earthHelio(jdtt, moonGeocentricVector(jdtt));
  // Ecliptic (z north) -> scene (y up).
  return new THREE.Vector3(-earth[0], -earth[2], earth[1]).normalize();
}

function observerFrame(jd: number) {
  const jdtt = jdToTT(jd);
  const r = ROTATION_MODELS.earth(jdtt);
  return surfaceFrame(r.ra0, r.dec0, r.w, BEIJING.latitude, BEIJING.longitude, EARTH_RADIUS_UNITS);
}

describe('the rendered Earth agrees with the ephemeris', () => {
  it("puts the Sun due south at Beijing's solar noon", () => {
    const events = dayEvents(utcToJD(2026, 6, 21) - 8 / 24, BEIJING);
    const noon = events.solarNoon as number;
    const frame = observerFrame(noon);
    const horizon = directionToHorizon(frame, sunDirectionScene(jdToTT(noon)));
    expect(Math.abs(horizon.azimuth - 180)).toBeLessThan(1.5);
    expect(horizon.altitude).toBeCloseTo(events.maxSunAltitude, 0);
  });

  it('agrees with the ephemeris altitude through a whole day', () => {
    const start = utcToJD(2026, 3, 15) - 8 / 24;
    for (let h = 0; h < 24; h += 1) {
      const jd = start + h / 24;
      const frame = observerFrame(jd);
      const geometric = directionToHorizon(frame, sunDirectionScene(jdToTT(jd)));
      const reference = sunAltitude(jd, BEIJING).altitude;
      // Both paths now share the same sidereal time and precession, so they
      // should agree to well under an arcminute.
      expect(Math.abs(geometric.altitude - reference)).toBeLessThan(0.02);
    }
  });

  it('puts the Sun on the eastern horizon at sunrise and the western at sunset', () => {
    const events = dayEvents(utcToJD(2026, 3, 20) - 8 / 24, BEIJING);
    const rise = directionToHorizon(observerFrame(events.sunrise as number), sunDirectionScene(jdToTT(events.sunrise as number)));
    const set = directionToHorizon(observerFrame(events.sunset as number), sunDirectionScene(jdToTT(events.sunset as number)));
    expect(rise.azimuth).toBeGreaterThan(60);
    expect(rise.azimuth).toBeLessThan(120);
    expect(set.azimuth).toBeGreaterThan(240);
    expect(set.azimuth).toBeLessThan(300);
    expect(Math.abs(rise.altitude)).toBeLessThan(1);
    expect(Math.abs(set.altitude)).toBeLessThan(1);
  });

  it('places the prime meridian where apparent sidereal time says it should be', () => {
    const jd = utcToJD(2026, 9, 8, 3, 0);
    const jdtt = jdToTT(jd);
    const r = ROTATION_MODELS.earth(jdtt);
    const frame = surfaceFrame(r.ra0, r.dec0, r.w, 0, 0, 1);
    // Scene -> ecliptic J2000 -> ecliptic of date -> right ascension of date.
    const v = frame.position;
    const eclJ2000 = new THREE.Vector3(v.x, -v.z, v.y).normalize();
    const lon = ((Math.atan2(eclJ2000.y, eclJ2000.x) * 180) / Math.PI + 360) % 360;
    const lat = (Math.asin(eclJ2000.z) * 180) / Math.PI;
    const ofDate = precessFromJ2000(lon, lat, jdtt);
    const eq = eclipticToEquatorial(ofDate.lon, ofDate.lat, trueObliquity(jdtt));
    // A point on the equator at longitude zero has a right ascension equal to
    // Greenwich apparent sidereal time.
    const gast = gmst(jd) + nutation(jdtt).dpsi * Math.cos((trueObliquity(jdtt) * Math.PI) / 180);
    const diff = Math.abs(((eq.ra - gast + 540) % 360) - 180);
    expect(diff).toBeLessThan(0.002);
  });

  it('keeps the IAU frame orthonormal', () => {
    const m = iauFrame(0, 90, 123.4);
    const x = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    const y = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
    const z = new THREE.Vector3(0, 0, 1).applyMatrix4(m);
    expect(x.length()).toBeCloseTo(1, 10);
    expect(x.dot(y)).toBeCloseTo(0, 10);
    expect(x.dot(z)).toBeCloseTo(0, 10);
    expect(new THREE.Vector3().crossVectors(x, y).dot(z)).toBeCloseTo(1, 10);
  });

  it('agrees with the geocentric declination of the Sun at the solstices', () => {
    const jdtt = jdToTT(utcToJD(2026, 6, 21, 8, 25));
    const eq = sunEquatorial(jdtt);
    expect(eq.dec).toBeGreaterThan(23.4);
    expect(eq.dec).toBeLessThan(23.5);
  });
});
