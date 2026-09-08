/**
 * Visual representation of one celestial body: the sphere itself plus optional
 * atmosphere shell, ring system, glow sprite and comet tails.
 */
import * as THREE from 'three';
import type { BodyInfo } from '../data';
import type { BodyState } from '../app/Simulation';
import { KM_PER_UNIT, ScaleSettings } from './frame';
import { generateRingTexture, generateSurface, radialSprite } from './textures/generators';
import { orientationMatrix } from './orientation';

export interface BodyViewOptions {
  /** texture width; height is half of it */
  textureSize: number;
  /** sphere tessellation */
  segments: number;
  /** photographic maps keyed by body id, when available */
  photoMaps?: Map<string, PhotoMaps>;
}

export interface PhotoMaps {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  specularMap?: THREE.Texture;
  cloudMap?: THREE.Texture;
  nightMap?: THREE.Texture;
}

export class BodyView {
  readonly group = new THREE.Group();
  readonly info: BodyInfo;
  readonly mesh: THREE.Mesh;
  /** the sphere plus everything that must spin with it */
  private readonly spin = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  private atmosphere?: THREE.Mesh;
  private clouds?: THREE.Mesh;
  private ringMesh?: THREE.Mesh;
  private glow?: THREE.Sprite;
  private coma?: THREE.Sprite;
  private tails?: THREE.Group;
  /** unscaled radius in scene units */
  readonly baseRadius: number;
  private oblateness = 1;

