/**
 * The sky: a star field and the Milky Way, both placed using the real galactic
 * frame so the band runs where it actually does in our sky.
 */
import * as THREE from 'three';
import { fbm3, makeRandom, ridged3 } from './textures/noise';
import { equatorialVectorToGalactic } from '../astro/coords';
import { equirectDirection } from './textures/noise';

const DEG = Math.PI / 180;
/** North galactic pole and the galactic longitude of the celestial pole (J2000). */
const NGP_RA = 192.85948 * DEG;
const NGP_DEC = 27.12825 * DEG;
const L_NCP = 122.93192 * DEG;
const OBLIQUITY = 23.4392911 * DEG;

/** Galactic (l, b) in radians to a unit vector in the scene frame. */
function galacticToScene(l: number, b: number): THREE.Vector3 {
  const sinDec = Math.sin(b) * Math.sin(NGP_DEC) + Math.cos(b) * Math.cos(NGP_DEC) * Math.cos(L_NCP - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(b) * Math.sin(L_NCP - l);
  const x = Math.sin(b) * Math.cos(NGP_DEC) - Math.cos(b) * Math.sin(NGP_DEC) * Math.cos(L_NCP - l);
  const ra = Math.atan2(y, x) + NGP_RA;

  // Equatorial -> ecliptic -> scene (y up).
  const ex = Math.cos(dec) * Math.cos(ra);
  const ey = Math.cos(dec) * Math.sin(ra);
  const ez = Math.sin(dec);
  const lx = ex;
  const ly = ey * Math.cos(OBLIQUITY) + ez * Math.sin(OBLIQUITY);
  const lz = -ey * Math.sin(OBLIQUITY) + ez * Math.cos(OBLIQUITY);
  return new THREE.Vector3(lx, lz, -ly);
}

/** Galactic coordinates, in degrees, of a direction given in the scene frame. */
function sceneToGalactic(x: number, y: number, z: number): { l: number; b: number } {
  // Scene -> ecliptic.
  const ex = x;
  const ey = -z;
  const ez = y;
  // Ecliptic -> equatorial.
  const q: [number, number, number] = [
    ex,
    ey * Math.cos(OBLIQUITY) - ez * Math.sin(OBLIQUITY),
    ey * Math.sin(OBLIQUITY) + ez * Math.cos(OBLIQUITY),
  ];
  return equatorialVectorToGalactic(q);
}

/** Blackbody-ish star colours from a temperature class in [0, 1]. */
function starColor(t: number): THREE.Color {
  if (t < 0.08) return new THREE.Color(0.62, 0.72, 1.0); // O/B
  if (t < 0.2) return new THREE.Color(0.78, 0.85, 1.0); // A
  if (t < 0.42) return new THREE.Color(1.0, 0.98, 0.92); // F
  if (t < 0.68) return new THREE.Color(1.0, 0.94, 0.78); // G
  if (t < 0.86) return new THREE.Color(1.0, 0.82, 0.62); // K
  return new THREE.Color(1.0, 0.68, 0.52); // M
}

export interface SkyOptions {
  radius: number;
  starCount: number;
  milkyWayResolution: number;
}

export class Sky {
  readonly group = new THREE.Group();
  private readonly stars: THREE.Points;
  private readonly milkyWay: THREE.Mesh;

  constructor(options: SkyOptions) {
    const { radius, starCount } = options;
    this.group.name = 'sky';

    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const rand = makeRandom(20240408);

    for (let i = 0; i < starCount; i++) {
      // Two populations: a disc concentrated on the galactic plane and a halo.
      const inDisc = rand() < 0.62;
      const l = rand() * Math.PI * 2;
      const b = inDisc
        ? (rand() + rand() + rand() - 1.5) * 0.24 // roughly gaussian, sigma ~8 deg
        : Math.asin(rand() * 2 - 1);
      const dir = galacticToScene(l, b);
      positions[i * 3] = dir.x * radius;
      positions[i * 3 + 1] = dir.y * radius;
      positions[i * 3 + 2] = dir.z * radius;

      const c = starColor(rand());
      // A few bright stars, many faint ones.
      const brightness = Math.pow(rand(), 2.6);
      colors[i * 3] = c.r * (0.35 + brightness);
      colors[i * 3 + 1] = c.g * (0.35 + brightness);
      colors[i * 3 + 2] = c.b * (0.35 + brightness);
      // Stars sit at a fixed distance, so their size is simply a pixel radius.
      sizes[i] = 1.0 + brightness * 2.6;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: Math.min(2, window.devicePixelRatio || 1) },
        uBrightness: { value: 1 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float starSize;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = starSize * uScale;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uBrightness;
        varying vec3 vColor;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.0, r);
          a *= a * uBrightness;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geometry, material);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -10;
    this.group.add(this.stars);

    this.milkyWay = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.98, 48, 32),
      new THREE.MeshBasicMaterial({
        map: generateMilkyWayTexture(options.milkyWayResolution),
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.34,
      }),
    );
    this.milkyWay.renderOrder = -11;
    this.milkyWay.frustumCulled = false;
    this.group.add(this.milkyWay);
  }

  /** Keep the sky centred on the camera so it behaves like an infinite backdrop. */
  update(cameraPosition: THREE.Vector3): void {
    this.group.position.copy(cameraPosition);
  }

  setVisible(stars: boolean, milkyWay: boolean): void {
    this.stars.visible = stars;
    this.milkyWay.visible = milkyWay;
  }

  /**
   * Fade the sky background as daylight grows.
   * @param factor 1 in full darkness, 0 in full daylight
   */
  setNightFactor(factor: number): void {
    const f = Math.max(0, Math.min(1, factor));
    (this.stars.material as THREE.ShaderMaterial).uniforms.uBrightness.value = f;
    (this.milkyWay.material as THREE.MeshBasicMaterial).opacity = 0.34 * f;
  }

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.milkyWay.geometry.dispose();
    (this.milkyWay.material as THREE.Material).dispose();
  }
}

