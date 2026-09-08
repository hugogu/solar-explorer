/**
 * Procedural equirectangular surface maps.
 *
 * Every body gets a texture generated from seeded noise, so the app is fully
 * self contained and works offline. Real photographic maps, when present in
 * public/textures, override these for the Earth and the Moon.
 */
import * as THREE from 'three';
import type { BodyInfo } from '../../data';
import { equirectDirection, fbm3, makeRandom, ridged3, valueNoise3 } from './noise';

export type SurfaceStyle =
  | 'sun' | 'rocky' | 'mars' | 'venus' | 'earth' | 'gasgiant' | 'saturnoid'
  | 'icegiant' | 'icy' | 'io' | 'titan' | 'triton' | 'comet' | 'dwarf';

const STYLE_BY_ID: Record<string, SurfaceStyle> = {
  sun: 'sun',
  mercury: 'rocky', venus: 'venus', earth: 'earth', mars: 'mars',
  jupiter: 'gasgiant', saturn: 'saturnoid', uranus: 'icegiant', neptune: 'icegiant',
  moon: 'rocky', phobos: 'rocky', deimos: 'rocky', amalthea: 'rocky',
  io: 'io', europa: 'icy', ganymede: 'rocky', callisto: 'rocky',
  mimas: 'icy', enceladus: 'icy', tethys: 'icy', dione: 'icy', rhea: 'icy',
  titan: 'titan', hyperion: 'rocky', iapetus: 'rocky', phoebe: 'rocky',
  miranda: 'icy', ariel: 'icy', umbriel: 'rocky', titania: 'icy', oberon: 'rocky',
  proteus: 'rocky', triton: 'triton', nereid: 'rocky',
  pluto: 'dwarf', charon: 'rocky', nix: 'icy', hydra: 'icy',
  ceres: 'rocky', haumea: 'icy', makemake: 'dwarf', eris: 'icy',
  quaoar: 'dwarf', gonggong: 'dwarf', sedna: 'dwarf', dysnomia: 'rocky',
};

