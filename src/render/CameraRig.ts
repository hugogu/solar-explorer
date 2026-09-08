/**
 * Camera behaviour: an orbiting third-person view that can lock onto any body,
 * and a first-person view standing on a planet's surface looking at its sky.
 */
import * as THREE from 'three';

export type CameraMode = 'orbit' | 'surface';

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/**
 * Near plane distances. Standing on a surface needs a near plane far smaller
 * than orbital viewing does; the logarithmic depth buffer copes with the range.
 */
const ORBIT_NEAR = 0.02;
const SURFACE_NEAR = 1e-6;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'orbit';

  /** world position the orbit camera looks at */
  readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  /** distance from the target, in scene units */
  distance = 4e5;
  private smoothDistance = 4e5;
  /** azimuth around the target, radians */
  azimuth = 0.6;
  /** polar angle from the +Y axis, radians */
  polar = 1.05;
  private smoothAzimuth = 0.6;
  private smoothPolar = 1.05;

  minDistance = 10;
  maxDistance = 6e7;

  /** first-person state, used in surface mode */
  readonly surfacePosition = new THREE.Vector3();
  surfaceAzimuth = 180;
  surfaceAltitude = 20;
  surfaceFov = 65;
  private surfaceUp = new THREE.Vector3(0, 1, 0);
  private surfaceNorth = new THREE.Vector3(0, 0, -1);
  private surfaceEast = new THREE.Vector3(1, 0, 0);

  /** 0 disables smoothing, 1 freezes the camera */
  damping = 0.12;
  /** set whenever the viewer rotates by hand; consumers clear it */
  userRotated = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, ORBIT_NEAR, 1e9);
    this.camera.position.set(0, 3e5, 6e5);
    this.smoothTarget.copy(this.target);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  rotate(deltaAzimuth: number, deltaPolar: number): void {
    if (deltaAzimuth !== 0 || deltaPolar !== 0) this.userRotated = true;
    if (this.mode === 'surface') {
      this.surfaceAzimuth = (this.surfaceAzimuth - deltaAzimuth * 40 + 360) % 360;
      this.surfaceAltitude = clamp(this.surfaceAltitude + deltaPolar * 40, -85, 89);
      return;
    }
    this.azimuth -= deltaAzimuth;
    this.polar = clamp(this.polar - deltaPolar, 0.02, Math.PI - 0.02);
  }

  zoom(factor: number): void {
    if (this.mode === 'surface') {
      this.surfaceFov = clamp(this.surfaceFov * factor, 8, 100);
      return;
    }
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Update the first-person basis; called each frame while on a surface. */
  setSurfaceFrame(position: THREE.Vector3, up: THREE.Vector3, north: THREE.Vector3, east: THREE.Vector3): void {
    this.surfacePosition.copy(position);
    this.surfaceUp.copy(up);
    this.surfaceNorth.copy(north);
    this.surfaceEast.copy(east);
  }

  /**
   * Frame a body of the given radius at a comfortable distance.
   * The clamp uses the new body's own size, not the minimum left over from
   * whatever was focused before.
   */
  frameBody(radiusUnits: number, multiplier = 4.2): void {
    this.minDistance = Math.max(0.05, radiusUnits * 1.12);
    this.distance = clamp(radiusUnits * multiplier, this.minDistance, this.maxDistance);
  }

  update(dt: number): void {
    const near = this.mode === 'surface' ? SURFACE_NEAR : ORBIT_NEAR;
    if (this.camera.near !== near) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.place(dt);
    this.commit();
  }

  /**
   * Publish the camera's new pose.
   *
   * three.js only refreshes `matrixWorldInverse` inside `render()`, so anything
   * that projects a world position before the frame is drawn - labels, the
   * location marker, click picking - would otherwise be working from the
   * previous frame's camera. While dragging that shows up as labels lagging
   * behind their bodies and snapping back when the motion stops.
   */
  private commit(): void {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
  }

  private place(dt: number): void {
    if (this.mode === 'surface') {
      const az = (this.surfaceAzimuth * Math.PI) / 180;
      const alt = (this.surfaceAltitude * Math.PI) / 180;
      const dir = new THREE.Vector3()
        .addScaledVector(this.surfaceNorth, Math.cos(alt) * Math.cos(az))
        .addScaledVector(this.surfaceEast, Math.cos(alt) * Math.sin(az))
        .addScaledVector(this.surfaceUp, Math.sin(alt));
      this.camera.position.copy(this.surfacePosition);
      this.camera.up.copy(this.surfaceUp);
      this.camera.lookAt(this.surfacePosition.clone().add(dir));
      if (Math.abs(this.camera.fov - this.surfaceFov) > 0.01) {
        this.camera.fov = this.camera.fov + (this.surfaceFov - this.camera.fov) * 0.25;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    if (Math.abs(this.camera.fov - 55) > 0.01) {
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
    // Frame-rate independent exponential smoothing.
    const k = 1 - Math.pow(this.damping, dt * 60);
    this.smoothTarget.lerp(this.target, k);
    this.smoothAzimuth += shortestAngle(this.smoothAzimuth, this.azimuth) * k;
    this.smoothPolar += (this.polar - this.smoothPolar) * k;
    this.smoothDistance *= Math.pow(this.distance / this.smoothDistance, k);

    const sinPolar = Math.sin(this.smoothPolar);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(
      this.smoothTarget.x + this.smoothDistance * sinPolar * Math.sin(this.smoothAzimuth),
      this.smoothTarget.y + this.smoothDistance * Math.cos(this.smoothPolar),
      this.smoothTarget.z + this.smoothDistance * sinPolar * Math.cos(this.smoothAzimuth),
    );
    this.camera.lookAt(this.smoothTarget);
  }

  /**
   * Match the smoothed orientation to the requested one without touching the
   * distance. Used while tracking a point on a spinning body, where the target
   * angle changes far faster than the damping could follow.
   */
  snapOrientation(): void {
    this.smoothAzimuth = this.azimuth;
    this.smoothPolar = this.polar;
  }

  /** Jump the smoothed state to the requested one, for instant transitions. */
  snap(): void {
    this.smoothTarget.copy(this.target);
    this.smoothAzimuth = this.azimuth;
    this.smoothPolar = this.polar;
    this.smoothDistance = this.distance;
  }

  get currentDistance(): number {
    return this.smoothDistance;
  }
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