  constructor(info: BodyInfo, options: BodyViewOptions) {
    this.info = info;
    this.group.name = info.id;
    this.group.add(this.spin);
    this.baseRadius = info.physical.radiusKm / KM_PER_UNIT;

    const eq = info.physical.equatorialRadiusKm;
    if (eq) {
      const polar = (info.physical.radiusKm ** 3) / (eq * eq);
      this.oblateness = polar / eq;
    }

    const photo = options.photoMaps?.get(info.id);
    const generated = photo?.map ? undefined : generateSurface(info, options.textureSize, options.textureSize / 2);
    const map = photo?.map ?? generated?.map;
    const normalMap = photo?.normalMap ?? generated?.normalMap;

    const geometry = new THREE.SphereGeometry(1, options.segments, options.segments / 2);
    if (info.emissive) {
      this.material = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    } else {
      this.material = new THREE.MeshStandardMaterial({
        map,
        normalMap,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: info.kind === 'planet' && info.atmosphereColor ? 0.85 : 0.95,
        metalness: 0,
      });
      if (photo?.specularMap) {
        (this.material as THREE.MeshStandardMaterial).roughnessMap = photo.specularMap;
      }
      if (photo?.nightMap) this.applyNightLights(photo.nightMap);
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.userData.bodyId = info.id;
    this.spin.add(this.mesh);

    if (info.atmosphereColor) this.addAtmosphere(info.atmosphereColor);
    if (photo?.cloudMap) this.addClouds(photo.cloudMap);
    if (info.rings) this.addRings();
    if (info.emissive) this.addCorona();
    if (info.kind === 'comet') this.addComa();
  }

  /**
   * City lights on the night side: modulate the emissive contribution by how
   * much the surface faces away from the light.
   */
  private applyNightLights(nightMap: THREE.Texture): void {
    const material = this.material as THREE.MeshStandardMaterial;
    material.emissiveMap = nightMap;
    material.emissive = new THREE.Color(0xffd9a0);
    material.emissiveIntensity = 1.6;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         #if NUM_POINT_LIGHTS > 0
           vec3 lightDir = normalize(pointLights[0].position - vViewPosition * -1.0);
           float dayness = clamp(dot(normalize(vNormal), lightDir) * 4.0, 0.0, 1.0);
           totalEmissiveRadiance *= (1.0 - dayness);
         #endif`,
      );
    };
  }

  private addAtmosphere(color: string): void {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPower: { value: 3.0 },
        uIntensity: { value: 0.9 },
      },
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uIntensity;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        void main() {
          float rim = 1.0 - max(dot(vNormalView, vViewDir), 0.0);
          float a = pow(rim, uPower) * uIntensity;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.035, 48, 24), material);
    this.group.add(this.atmosphere);
  }

  private addClouds(cloudMap: THREE.Texture): void {
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.008, 64, 32),
      new THREE.MeshStandardMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        roughness: 1,
      }),
    );
    this.spin.add(this.clouds);
  }

  private addRings(): void {
    const ring = this.info.rings as NonNullable<BodyInfo['rings']>;
    const geometry = new THREE.RingGeometry(ring.inner, ring.outer, 192, 4);
    // Remap UVs so the texture runs radially.
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = (v.length() - ring.inner) / (ring.outer - ring.inner);
      uv.setXY(i, t, (i % 2) * 0.5 + 0.25);
    }
    const material = new THREE.MeshBasicMaterial({
      map: generateRingTexture(this.info),
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(geometry, material);
    this.ringMesh.rotation.x = Math.PI / 2;
    // Rings sit in the equatorial plane, so they follow the pole but not the spin.
    this.ringsHolder = new THREE.Group();
    this.ringsHolder.add(this.ringMesh);
    this.group.add(this.ringsHolder);
  }

  private ringsHolder?: THREE.Group;

  private addCorona(): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialSprite('#ffe6a8', 512, 3.2),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.scale.setScalar(6);
    this.glow = sprite;
    this.group.add(sprite);
  }

  private addComa(): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialSprite('#bfe6ff', 256, 2.0),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
      }),
    );
    this.coma = sprite;
    this.group.add(sprite);

    this.tails = new THREE.Group();
    const dustMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe2b0, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const ionMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fd0ff, transparent: true, opacity: 0.22, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (const [material, name] of [[dustMaterial, 'dust'], [ionMaterial, 'ion']] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), material);
      cone.name = name;
      // The cone points along +Y by default; aim it along +Z instead.
      cone.geometry.rotateX(Math.PI / 2);
      cone.geometry.translate(0, 0, 0.5);
      this.tails.add(cone);
    }
    this.group.add(this.tails);
  }

  /** Position, orient and size the body for the current frame. */
  update(state: BodyState, scale: ScaleSettings, scaledPosition: THREE.Vector3, sunDirection?: THREE.Vector3): void {
    this.group.position.copy(scaledPosition);

    const radius = this.baseRadius * scale.bodyScale;
    this.mesh.scale.set(radius, radius * this.oblateness, radius);
    if (this.clouds) this.clouds.scale.set(radius, radius * this.oblateness, radius);
    if (this.atmosphere) this.atmosphere.scale.set(radius, radius * this.oblateness, radius);

    const orientation = orientationMatrix(state.raDec0[0], state.raDec0[1], state.meridian);
    this.spin.quaternion.setFromRotationMatrix(orientation);
    if (this.ringsHolder) {
      // Rings ignore the spin: rebuild with W = 0.
      const ringOrientation = orientationMatrix(state.raDec0[0], state.raDec0[1], 0);
      this.ringsHolder.quaternion.setFromRotationMatrix(ringOrientation);
      this.ringsHolder.scale.setScalar(radius);
    }

    if (this.glow) this.glow.scale.setScalar(radius * 5.5);
    if (this.coma && sunDirection) this.updateComet(state, radius, sunDirection);

    if (!this.info.emissive) {
      // The map carries the colour, so tint only by how much sunlight arrives.
      const material = this.material as THREE.MeshStandardMaterial;
      material.color.setScalar(sunlightFactor(state.sunDistance));
    }
  }

  /** Comets grow a coma and two tails as they approach the Sun. */
  private updateComet(state: BodyState, radius: number, sunDirection: THREE.Vector3): void {
    const r = Math.max(0.05, state.sunDistance);
    const activity = Math.max(0, Math.min(1, (4.5 - r) / 4.0));
    const comaSize = radius * (8 + activity * 260);
    if (this.coma) {
      this.coma.scale.setScalar(comaSize);
      (this.coma.material as THREE.SpriteMaterial).opacity = 0.15 + activity * 0.75;
      this.coma.visible = activity > 0.01;
    }
    if (!this.tails) return;
    this.tails.visible = activity > 0.02;
    if (!this.tails.visible) return;

    // Tails point away from the Sun; the dust tail lags and is broader.
    const away = sunDirection.clone().negate();
    this.tails.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), away);
    const length = comaSize * (3 + activity * 14);
    for (const child of this.tails.children as THREE.Mesh[]) {
      const isIon = child.name === 'ion';
      child.scale.set(comaSize * (isIon ? 0.5 : 1.1), comaSize * (isIon ? 0.5 : 1.1), length * (isIon ? 1.5 : 1));
      (child.material as THREE.MeshBasicMaterial).opacity = (isIon ? 0.22 : 0.15) * activity;
    }
  }

  setLabelVisible(): void {
    // Labels live in the DOM overlay; kept here for API symmetry.
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.atmosphere?.geometry.dispose();
    this.ringMesh?.geometry.dispose();
  }
}

/**
 * How brightly a body reads at its distance from the Sun. True inverse-square
 * falloff would leave the outer planets invisible, so the contrast is
 * compressed while keeping the ordering intact.
 */
export function sunlightFactor(distanceAu: number): number {
  if (distanceAu <= 0) return 1;
  return Math.max(0.32, Math.min(2.0, Math.pow(1 / distanceAu, 0.34)));
}
