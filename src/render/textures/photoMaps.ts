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

export async function loadPhotoMaps(base = 'textures'): Promise<Map<string, PhotoMaps>> {
  const result = new Map<string, PhotoMaps>();
  let manifest: Manifest;
  try {
    const response = await fetch(`${base}/manifest.json`, { cache: 'force-cache' });
    if (!response.ok) return result;
    manifest = (await response.json()) as Manifest;
  } catch {
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
          if (texture) (maps as Record<string, THREE.Texture>)[slot] = texture;
        }),
      );
      if (Object.keys(maps).length > 0) result.set(id, maps);
    }),
  );
  return result;
}