export function styleFor(info: BodyInfo): SurfaceStyle {
  return STYLE_BY_ID[info.id] ?? (info.kind === 'comet' ? 'comet' : 'rocky');
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

interface PaintContext {
  width: number;
  height: number;
  color: ImageData;
  height16: Float32Array;
  seed: number;
  primary: [number, number, number];
  secondary: [number, number, number];
}

type Painter = (p: PaintContext, x: number, y: number, dir: [number, number, number], lat: number) => [number, number, number, number];

/** Per-pixel painters, one per surface style. Return [r, g, b, height]. */
const PAINTERS: Record<SurfaceStyle, Painter> = {
  sun: (p, _x, _y, d) => {
    const granule = fbm3(d[0] * 40, d[1] * 40, d[2] * 40, { octaves: 4, seed: p.seed });
    const cells = ridged3(d[0] * 18, d[1] * 18, d[2] * 18, { octaves: 3, seed: p.seed + 7 });
    const spots = fbm3(d[0] * 3.2, d[1] * 3.2, d[2] * 3.2, { octaves: 4, seed: p.seed + 21 });
    let c = mix([255, 244, 214], [255, 176, 60], 0.35 + granule * 0.5 - cells * 0.15);
    if (spots > 0.74) {
      const t = Math.min(1, (spots - 0.74) / 0.1);
      c = mix(c, [120, 52, 16], t * 0.85);
    }
    return [c[0], c[1], c[2], granule];
  },

  rocky: (p, _x, _y, d) => {
    const base = fbm3(d[0] * 3, d[1] * 3, d[2] * 3, { octaves: 6, seed: p.seed });
    const detail = fbm3(d[0] * 24, d[1] * 24, d[2] * 24, { octaves: 4, seed: p.seed + 11 });
    const mare = fbm3(d[0] * 1.6, d[1] * 1.6, d[2] * 1.6, { octaves: 3, seed: p.seed + 31 });
    let t = base * 0.6 + detail * 0.4;
    if (mare > 0.58) t *= 0.62;
    const c = mix(p.secondary, p.primary, t);
    return [c[0], c[1], c[2], base * 0.7 + detail * 0.3];
  },

  mars: (p, _x, _y, d, lat) => {
    const base = fbm3(d[0] * 3.4, d[1] * 3.4, d[2] * 3.4, { octaves: 6, seed: p.seed });
    const dark = fbm3(d[0] * 1.4, d[1] * 1.4, d[2] * 1.4, { octaves: 4, seed: p.seed + 5 });
    const dust = fbm3(d[0] * 12, d[1] * 12, d[2] * 12, { octaves: 3, seed: p.seed + 17 });
    let c = mix(p.secondary, p.primary, base * 0.7 + dust * 0.3);
    if (dark > 0.56) c = mix(c, [92, 62, 48], Math.min(1, (dark - 0.56) * 5) * 0.6);
    // Polar caps, ragged at the edge.
    const capNoise = fbm3(d[0] * 8, d[1] * 8, d[2] * 8, { octaves: 3, seed: p.seed + 41 }) * 6;
    const absLat = Math.abs(lat);
    const capEdge = (lat > 0 ? 79 : 74) - capNoise;
    if (absLat > capEdge) {
      c = mix(c, [242, 240, 238], Math.min(1, (absLat - capEdge) / 4));
    }
    return [c[0], c[1], c[2], base * 0.8 + dust * 0.2];
  },

  venus: (p, _x, _y, d) => {
    // Sulphuric cloud deck: stretched along longitude by squashing the sample.
    const warp = fbm3(d[0] * 2, d[1] * 6, d[2] * 2, { octaves: 4, seed: p.seed });
    const swirl = fbm3(d[0] * 1.5 + warp * 2, d[1] * 8, d[2] * 1.5, { octaves: 5, seed: p.seed + 3 });
    const c = mix(p.secondary, p.primary, 0.35 + swirl * 0.8);
    return [c[0], c[1], c[2], 0.5];
  },

  earth: (p, _x, _y, d, lat) => {
    const continents = fbm3(d[0] * 1.9, d[1] * 1.9, d[2] * 1.9, { octaves: 7, seed: p.seed });
    const detail = fbm3(d[0] * 9, d[1] * 9, d[2] * 9, { octaves: 4, seed: p.seed + 13 });
    const landiness = continents * 0.78 + detail * 0.22;
    const isLand = landiness > 0.52;
    let c: [number, number, number];
    if (isLand) {
      const h = (landiness - 0.52) / 0.48;
      const cold = Math.abs(lat) / 90;
      c = mix([70, 110, 58], [150, 132, 96], Math.min(1, h * 2.2));
      c = mix(c, [230, 235, 240], Math.max(0, cold - 0.62) * 2.6);
      if (Math.abs(lat) < 30 && h < 0.3) c = mix(c, [58, 96, 44], 0.5);
    } else {
      const depth = (0.52 - landiness) / 0.52;
      c = mix([40, 96, 150], [8, 28, 78], Math.min(1, depth * 1.6));
    }
    if (Math.abs(lat) > 76) c = mix(c, [244, 248, 252], Math.min(1, (Math.abs(lat) - 76) / 8));
    return [c[0], c[1], c[2], isLand ? 0.5 + landiness * 0.5 : 0.35];
  },

  gasgiant: (p, _x, _y, d, lat) => {
    // Zonal bands: sample stretched hard along longitude, then warp the latitude.
    const turb = fbm3(d[0] * 0.6, d[1] * 6, d[2] * 0.6, { octaves: 5, seed: p.seed }) - 0.5;
    const l = lat + turb * 9;
    const band = Math.sin(l * 0.22) * 0.5 + 0.5;
    const fine = fbm3(d[0] * 1.2, d[1] * 22, d[2] * 1.2, { octaves: 4, seed: p.seed + 9 });
    const t = band * 0.7 + fine * 0.3;
    let c = mix(p.secondary, p.primary, t);
    // Bright zones and dark belts.
    if (band > 0.72) c = mix(c, [246, 232, 210], (band - 0.72) * 2.4);
    if (band < 0.28) c = mix(c, [120, 82, 58], (0.28 - band) * 2.2);
    if (Math.abs(lat) > 62) c = mix(c, [150, 148, 158], (Math.abs(lat) - 62) / 40);
    return [c[0], c[1], c[2], 0.5];
  },

  saturnoid: (p, _x, _y, d, lat) => {
    const turb = fbm3(d[0] * 0.5, d[1] * 5, d[2] * 0.5, { octaves: 4, seed: p.seed }) - 0.5;
    const l = lat + turb * 6;
    const band = Math.sin(l * 0.17) * 0.5 + 0.5;
    const fine = fbm3(d[0] * 1.0, d[1] * 16, d[2] * 1.0, { octaves: 4, seed: p.seed + 4 });
    const c = mix(p.secondary, p.primary, band * 0.75 + fine * 0.25);
    return [c[0], c[1], c[2], 0.5];
  },

  icegiant: (p, _x, _y, d, lat) => {
    const turb = fbm3(d[0] * 0.8, d[1] * 4, d[2] * 0.8, { octaves: 4, seed: p.seed }) - 0.5;
    const band = Math.sin((lat + turb * 12) * 0.09) * 0.5 + 0.5;
    const cloud = fbm3(d[0] * 2.4, d[1] * 9, d[2] * 2.4, { octaves: 4, seed: p.seed + 6 });
    let c = mix(p.secondary, p.primary, 0.45 + band * 0.35 + cloud * 0.2);
    if (cloud > 0.78) c = mix(c, [255, 255, 255], (cloud - 0.78) * 2.5);
    return [c[0], c[1], c[2], 0.5];
  },

  icy: (p, _x, _y, d) => {
    const base = fbm3(d[0] * 4, d[1] * 4, d[2] * 4, { octaves: 5, seed: p.seed });
    // Lineae: ridged noise gives long thin cracks.
    const cracks = ridged3(d[0] * 5, d[1] * 5, d[2] * 5, { octaves: 4, seed: p.seed + 23 });
    let c = mix(p.secondary, p.primary, 0.55 + base * 0.45);
    if (cracks > 0.72) c = mix(c, [150, 96, 70], Math.min(1, (cracks - 0.72) * 4) * 0.75);
    return [c[0], c[1], c[2], base * 0.4 + (cracks > 0.72 ? 0.3 : 0)];
  },

  io: (p, _x, _y, d) => {
    const base = fbm3(d[0] * 5, d[1] * 5, d[2] * 5, { octaves: 5, seed: p.seed });
    const flows = fbm3(d[0] * 13, d[1] * 13, d[2] * 13, { octaves: 4, seed: p.seed + 8 });
    let c = mix([232, 208, 96], [214, 128, 44], base);
    if (flows > 0.66) c = mix(c, [60, 40, 32], (flows - 0.66) * 2.4);
    if (base > 0.72) c = mix(c, [246, 240, 200], (base - 0.72) * 2);
    return [c[0], c[1], c[2], base * 0.5 + flows * 0.5];
  },

  titan: (p, _x, _y, d, lat) => {
    const haze = fbm3(d[0] * 1.4, d[1] * 5, d[2] * 1.4, { octaves: 5, seed: p.seed });
    let c = mix(p.secondary, p.primary, 0.4 + haze * 0.6);
    if (lat > 62) c = mix(c, [120, 130, 150], (lat - 62) / 40); // northern seas
    return [c[0], c[1], c[2], 0.3];
  },

  triton: (p, _x, _y, d, lat) => {
    const cantaloupe = valueNoise3(d[0] * 22, d[1] * 22, d[2] * 22, p.seed);
    const base = fbm3(d[0] * 4, d[1] * 4, d[2] * 4, { octaves: 4, seed: p.seed + 2 });
    let c = mix(p.secondary, p.primary, 0.5 + base * 0.5);
    c = mix(c, [214, 176, 168], cantaloupe * 0.35);
    if (lat < -38) c = mix(c, [246, 238, 232], Math.min(1, (-lat - 38) / 30));
    return [c[0], c[1], c[2], cantaloupe * 0.6 + base * 0.4];
  },

  comet: (p, _x, _y, d) => {
    const base = fbm3(d[0] * 6, d[1] * 6, d[2] * 6, { octaves: 5, seed: p.seed });
    const rough = ridged3(d[0] * 14, d[1] * 14, d[2] * 14, { octaves: 4, seed: p.seed + 3 });
    const c = mix([28, 26, 24], [92, 84, 74], base * 0.7 + rough * 0.3);
    return [c[0], c[1], c[2], base * 0.5 + rough * 0.5];
  },

  dwarf: (p, _x, _y, d, lat) => {
    const base = fbm3(d[0] * 3.2, d[1] * 3.2, d[2] * 3.2, { octaves: 6, seed: p.seed });
    const patch = fbm3(d[0] * 1.3, d[1] * 1.3, d[2] * 1.3, { octaves: 3, seed: p.seed + 19 });
    let c = mix(p.secondary, p.primary, base);
    if (patch > 0.6) c = mix(c, [246, 240, 230], Math.min(1, (patch - 0.6) * 3) * 0.8);
    if (patch < 0.36) c = mix(c, [72, 44, 36], Math.min(1, (0.36 - patch) * 3) * 0.7);
    if (Math.abs(lat) > 70) c = mix(c, [236, 232, 226], (Math.abs(lat) - 70) / 25);
    return [c[0], c[1], c[2], base];
  },
};

/** Number of craters to sprinkle on a body, by style. */
const CRATER_COUNT: Partial<Record<SurfaceStyle, number>> = {
  rocky: 260, dwarf: 60, icy: 70, comet: 90, mars: 90,
};

function paintCraters(
  ctx: CanvasRenderingContext2D,
  heightCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  seed: number,
): void {
  const rand = makeRandom(seed);
  for (let i = 0; i < count; i++) {
    const lat = Math.asin(rand() * 2 - 1) * (180 / Math.PI);
    const lon = rand() * 360 - 180;
    const rBase = Math.pow(rand(), 2.6) * 0.055 + 0.004; // fraction of the map height
    const cx = ((lon + 180) / 360) * w;
    const cy = ((90 - lat) / 180) * h;
    const ry = rBase * h;
    // Equirectangular maps stretch horizontally towards the poles.
    const rx = Math.min(w * 0.4, ry / Math.max(0.12, Math.cos((lat * Math.PI) / 180)));

    for (const target of [ctx, heightCtx]) {
      target.save();
      target.translate(cx, cy);
      target.scale(rx / ry, 1);
      const g = target.createRadialGradient(0, 0, ry * 0.1, 0, 0, ry);
      const dark = target === heightCtx ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
      const light = target === heightCtx ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
      g.addColorStop(0, dark);
      g.addColorStop(0.72, dark);
      g.addColorStop(0.86, light);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      target.fillStyle = g;
      target.beginPath();
      target.arc(0, 0, ry, 0, Math.PI * 2);
      target.fill();
      target.restore();
    }
  }
}

/** Jupiter's Great Red Spot, drawn as a warped ellipse. */
function paintGreatRedSpot(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.62;
  const cy = h * (0.5 + 22 / 180);
  const rx = w * 0.075;
  const ry = h * 0.055;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 6; i >= 0; i--) {
    const t = i / 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * (0.55 + t * 0.45), ry * (0.55 + t * 0.45), 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${190 - t * 40}, ${92 + t * 30}, ${58 + t * 20}, ${0.75 - t * 0.45})`;
    ctx.fill();
  }
  ctx.restore();
}

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
}

/** Build the colour and normal maps for one body. */
export function generateSurface(info: BodyInfo, width: number, height: number): SurfaceMaps {
  const style = styleFor(info);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const heightCanvas = makeCanvas(width, height);
  const heightCtx = heightCanvas.getContext('2d') as CanvasRenderingContext2D;

  const image = ctx.createImageData(width, height);
  const heightImage = heightCtx.createImageData(width, height);
  const seed = [...info.id].reduce((a, c) => a + c.charCodeAt(0) * 37, 17);
  const painter = PAINTERS[style];
  const context: PaintContext = {
    width, height, color: image, height16: new Float32Array(0), seed,
    primary: hexToRgb(info.color),
    secondary: hexToRgb(info.color2 ?? info.color),
  };

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const lat = (0.5 - v) * 180;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const dir = equirectDirection(u, v);
      const [r, g, b, hgt] = painter(context, x, y, dir, lat);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
      const hv = Math.max(0, Math.min(255, hgt * 255));
      heightImage.data[i] = hv;
      heightImage.data[i + 1] = hv;
      heightImage.data[i + 2] = hv;
      heightImage.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  heightCtx.putImageData(heightImage, 0, 0);

  const craters = CRATER_COUNT[style];
  if (craters) paintCraters(ctx, heightCtx, width, height, craters, seed);
  if (info.id === 'jupiter') paintGreatRedSpot(ctx, width, height);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.RepeatWrapping;

  const result: SurfaceMaps = { map };
  if (style !== 'sun') {
    const normal = normalMapFrom(heightCanvas, style === 'rocky' || style === 'comet' ? 3.2 : 1.4);
    result.normalMap = normal;
  }
  return result;
}

/** Derive a tangent-space normal map from a grayscale height canvas. */
function normalMapFrom(heightCanvas: HTMLCanvasElement, strength: number): THREE.Texture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = (heightCanvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h);
  const out = makeCanvas(w, h);
  const outCtx = out.getContext('2d') as CanvasRenderingContext2D;
  const dst = outCtx.createImageData(w, h);
  const at = (x: number, y: number) => {
    const xx = (x + w) % w;
    const yy = Math.max(0, Math.min(h - 1, y));
    return src.data[(yy * w + xx) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      dst.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      dst.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      dst.data[i + 2] = (1 / len) * 255;
      dst.data[i + 3] = 255;
    }
  }
  outCtx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Ring texture: a 1-D radial profile with gaps and grain, stored as a strip. */
export function generateRingTexture(
  info: BodyInfo,
  width = 1024,
): THREE.Texture {
  const ring = info.rings;
  const canvas = makeCanvas(width, 8);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(width, 8);
  const base = hexToRgb(ring?.color ?? '#cbbb9a');
  const rand = makeRandom(991);
  const noiseTable = new Float32Array(width);
  for (let i = 0; i < width; i++) noiseTable[i] = rand();

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const radius = (ring?.inner ?? 1.2) + t * ((ring?.outer ?? 2.2) - (ring?.inner ?? 1.2));
    let alpha = 1;
    // Fine ringlets.
    let grain = 0;
    for (let o = 1; o <= 5; o++) {
      const f = 2 ** o;
      const idx = Math.floor(t * width * f * 0.08) % width;
      grain += noiseTable[idx] / f;
    }
    alpha *= 0.45 + grain * 0.75;
    for (const [gi, go] of ring?.gaps ?? []) {
      if (radius > gi && radius < go) {
        const mid = (gi + go) / 2;
        const half = (go - gi) / 2;
        alpha *= Math.min(1, Math.abs(radius - mid) / half) * 0.35;
      }
    }
    // Soft edges.
    alpha *= Math.min(1, t * 14) * Math.min(1, (1 - t) * 10);
    alpha = Math.max(0, Math.min(1, alpha)) * (ring?.opacity ?? 0.8);
    const shade = 0.75 + grain * 0.4;
    for (let y = 0; y < 8; y++) {
      const i = (y * width + x) * 4;
      image.data[i] = Math.min(255, base[0] * shade);
      image.data[i + 1] = Math.min(255, base[1] * shade);
      image.data[i + 2] = Math.min(255, base[2] * shade);
      image.data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft radial sprite used for glows, coronas and comet comae. */
export function radialSprite(color: string, size = 256, power = 2.4): THREE.Texture {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(size, size);
  const [r, g, b] = hexToRgb(color);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - half, y - half) / half;
      const a = Math.max(0, 1 - d) ** power;
      const i = (y * size + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
