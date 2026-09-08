/**
 * Mapping between the IAU body-fixed frame and the scene frame.
 *
 * Kept separate from the mesh code so the geometry can be unit tested without
 * touching the DOM: the same matrices place an observer on a planet's surface
 * and orient the rendered sphere.
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;
export const OBLIQUITY_J2000 = 23.4392911;

/** Equatorial J2000 -> ecliptic -> scene (y up). */
export const EQ_TO_SCENE = (() => {
  const eqToEcl = new THREE.Matrix4().makeRotationX(-OBLIQUITY_J2000 * DEG);
  const eclToScene = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  );
  return eclToScene.multiply(eqToEcl);
})();

/**
 * Body-fixed frame (Z = north pole, X = prime meridian) expressed in scene
 * coordinates: R = Rz(a0 + 90) Rx(90 - d0) Rz(W), per the IAU convention.
 */
export function iauFrame(ra0: number, dec0: number, w: number, target = new THREE.Matrix4()): THREE.Matrix4 {
  const m = target
    .makeRotationZ((ra0 + 90) * DEG)
    .multiply(new THREE.Matrix4().makeRotationX((90 - dec0) * DEG))
    .multiply(new THREE.Matrix4().makeRotationZ(w * DEG));
  return m.premultiply(EQ_TO_SCENE);
}

/**
 * Orientation for a rendered sphere. three.js spheres have their poles on +Y
 * and the generated maps put longitude 0 on -X, so the IAU frame is rotated by
 * a further 180 degrees about the pole and 90 degrees about X.
 */
export function orientationMatrix(ra0: number, dec0: number, w: number): THREE.Matrix4 {
  return iauFrame(ra0, dec0, w + 180).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
}

export interface SurfaceFrame {
  /** position on the body's surface, relative to its centre, in scene units */
  position: THREE.Vector3;
  /** local vertical */
  up: THREE.Vector3;
  /** local north, tangent to the surface */
  north: THREE.Vector3;
  /** local east, tangent to the surface */
  east: THREE.Vector3;
}

/**
 * Local horizon frame for an observer.
 * @param latitude planetocentric latitude, degrees
 * @param longitude east longitude from the prime meridian, degrees
 * @param radiusUnits body radius in scene units
 */
export function surfaceFrame(
  ra0: number,
  dec0: number,
  w: number,
  latitude: number,
  longitude: number,
  radiusUnits: number,
): SurfaceFrame {
  const frame = iauFrame(ra0, dec0, w);
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  const up = new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ).applyMatrix4(frame).normalize();
  const north = new THREE.Vector3(
    -Math.sin(lat) * Math.cos(lon),
    -Math.sin(lat) * Math.sin(lon),
    Math.cos(lat),
  ).applyMatrix4(frame).normalize();
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  return {
    position: up.clone().multiplyScalar(radiusUnits),
    up,
    north,
    east,
  };
}

/** Direction of a point in the sky given its azimuth and altitude, in degrees. */
export function horizonDirection(frame: SurfaceFrame, azimuth: number, altitude: number): THREE.Vector3 {
  const az = azimuth * DEG;
  const alt = altitude * DEG;
  return new THREE.Vector3()
    .addScaledVector(frame.north, Math.cos(alt) * Math.cos(az))
    .addScaledVector(frame.east, Math.cos(alt) * Math.sin(az))
    .addScaledVector(frame.up, Math.sin(alt))
    .normalize();
}

/** Azimuth and altitude, in degrees, of a direction expressed in scene coordinates. */
export function directionToHorizon(frame: SurfaceFrame, direction: THREE.Vector3): { azimuth: number; altitude: number } {
  const d = direction.clone().normalize();
  const n = d.dot(frame.north);
  const e = d.dot(frame.east);
  const u = d.dot(frame.up);
  return {
    azimuth: ((Math.atan2(e, n) / DEG) + 360) % 360,
    altitude: Math.asin(Math.max(-1, Math.min(1, u))) / DEG,
  };
}
