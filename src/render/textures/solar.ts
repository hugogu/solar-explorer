/**
 * Procedural textures for the Sun's activity: the corona, the glare spikes and
 * the prominences standing off the limb.
 *
 * The corona's shape follows the cycle. Near minimum the field is close to a
 * dipole and the corona is two long equatorial streamers with short brushes at
 * the poles; near maximum the field is a mess and the corona is a rough circle
 * of streamers all the way round. Drawing that from the activity level rather
 * than from a fixed picture is what makes the eleven-year rhythm visible.
 */
import * as THREE from 'three';
import { fbm3 } from './noise';

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d') as CanvasRenderingContext2D];
}

function texture(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Photosphere radius as a fraction of the texture's half-width. */
export const CORONA_INNER = 0.3;

/**
 * @param activity 0 at cycle minimum, 1 at a strong maximum
 * @param size texture edge in pixels; the Sun's north pole points to +v
 */
export function generateCoronaTexture(activity: number, size = 512): THREE.Texture {
  const [canvas, ctx] = canvasOf(size);
  const image = ctx.createImageData(size, size);
  const half = size / 2;
  // A busy corona reaches further and falls off more slowly.
  const scale = 0.10 + 0.09 * activity;
  const streamerSharpness = 7 - 4 * activity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (r < CORONA_INNER || r > 1) {
        image.data[i + 3] = 0;
        continue;
      }
      const theta = Math.atan2(dy, dx);
      // Equatorial belt at minimum, filling in as the cycle climbs. cos(theta)
      // is 0 at the poles because the texture's vertical axis is the Sun's.
      const equatorial = Math.abs(Math.cos(theta)) ** (2.2 - 1.9 * activity);
      const belt = activity + (1 - activity) * equatorial;
      // Short polar brushes survive at every phase of the cycle.
      const plume = (1 - activity) * 0.35 * Math.abs(Math.sin(theta)) ** 6
        * Math.exp(-(r - CORONA_INNER) / 0.07);
      // Streamers: many lobes around the limb, barely varying with radius so
      // each one draws out into a spike instead of breaking into blobs.
      const streaks = fbm3(Math.cos(theta) * 9, Math.sin(theta) * 9, r * 0.35, {
        octaves: 4, seed: 91,
      });
      const rays = 0.28 + 0.95 * Math.abs(streaks) ** (streamerSharpness / 4);

      const falloff = Math.exp(-(r - CORONA_INNER) / scale);
      // Fade well before the texture's own border, or the sprite's square
      // outline shows up as a grey haze filling the frame.
      const edge = Math.max(0, 1 - r) ** 1.6;
      const a = Math.max(0, (belt * rays * falloff + plume) * edge);

      image.data[i] = 255;
      image.data[i + 1] = 244;
      image.data[i + 2] = 216;
      image.data[i + 3] = Math.min(255, a * 235);
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture(canvas);
}

/**
 * The glare a bright source leaves in an eye or a lens: a soft core with a few
 * long spikes. Screen-aligned, because that is where the effect happens.
 */
export function generateRayTexture(size = 512, spikes = 4): THREE.Texture {
  const [canvas, ctx] = canvasOf(size);
  const image = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (r > 1) { image.data[i + 3] = 0; continue; }
      const theta = Math.atan2(dy, dx);
      // Alternating long and short spikes reads as glare rather than a star.
      const blades = Math.abs(Math.cos(theta * (spikes / 2)));
      const long = blades ** 900;
      const short = Math.abs(Math.cos(theta * spikes)) ** 1400;
      // Squared falloff, so a spike thins out rather than ending on a hard edge.
      const spike = (long + 0.4 * short) * Math.max(0, 1 - r) ** 3.2;
      // A tight core: any wider and the glare washes out the disc it sits on.
      const core = Math.max(0, 1 - r * 9.0) ** 3.0;
      const a = Math.min(1, spike * 0.8 + core * 0.5);
      image.data[i] = 255;
      image.data[i + 1] = 249;
      image.data[i + 2] = 226;
      image.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture(canvas);
}

/**
 * One prominence: a loop of cool hydrogen suspended on the magnetic field,
 * drawn as an arch rooted at the bottom edge so it can stand on the limb.
 */
export function generateProminenceTexture(size = 256): THREE.Texture {
  const [canvas, ctx] = canvasOf(size);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;      // -1..1 across the limb
      const v = 1 - y / (size - 1);            // 0 at the surface, 1 at the top
      const i = (y * size + x) * 4;
      // A semicircular arch, thinning and fraying towards the top.
      const arch = Math.sqrt(Math.max(0, 1 - u * u));
      const along = 1 - Math.abs(v - arch * 0.75) / (0.34 - 0.2 * v);
      const body = Math.max(0, along);
      const feet = Math.max(0, 1 - Math.abs(Math.abs(u) - 0.72) / 0.3) * Math.max(0, 1 - v * 3.2);
      const frayed = 0.55 + 0.45 * fbm3(u * 3.5, v * 5.5, 0.5, { octaves: 3, seed: 17 });
      const a = Math.min(1, (body * 0.85 + feet * 0.5) * frayed) * Math.max(0, 1 - v ** 3);
      image.data[i] = 255;
      image.data[i + 1] = 108;
      image.data[i + 2] = 62;
      image.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture(canvas);
}
