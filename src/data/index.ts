import { STAR_AND_PLANETS } from './planets.data';
import { MOONS } from './moons.data';
import { COMET_INFO, DWARF_PLANET_INFO } from './smallbodies.data';
import type { BodyInfo } from './types';

export * from './types';

export const ALL_BODIES: BodyInfo[] = [
  ...STAR_AND_PLANETS,
  ...DWARF_PLANET_INFO,
  ...MOONS,
  ...COMET_INFO,
];

export const BODY_BY_ID = new Map(ALL_BODIES.map((b) => [b.id, b]));

export function bodyInfo(id: string): BodyInfo | undefined {
  return BODY_BY_ID.get(id);
}

export function moonsOf(parentId: string): BodyInfo[] {
  return MOONS.filter((m) => m.parent === parentId);
}

export { STAR_AND_PLANETS, MOONS, DWARF_PLANET_INFO, COMET_INFO };
