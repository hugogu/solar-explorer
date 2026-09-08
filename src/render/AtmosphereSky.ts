/**
 * Daytime sky for the first-person surface view.
 *
 * Uses the Preetham analytic daylight model shipped with three.js, rotated so
 * that "up" is the observer's local vertical rather than the world axis, and
 * blended additively: the model goes almost black once the Sun is below the
 * horizon, so the star field simply shows through at night and washes out as
 * the sky brightens at dawn.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export interface SkyProfile {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** overall multiplier applied to the model output */
  exposure: number;
  tint: THREE.Color;
}

/** Per-body atmospheres. Bodies not listed here get a black, airless sky. */
export const SKY_PROFILES: Record<string, SkyProfile> = {
  earth: {
    turbidity: 2.0,
    rayleigh: 3.4,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    exposure: 0.125,
    // The tone mapping desaturates the model output, so the tint pushes the
    // blue back towards what a clear sky actually looks like.
    tint: new THREE.Color(0.72, 0.9, 1.28),
  },
  // Mars: far less Rayleigh scattering and a lot of suspended dust, which is
  // why its daytime sky is butterscotch instead of blue.
  mars: {
    turbidity: 12,
    rayleigh: 0.32,
    mieCoefficient: 0.03,
    mieDirectionalG: 0.86,
    exposure: 0.11,
    tint: new THREE.Color(1.5, 1.02, 0.6),
  },
  titan: {
    turbidity: 20,
    rayleigh: 0.6,
    mieCoefficient: 0.05,
    mieDirectionalG: 0.9,
    exposure: 0.1,
    tint: new THREE.Color(1.35, 0.98, 0.42),
  },
};

export class AtmosphereSky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const sky = new Sky();
    this.mesh = sky as unknown as THREE.Mesh;
    this.material = sky.material as THREE.ShaderMaterial;
    // Drawn first in the opaque pass: it adds onto the star field that was
    // already there and the planet's surface then paints over it, which gives a
    // horizon without needing the depth buffer to agree across shaders.
    this.material.transparent = false;
    this.material.depthWrite = false;
    this.material.depthTest = false;
    this.material.blending = THREE.AdditiveBlending;
    this.material.uniforms.uTint = { value: new THREE.Color(1, 1, 1) };
    this.material.uniforms.uExposure = { value: 0.4 };
    this.material.fragmentShader = this.material.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'gl_FragColor = vec4( retColor * uTint * uExposure, 1.0 );',
    );
    this.material.fragmentShader =
      'uniform vec3 uTint;\nuniform float uExposure;\n' + this.material.fragmentShader;
    this.material.needsUpdate = true;
    this.mesh.scale.setScalar(1e6);
    this.mesh.renderOrder = -6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * @param up observer's local vertical, in scene coordinates
   * @param sunDirection unit vector from the observer towards the Sun
   */
  update(
    bodyId: string,
    cameraPosition: THREE.Vector3,
    up: THREE.Vector3,
    sunDirection: THREE.Vector3,
  ): void {
    const profile = SKY_PROFILES[bodyId];
    if (!profile) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(cameraPosition);
    const uniforms = this.material.uniforms;
    uniforms.turbidity.value = profile.turbidity;
    uniforms.rayleigh.value = profile.rayleigh;
    uniforms.mieCoefficient.value = profile.mieCoefficient;
    uniforms.mieDirectionalG.value = profile.mieDirectionalG;
    (uniforms.up.value as THREE.Vector3).copy(up);
    (uniforms.sunPosition.value as THREE.Vector3).copy(sunDirection);
    (uniforms.uTint.value as THREE.Color).copy(profile.tint);
    uniforms.uExposure.value = profile.exposure;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }
}
