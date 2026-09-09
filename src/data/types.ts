/** Descriptive catalogue types shared by the UI and the renderer. */
import type { Localised } from '../i18n';

export type { Localised };

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon' | 'comet';

export interface BodyPhysical {
  /** mean radius, km */
  radiusKm: number;
  /** equatorial radius when noticeably different, km */
  equatorialRadiusKm?: number;
  massKg: number;
  /** g/cm3 */
  density?: number;
  /** surface gravity, m/s2 */
  gravity?: number;
  /** escape velocity, km/s */
  escapeVelocity?: number;
  /** sidereal rotation period in hours; negative means retrograde */
  rotationHours?: number;
  /** axial tilt relative to the orbital plane, degrees */
  axialTilt?: number;
  albedo?: number;
  meanTempC?: number;
  minTempC?: number;
  maxTempC?: number;
  atmosphere?: Localised<string>;
  surfacePressureBar?: number;
  moonCount?: number;
}

export interface BodyOrbit {
  /** semi-major axis in AU for heliocentric bodies, km for satellites */
  semiMajorAxis: number;
  eccentricity: number;
  /** inclination to the ecliptic (planets) or to the parent's equator (moons) */
  inclination: number;
  /** sidereal orbital period in days */
  periodDays: number;
  /** mean orbital speed, km/s */
  speedKms?: number;
}

export interface RingSpec {
  /** inner and outer radius in planet radii */
  inner: number;
  outer: number;
  /** relative opacity 0..1 */
  opacity: number;
  color: string;
  /** gaps as [innerFraction, outerFraction] pairs in planet radii */
  gaps?: Array<[number, number]>;
}

export interface BodyInfo {
  id: string;
  name: Localised<string>;
  kind: BodyKind;
  /** parent body id for moons */
  parent?: string;
  /** astronomical symbol */
  symbol?: string;
  /**
   * International catalogue designation, the same in every language:
   * "Jupiter I", "1P", "(134340)". Kept apart from the name so a list can show
   * one without the other.
   */
  designation?: string;
  /** one-line hook shown under the title */
  tagline: Localised<string>;
  description: Localised<string>;
  /** bullet points of popular-science facts */
  facts: Localised<string[]>;
  physical: BodyPhysical;
  orbit?: BodyOrbit;
  discovery?: { by: Localised<string>; year: string };
  missions?: Localised<string[]>;
  /** base surface colour used by the procedural texture generator */
  color: string;
  /** secondary colour for banding or terrain variation */
  color2?: string;
  /** atmospheric glow colour */
  atmosphereColor?: string;
  rings?: RingSpec;
  /** relative visual brightness of the body's own emission (the Sun only) */
  emissive?: boolean;
}
