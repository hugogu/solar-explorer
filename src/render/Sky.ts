/**
 * The sky: a star field and the Milky Way, both placed using the real galactic
 * frame so the band runs where it actually does in our sky.
 */
import * as THREE from 'three';
import { fbm3, makeRandom, ridged3 } from './textures/noise';
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

/** Galactic latitude, in radians, of a direction given in the scene frame. */
function sceneToGalacticLatitude(x: number, y: number, z: number): number {
  // Scene -> ecliptic.
  const ex = x;
  const ey = -z;
  const ez = y;
  // Ecliptic -> equatorial.
  const qx = ex;
  const qy = ey * Math.cos(OBLIQUITY) - ez * Math.sin(OBLIQUITY);
  const qz = ey * Math.sin(OBLIQUITY) + ez * Math.cos(OBLIQUITY);
  const px = Math.cos(NGP_DEC) * Math.cos(NGP_RA);
  const py = Math.cos(NGP_DEC) * Math.sin(NGP_RA);
  const pz = Math.sin(NGP_DEC);
  return Math.asin(Math.max(-1, Math.min(1, qx * px + qy * py + qz * pz)));
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
      sizes[i] = radius * (0.0009 + brightness * 0.0042);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: `
        attribute float starSize;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, starSize * uScale / max(1.0, -mv.z) * 260000.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.0, r);
          a *= a;
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
        opacity: 0.85,
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

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.milkyWay.geometry.dispose();
    (this.milkyWay.material as THREE.Material).dispose();
  }
}

/** Diffuse galactic glow with dust lanes, drawn in the scene frame. */
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
      const b = sceneToGalacticLatitude(dir[0], dir[1], dir[2]);
      const bDeg = Math.abs((b * 180) / Math.PI);

      // Core band brightness plus a wider halo.
      let glow = Math.exp(-((bDeg / 7.5) ** 1.6)) * 0.85 + Math.exp(-((bDeg / 26) ** 2)) * 0.3;
      const clouds = fbm3(dir[0] * 4, dir[1] * 4, dir[2] * 4, { octaves: 5, seed: 5 });
      const lanes = ridged3(dir[0] * 3, dir[1] * 9, dir[2] * 3, { octaves: 4, seed: 91 });
      glow *= 0.55 + clouds * 0.9;
      glow *= 1 - Math.min(0.8, Math.max(0, lanes - 0.55) * 1.9);
      glow = Math.max(0, Math.min(1, glow));

      const i = (y * width + x) * 4;
      image.data[i] = 150 + glow * 90;
      image.data[i + 1] = 160 + glow * 80;
      image.data[i + 2] = 205 + glow * 50;
      image.data[i + 3] = glow * 150;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
