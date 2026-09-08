#!/usr/bin/env node
/**
 * Download the optional photographic maps.
 *
 * The app ships with procedurally generated surfaces for every body and works
 * offline without this step, but noise can only get you so far: real Jupiter is
 * a turbulent mess of festoons and ovals that painted bands do not resemble.
 * Running this swaps in photographic maps for the Sun, all eight planets,
 * Saturn's rings and the Moon.
 *
 * Files land in public/textures together with a manifest the app reads at
 * start-up, and an attribution file naming the sources. Delete the folder to go
 * back to procedural surfaces.
 *
 * Sources
 *   - Solar System Scope (https://www.solarsystemscope.com/textures/),
 *     CC BY 4.0: "You may use, adapt, and share these textures for any purpose,
 *     even commercially." Built from NASA imagery and geodata.
 *   - The three.js repository (MIT), which redistributes NASA/JPL public domain
 *     maps of the Earth, including its cloud, night lights and normal maps.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'textures');

const SOURCES = {
  sss: {
    name: 'Solar System Scope',
    url: 'https://www.solarsystemscope.com/textures/',
    licence: 'CC BY 4.0',
    mirrors: ['https://www.solarsystemscope.com/textures/download/'],
  },
  three: {
    name: 'three.js (NASA/JPL imagery, public domain)',
    url: 'https://github.com/mrdoob/three.js',
    licence: 'MIT / public domain imagery',
    mirrors: [
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/textures/planets/',
      'https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/',
    ],
  },
};

/**
 * body id -> texture slot -> [source, remote file].
 * 2k maps throughout: an 8k Jupiter is a 3 MB download and 130 MB of texture
 * memory, which is more than a phone should be asked to carry for one planet.
 */
const WANTED = {
  sun: { map: ['sss', '2k_sun.jpg'] },
  mercury: { map: ['sss', '2k_mercury.jpg'] },
  // What you see of Venus is the cloud deck, not the radar surface underneath.
  venus: { map: ['sss', '2k_venus_atmosphere.jpg'] },
  earth: {
    map: ['three', 'earth_day_4096.jpg'],
    normalMap: ['three', 'earth_normal_2048.jpg'],
    specularMap: ['three', 'earth_specular_2048.jpg'],
    cloudMap: ['three', 'earth_clouds_1024.png'],
    nightMap: ['three', 'earth_night_4096.jpg'],
  },
  mars: { map: ['sss', '2k_mars.jpg'] },
  jupiter: { map: ['sss', '2k_jupiter.jpg'] },
  saturn: {
    map: ['sss', '2k_saturn.jpg'],
    ringMap: ['sss', '2k_saturn_ring_alpha.png'],
  },
  uranus: { map: ['sss', '2k_uranus.jpg'] },
  neptune: { map: ['sss', '2k_neptune.jpg'] },
  moon: { map: ['three', 'moon_1024.jpg'] },
};

async function download(source, name) {
  let lastError;
  for (const base of SOURCES[source].mirrors) {
    try {
      const response = await fetch(base + name, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length < 1024) throw new Error('suspiciously small');
      return data;
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
  let bytes = 0;

  for (const [bodyId, slots] of Object.entries(WANTED)) {
    manifest[bodyId] = {};
    for (const [slot, [source, file]] of Object.entries(slots)) {
      process.stdout.write(`  ${bodyId}.${slot} <- ${file} ... `);
      try {
        const data = await download(source, file);
        await writeFile(join(OUT_DIR, file), data);
        manifest[bodyId][slot] = file;
        bytes += data.length;
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
  await writeFile(
    join(OUT_DIR, 'ATTRIBUTION.txt'),
    [
      'Texture sources',
      '===============',
      '',
      ...Object.values(SOURCES).flatMap((s) => [
        `${s.name}`,
        `  ${s.url}`,
        `  Licence: ${s.licence}`,
        '',
      ]),
      'These files are downloaded on demand and are not part of the repository.',
      '',
    ].join('\n'),
  );
  console.log(
    `\nWrote manifest.json for ${Object.keys(manifest).length} bodies, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB total.`,
  );
  if (failures > 0) console.log(`${failures} file(s) failed; those bodies stay procedural.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
