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
import type { Sunspot } from '../astro/solaractivity';

const DEG = Math.PI / 180;
/** Spot groups the photosphere shader carries; the model offers more than this. */
export const MAX_SUNSPOTS = 16;

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
  /** radial strip for a ring system, with alpha */
  ringMap?: THREE.Texture;
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
  private marker?: THREE.Sprite;
  private coma?: THREE.Sprite;
  private tails?: THREE.Group;
  /** unscaled radius in scene units */
  readonly baseRadius: number;
  /** true until a procedural surface has been generated for this body */
  needsGeneratedSurface = false;
  private textureSize = 512;
  /**
   * Eclipse shading uniforms. Everything is expressed in this body's own radii
   * and in true, unscaled geometry, so the shadow stays physically correct even
   * when the scene is showing exaggerated sizes and compressed distances.
   */
  private readonly eclipseUniforms = {
    uEclipseSunRel: { value: new THREE.Vector3(1e6, 0, 0) },
    uEclipseSunRadius: { value: 1 },
    uEclipseCasterRel: { value: new THREE.Vector3(0, 0, 1e9) },
    uEclipseCasterRadius: { value: 0 },
    uEclipseStrength: { value: 0 },
  };
  private oblateness = 1;
  /**
   * Photosphere shading for the Sun: limb darkening, and up to MAX_SUNSPOTS
   * groups given as unit directions in the body frame with their angular radii.
   */
  private readonly sunUniforms = {
    uSpots: { value: Array.from({ length: MAX_SUNSPOTS }, () => new THREE.Vector4(0, 1, 0, 0)) },
    uSpotFade: { value: new Float32Array(MAX_SUNSPOTS) },
    uSpotCount: { value: 0 },
    uLimbDarkening: { value: 0 },
  };

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
    this.needsGeneratedSurface = !photo?.map;
    this.textureSize = options.textureSize;

    const geometry = new THREE.SphereGeometry(1, options.segments, options.segments / 2);
    // Bodies start as flat colour and receive their generated surface later, so
    // the first frame arrives without waiting on any texture work. three.js
    // warns about explicitly undefined map parameters, hence the conditionals.
    const baseColor = photo?.map ? new THREE.Color(0xffffff) : new THREE.Color(info.color);
    if (info.emissive) {
      this.material = new THREE.MeshBasicMaterial({ color: baseColor });
      if (photo?.map) this.material.map = photo.map;
    } else {
      const standard = new THREE.MeshStandardMaterial({
        color: baseColor,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: info.kind === 'planet' && info.atmosphereColor ? 0.85 : 0.95,
        metalness: 0,
      });
      if (photo?.map) standard.map = photo.map;
      if (photo?.normalMap) standard.normalMap = photo.normalMap;
      this.material = standard;
      if (photo?.specularMap) {
        (this.material as THREE.MeshStandardMaterial).roughnessMap = photo.specularMap;
      }
      if (photo?.nightMap) this.applyNightLights(photo.nightMap);
      this.applyEclipseShading();
    }
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.userData.bodyId = info.id;
    this.spin.add(this.mesh);

    if (info.emissive) this.applyPhotosphereShading();
    this.addMarker();
    if (info.atmosphereColor) this.addAtmosphere(info.atmosphereColor);
    if (photo?.cloudMap) this.addClouds(photo.cloudMap);
    if (info.rings) this.addRings(photo?.ringMap);
    if (info.emissive) this.addGlow();
    if (info.kind === 'comet') this.addComa();
  }

  /**
   * Limb darkening and sunspots for a self-luminous surface.
   *
   * A star is not a flat disc: the line of sight at the edge only reaches the
   * cooler upper photosphere, so the limb is markedly dimmer than the centre.
   * Spots ride on top of that as an umbra at roughly a sixth of the surrounding
   * brightness inside a penumbra at about two thirds.
   */
  private applyPhotosphereShading(): void {
    const material = this.material as THREE.MeshBasicMaterial;
    // Programs are cached by material parameters, not by the source an
    // onBeforeCompile hook injects, so without a key of its own this material
    // silently reuses the program compiled for the rings or the prominences.
    material.customProgramCacheKey = () => 'photosphere';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.sunUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSunNormal;
           varying vec3 vSunNormalView;
           varying vec3 vSunViewDir;`,
        )
        // The mesh is a unit sphere, so its position is also its normal, and a
        // basic material does not compute normals unless something asks for them.
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vSunNormal = normalize(position);
           vSunNormalView = normalize(normalMatrix * position);
           vSunViewDir = normalize(-mvPosition.xyz);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSunNormal;
           varying vec3 vSunNormalView;
           varying vec3 vSunViewDir;
           uniform vec4 uSpots[${MAX_SUNSPOTS}];
           uniform float uSpotFade[${MAX_SUNSPOTS}];
           uniform int uSpotCount;
           uniform float uLimbDarkening;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float mu = max(dot(vSunNormalView, vSunViewDir), 0.0);
           float photosphere = 1.0 - uLimbDarkening * (1.0 - mu);
           for (int i = 0; i < ${MAX_SUNSPOTS}; i++) {
             if (i >= uSpotCount) break;
             vec4 spot = uSpots[i];
             float ang = acos(clamp(dot(vSunNormal, spot.xyz), -1.0, 1.0));
             // A group's umbra fills roughly the inner half of its penumbra,
             // and runs at about a fifth of the surrounding brightness.
             float penumbra = 1.0 - smoothstep(spot.w * 0.82, spot.w, ang);
             float umbra = 1.0 - smoothstep(spot.w * 0.36, spot.w * 0.52, ang);
             float shade = mix(1.0, 0.55, penumbra * uSpotFade[i]);
             shade = mix(shade, 0.10, umbra * uSpotFade[i]);
             photosphere = min(photosphere, shade * (1.0 - uLimbDarkening * (1.0 - mu)));
           }
           diffuseColor.rgb *= photosphere;`,
        );
    };
    material.needsUpdate = true;
  }

  /**
   * Hand the current spot groups to the shader.
   * @param spots heliographic positions in the body-fixed frame
   * @param limbDarkening 0 for a flat disc, about 0.6 for the Sun in visible light
   */
  setSunspots(spots: Sunspot[], limbDarkening: number): void {
    const u = this.sunUniforms;
    const count = Math.min(spots.length, MAX_SUNSPOTS);
    for (let i = 0; i < count; i++) {
      const { latitude, longitude, radius, strength } = spots[i];
      const lat = latitude * DEG;
      const lon = longitude * DEG;
      // Body frame to mesh object space: the sphere's pole is +Y and longitude
      // zero is +X, so (x, y, z) = (cos lat cos lon, sin lat, -cos lat sin lon).
      (u.uSpots.value[i] as THREE.Vector4).set(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        -Math.cos(lat) * Math.sin(lon),
        Math.max(0.002, radius * DEG),
      );
      (u.uSpotFade.value as Float32Array)[i] = strength;
    }
    u.uSpotCount.value = count;
    u.uLimbDarkening.value = limbDarkening;
  }

  /**
   * Darken the surface where another body blocks part of the Sun.
   *
   * The fraction of the solar disc hidden is worked out per fragment from the
   * true angular radii and separation, which is what makes the umbra, the
   * penumbra and the ring of an annular eclipse all fall out of one formula.
   */
  private applyEclipseShading(): void {
    const material = this.material as THREE.MeshStandardMaterial;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.eclipseUniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEclipseNormal;')
        .replace(
          '#include <defaultnormal_vertex>',
          '#include <defaultnormal_vertex>\nvEclipseNormal = normalize(mat3(modelMatrix) * objectNormal);',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vEclipseNormal;
           uniform vec3 uEclipseSunRel;
           uniform float uEclipseSunRadius;
           uniform vec3 uEclipseCasterRel;
           uniform float uEclipseCasterRadius;
           uniform float uEclipseStrength;

           float eclipseCoverage() {
             if (uEclipseStrength <= 0.0 || uEclipseCasterRadius <= 0.0) return 0.0;
             vec3 p = normalize(vEclipseNormal);
             vec3 toSun = uEclipseSunRel - p;
             vec3 toCaster = uEclipseCasterRel - p;
             float dSun = length(toSun);
             float dCaster = length(toCaster);
             if (dCaster >= dSun) return 0.0;
             float rSun = asin(clamp(uEclipseSunRadius / dSun, 0.0, 1.0));
             float rCaster = asin(clamp(uEclipseCasterRadius / dCaster, 0.0, 1.0));
             float sep = acos(clamp(dot(toSun / dSun, toCaster / dCaster), -1.0, 1.0));
             if (sep >= rSun + rCaster) return 0.0;
             if (sep <= abs(rSun - rCaster)) {
               float ratio = rCaster / rSun;
               return clamp(ratio * ratio, 0.0, 1.0);
             }
             // Area of the lens shared by the two discs, over the Sun's area.
             float a1 = acos(clamp((sep * sep + rSun * rSun - rCaster * rCaster) / (2.0 * sep * rSun), -1.0, 1.0));
             float a2 = acos(clamp((sep * sep + rCaster * rCaster - rSun * rSun) / (2.0 * sep * rCaster), -1.0, 1.0));
             float lens = rSun * rSun * (a1 - sin(2.0 * a1) * 0.5)
                        + rCaster * rCaster * (a2 - sin(2.0 * a2) * 0.5);
             return clamp(lens / (PI * rSun * rSun), 0.0, 1.0);
           }`,
        )
        .replace(
          '#include <output_fragment>',
          `float eclipseShade = 1.0 - eclipseCoverage() * uEclipseStrength;
           outgoingLight *= eclipseShade;
           #include <output_fragment>`,
        );
    };
    material.needsUpdate = true;
  }

  /**
   * @param sunRelative Sun position relative to this body's centre, in body radii
   * @param sunRadius Sun radius in this body's radii
   * @param casterRelative shadow caster position relative to this body's centre
   * @param casterRadius caster radius in this body's radii
   */
  setEclipseCaster(
    sunRelative: THREE.Vector3,
    sunRadius: number,
    casterRelative: THREE.Vector3 | null,
    casterRadius: number,
  ): void {
    const u = this.eclipseUniforms;
    u.uEclipseSunRel.value.copy(sunRelative);
    u.uEclipseSunRadius.value = sunRadius;
    if (casterRelative) {
      u.uEclipseCasterRel.value.copy(casterRelative);
      u.uEclipseCasterRadius.value = casterRadius;
      u.uEclipseStrength.value = 0.985;
    } else {
      u.uEclipseCasterRadius.value = 0;
      u.uEclipseStrength.value = 0;
    }
  }

  /** Swap in the procedurally generated surface once it has been built. */
  generateSurfaceNow(): void {
    if (!this.needsGeneratedSurface) return;
    this.needsGeneratedSurface = false;
    const maps = generateSurface(this.info, this.textureSize, this.textureSize / 2);
    this.material.map = maps.map;
    this.material.color.setScalar(1);
    if (!this.info.emissive && maps.normalMap) {
      (this.material as THREE.MeshStandardMaterial).normalMap = maps.normalMap;
    }
    this.material.needsUpdate = true;
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

  /**
   * A soft dot that keeps the body visible when its disc is smaller than a
   * pixel - the same trick planetarium software uses so distant worlds do not
   * simply vanish.
   */
  private addMarker(): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialSprite(this.info.emissive ? '#fff0c8' : this.info.color, 64, 2.2),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
      }),
    );
    sprite.renderOrder = 5;
    this.marker = sprite;
    this.group.add(sprite);
  }

  /**
   * @param worldSize diameter, in scene units, that renders as the minimum
   *   readable dot at the body's current distance
   * @param occluded true when something nearer is in the way
   */
  updateMarker(worldSize: number, bodyWorldSize: number, occluded = false): void {
    if (!this.marker) return;
    const visible = bodyWorldSize < worldSize && !occluded;
    this.marker.visible = visible;
    if (!visible) return;
    this.marker.scale.setScalar(worldSize * 2.6);
    const fade = Math.min(1, worldSize / Math.max(bodyWorldSize, 1e-6) / 3);
    (this.marker.material as THREE.SpriteMaterial).opacity = 0.35 + 0.5 * Math.min(1, fade);
  }

  /**
   * Atmospheric limb glow. Drawn on the front face of a slightly larger shell:
   * the rim term peaks at the silhouette edge and the sunward term keeps the
   * night side dark, so the halo hugs the lit crescent the way it really does.
   */
  private addAtmosphere(color: string): void {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPower: { value: 3.2 },
        uIntensity: { value: 1.15 },
        uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uIntensity;
        uniform vec3 uSunDirection;
        varying vec3 vNormalView;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        void main() {
          #include <logdepthbuf_fragment>
          float rim = 1.0 - max(dot(vNormalView, vViewDir), 0.0);
          float lit = clamp(dot(vWorldNormal, uSunDirection) * 1.6 + 0.35, 0.0, 1.0);
          float a = pow(rim, uPower) * uIntensity * lit;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.045, 48, 24), material);
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

  private addRings(photoRing?: THREE.Texture): void {
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
      map: photoRing ?? generateRingTexture(this.info),
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

  private addGlow(): void {
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

    if (this.atmosphere && sunDirection) {
      const uniforms = (this.atmosphere.material as THREE.ShaderMaterial).uniforms;
      (uniforms.uSunDirection.value as THREE.Vector3).copy(sunDirection);
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
