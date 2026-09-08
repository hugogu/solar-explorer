#!/usr/bin/env node
/**
 * Download the optional photographic maps.
 *
 * The app ships with procedurally generated surfaces for every body and works
 * offline without this step. Running it swaps in real NASA imagery for the two
 * bodies everybody recognises - the Earth and the Moon - which is worth the
 * download. Files land in public/textures together with a manifest the app
 * reads at start-up; delete the folder to go back to procedural surfaces.
 *
 * Source: the three.js repository (MIT), which redistributes these public
 * domain NASA/JPL maps.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'textures');

const MIRRORS = [
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/textures/planets/',
  'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/',
];

/** body id -> texture slot -> remote file name */
const WANTED = {
  earth: {
    map: 'earth_day_4096.jpg',
    normalMap: 'earth_normal_2048.jpg',
    specularMap: 'earth_specular_2048.jpg',
    cloudMap: 'earth_clouds_1024.png',
    nightMap: 'earth_night_4096.jpg',
  },
  moon: {
    map: 'moon_1024.jpg',
  },
};

async function download(name) {
  let lastError;
  for (const base of MIRRORS) {
    try {
      const response = await fetch(base + name, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('unreachable');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {};
  let failures = 0;

  for (const [bodyId, slots] of Object.entries(WANTED)) {
    manifest[bodyId] = {};
    for (const [slot, file] of Object.entries(slots)) {
      process.stdout.write(`  ${bodyId}.${slot} <- ${file} ... `);
      try {
        const data = await download(file);
        await writeFile(join(OUT_DIR, file), data);
        manifest[bodyId][slot] = file;
        console.log(`${(data.length / 1024).toFixed(0)} KB`);
      } catch (error) {
        failures += 1;
        console.log(`failed (${error.message}); keeping the procedural surface`);
      }
    }
    if (Object.keys(manifest[bodyId]).length === 0) delete manifest[bodyId];
  }

  if (Object.keys(manifest).length === 0) {
    console.log('\nNothing downloaded. The app will use procedural surfaces.');
    process.exitCode = failures > 0 ? 1 : 0;
    return;
  }

  await writeFile(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nWrote public/textures/manifest.json with ${Object.keys(manifest).length} bodies.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
