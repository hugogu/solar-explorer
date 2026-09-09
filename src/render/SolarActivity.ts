/**
 * Everything the Sun does that a picture of a plain sphere does not: the
 * corona, the glare, the prominences on the limb and the spots on the disc.
 *
 * The physics lives in `astro/solaractivity`, which is a pure function of the
 * clock. This file only draws what that returns, so scrubbing time backwards
 * shows the same Sun as scrubbing forwards, and running the clock at a year a
 * second plays the eleven-year cycle out in eleven seconds.
 */
import * as THREE from 'three';
import type { BodyState } from '../app/Simulation';
import { prominences, solarCycle, sunspots } from '../astro/solaractivity';
import type { BodyView } from './Bodies';
import { iauFrame, surfaceFrame } from './orientation';
import {
  CORONA_INNER, generateCoronaTexture, generateProminenceTexture, generateRayTexture,
} from './textures/solar';

/** Limb darkening coefficient for the Sun in visible light. */
const LIMB_DARKENING = 0.6;
/** Quads kept for prominences; spares are parked invisible rather than rebuilt. */
const PROMINENCE_SLOTS = 14;
/**
 * Activity is quantised before the corona is redrawn, and redraws are spaced
 * out in wall-clock time as well. Regenerating the texture costs a few
 * milliseconds, and at a decade a second the cycle would otherwise ask for one
 * every frame.
 */
const CORONA_STEPS = 12;
const CORONA_MIN_INTERVAL_MS = 250;

export interface SolarActivityFrame {
  jd: number;
  state: BodyState;
  view: BodyView;
  /** the Sun's centre in scene coordinates */
  position: THREE.Vector3;
  /** drawn radius in scene units, including any size exaggeration */
  radius: number;
  camera: THREE.Camera;
  enabled: boolean;
}

export class SolarActivity {
  readonly group = new THREE.Group();
  private readonly corona: THREE.Sprite;
  private readonly rays: THREE.Sprite;
  private readonly prominenceGroup = new THREE.Group();
  private readonly prominenceQuads: THREE.Mesh[] = [];
  private coronaStep = -1;
  private coronaDrawnAt = 0;
  private readonly north = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();

  constructor() {
    this.group.name = 'solar-activity';
    this.corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: generateCoronaTexture(0.5, 256),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.rays = new THREE.Sprite(new THREE.SpriteMaterial({
      map: generateRayTexture(512),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    // Depth-tested, so the disc masks the middle of the sprite and the spikes
    // appear to come out from behind the limb. Drawn without it they lay a
    // bright cross straight across the photosphere.
    this.rays.renderOrder = 2;

    const prominenceMap = generateProminenceTexture();
    // The pivot sits on the bottom edge so a quad can stand on the photosphere.
    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    for (let i = 0; i < PROMINENCE_SLOTS; i++) {
      const quad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        map: prominenceMap,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }));
      quad.visible = false;
      this.prominenceQuads.push(quad);
      this.prominenceGroup.add(quad);
    }
    this.group.add(this.corona, this.rays, this.prominenceGroup);
  }

  update(frame: SolarActivityFrame): void {
    this.group.visible = frame.enabled;
    if (!frame.enabled) {
      frame.view.setSunspots([], 0);
      return;
    }
    this.group.position.copy(frame.position);

    const cycle = solarCycle(frame.jd);
    frame.view.setSunspots(sunspots(frame.jd), LIMB_DARKENING);
    this.updateCorona(cycle.activity, frame);
    this.updateProminences(frame);
  }

  private updateCorona(activity: number, frame: SolarActivityFrame): void {
    const step = Math.round(activity * CORONA_STEPS);
    const now = performance.now();
    if (step !== this.coronaStep && now - this.coronaDrawnAt > CORONA_MIN_INTERVAL_MS) {
      this.coronaStep = step;
      this.coronaDrawnAt = now;
      this.corona.material.map?.dispose();
      this.corona.material.map = generateCoronaTexture(step / CORONA_STEPS, 256);
      this.corona.material.needsUpdate = true;
    }

    // The texture is drawn with the rotation axis pointing up, so the sprite has
    // to be turned to match wherever that axis lands on screen.
    this.north.set(0, 0, 1)
      .applyMatrix4(iauFrame(frame.state.raDec0[0], frame.state.raDec0[1], 0))
      .normalize()
      .transformDirection(frame.camera.matrixWorldInverse);
    this.corona.material.rotation = Math.atan2(this.north.y, this.north.x) - Math.PI / 2;

    // The texture puts the photosphere at CORONA_INNER of its half-width.
    this.corona.scale.setScalar((frame.radius * 2) / CORONA_INNER);
    this.corona.material.opacity = 0.6 + 0.3 * activity;

    // Glare is an artefact of the eye, not of the Sun: enough to say "too
    // bright to look at" and no more.
    this.rays.scale.setScalar(frame.radius * (7 + 5 * activity));
    this.rays.material.opacity = 0.08 + 0.10 * activity;
  }

  private updateProminences(frame: SolarActivityFrame): void {
    const list = prominences(frame.jd, PROMINENCE_SLOTS);
    for (let i = 0; i < this.prominenceQuads.length; i++) {
      const quad = this.prominenceQuads[i];
      const p = list[i];
      if (!p) {
        quad.visible = false;
        continue;
      }
      const local = surfaceFrame(
        frame.state.raDec0[0], frame.state.raDec0[1], frame.state.meridian,
        p.latitude, p.longitude, frame.radius,
      );
      // Prominences read as loops only against the sky. On the near side of the
      // disc a real one appears as a dark filament instead, so fade them out
      // there and let the sphere's own depth hide the far side.
      this.toCamera.copy(frame.camera.position).sub(this.group.position).sub(local.position).normalize();
      const facingUs = this.toCamera.dot(local.up);
      const edge = 1 - THREE.MathUtils.smoothstep(facingUs, 0.02, 0.42);
      if (edge <= 0.01) {
        quad.visible = false;
        continue;
      }

      // Stand the quad on the surface and roll it about the local vertical
      // until it faces the camera.
      this.right.crossVectors(local.up, this.toCamera);
      if (this.right.lengthSq() < 1e-12) this.right.set(1, 0, 0);
      this.right.normalize();
      this.facing.crossVectors(this.right, local.up);
      this.basis.makeBasis(this.right, local.up, this.facing);
      quad.quaternion.setFromRotationMatrix(this.basis);
      quad.position.copy(local.position);

      const height = frame.radius * p.height;
      quad.scale.set(frame.radius * Math.sin((p.width * Math.PI) / 180) * 2.4, height, 1);
      (quad.material as THREE.MeshBasicMaterial).opacity = p.strength * edge;
      quad.visible = true;
    }
  }
}
