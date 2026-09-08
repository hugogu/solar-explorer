/**
 * Optional photographic maps.
 *
 * public/textures/manifest.json lists whatever `npm run fetch-textures` has
 * downloaded. When it is missing - the default for a fresh checkout - every
 * body falls back to its procedurally generated surface.
 */
import * as THREE from 'three';
import type { PhotoMaps } from '../Bodies';

interface Manifest {
  [bodyId: string]: {
    map?: string;
    normalMap?: string;
    specularMap?: string;
    cloudMap?: string;
    nightMap?: string;
  };
}

const SLOT_COLOR_SPACE: Record<string, boolean> = {
  map: true, cloudMap: true, nightMap: true, normalMap: false, specularMap: false,
};

/**
 * Specular maps are bright where the surface is shiny; roughness maps are the
 * other way round, so the ocean mask has to be inverted before three.js can use
 * it. Done once at load time on a canvas.
 */
function invertToRoughness(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    // Water becomes glossy (low roughness), land stays matte.
    const v = 255 - data.data[i];
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  const result = new THREE.CanvasTexture(canvas);
  result.anisotropy = 4;
  return result;
}

export async function loadPhotoMaps(base = 'textures'): Promise<Map<string, PhotoMaps>> {
  const result = new Map<string, PhotoMaps>();
  let manifest: Manifest;
  try {
    // No cache override here. A dev server or a static host answers a missing
    // file with index.html and a 200, and caching that reply would keep the
    // real manifest permanently out of reach once it was finally deployed.
    const response = await fetch(`${base}/manifest.json`);
    if (!response.ok) return result;
    const text = await response.text();
    // A 200 is not proof the file exists, so check that it really is JSON.
    if (!text.trimStart().startsWith('{')) {
      console.info('[textures] no manifest found; using procedural surfaces. Run "npm run fetch-textures" to add the photographic maps.');
      return result;
    }
    manifest = JSON.parse(text) as Manifest;
  } catch (error) {
    console.warn('[textures] manifest could not be read; using procedural surfaces.', error);
    return result;
  }

  const loader = new THREE.TextureLoader();
  const load = (file: string, srgb: boolean) =>
    new Promise<THREE.Texture | undefined>((resolve) => {
      loader.load(
        `${base}/${file}`,
        (texture) => {
          if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          resolve(texture);
        },
        undefined,
        () => resolve(undefined),
      );
    });

  await Promise.all(
    Object.entries(manifest).map(async ([id, slots]) => {
      const maps: PhotoMaps = {};
      await Promise.all(
        Object.entries(slots).map(async ([slot, file]) => {
          if (!file) return;
          const texture = await load(file, SLOT_COLOR_SPACE[slot] ?? true);
          if (!texture) return;
          (maps as Record<string, THREE.Texture>)[slot] =
            slot === 'specularMap' ? invertToRoughness(texture) : texture;
        }),
      );
      if (Object.keys(maps).length > 0) result.set(id, maps);
    }),
  );
  return result;
}