/**
 * The Milky Way, drawn in the scene frame.
 *
 * The brightness has to vary with galactic *longitude*, not just latitude:
 * looking towards Sagittarius we see through the bulge and the whole depth of
 * the disc, while towards the anticentre in Taurus there is little galaxy left
 * in front of us. A latitude-only model gives a band of uniform brightness and
 * thickness all the way round, which reads as one piece of texture tiled in a
 * ring rather than as a galaxy seen edge on.
 */
function generateMilkyWayTexture(width: number): THREE.Texture {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      // The sphere is viewed from inside, so mirror the horizontal direction.
      const dir = equirectDirection(1 - u, v);
      const { l, b } = sceneToGalactic(dir[0], dir[1], dir[2]);

      const lRad = (l * Math.PI) / 180;
      // 1 towards the galactic centre, 0 towards the anticentre.
      const facing = (1 + Math.cos(lRad)) / 2;

      // The disc looks thicker towards the centre because we see more of it.
      const scaleHeight = 3.0 + 6.2 * facing ** 1.3;
      const disc = Math.exp(-((Math.abs(b) / scaleHeight) ** 1.25));
      const alongArm = 0.16 + 0.84 * facing ** 1.8;

      // The Sagittarius bulge, and the Cygnus star cloud on the other side.
      const toCentre = Math.hypot(((l + 180) % 360) - 180, b);
      const bulge = Math.exp(-((toCentre / 14) ** 2)) * 0.8;
      const cygnus =
        Math.exp(-(((l - 80) / 14) ** 2)) * Math.exp(-((b / 5.5) ** 2)) * 0.32;

      let glow = alongArm * disc + bulge + cygnus;

      // Mottling from star clouds.
      const clouds = fbm3(dir[0] * 5, dir[1] * 5, dir[2] * 5, { octaves: 4, seed: 5 });
      glow *= 0.62 + clouds * 0.72;

      // The Great Rift: dust splitting the band from Cygnus down to Sagittarius.
      const riftAlong = Math.exp(-(((((l + 180) % 360) - 180 - 38) / 40) ** 2));
      const riftAcross = Math.exp(-((((b + 1.2) / 3.4) ** 2)));
      const dustNoise = ridged3(dir[0] * 6, dir[1] * 14, dir[2] * 6, { octaves: 3, seed: 91 });
      glow *= 1 - 0.82 * riftAlong * riftAcross * (0.45 + 0.55 * dustNoise);

      // Patchy extinction elsewhere along the plane.
      const haze = ridged3(dir[0] * 3, dir[1] * 9, dir[2] * 3, { octaves: 3, seed: 37 });
      glow *= 1 - Math.min(0.5, Math.max(0, haze - 0.62) * 1.4) * disc;

      glow = Math.max(0, Math.min(1, glow));
      // Star clouds read warm, the faint outer halo cooler.
      const warmth = Math.min(1, glow * 1.5);
      const i = (y * width + x) * 4;
      image.data[i] = 96 + warmth * 132;
      image.data[i + 1] = 104 + warmth * 118;
      image.data[i + 2] = 138 + warmth * 84;
      image.data[i + 3] = glow ** 1.45 * 165;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
