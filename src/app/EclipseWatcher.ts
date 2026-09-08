/**
 * Watches the simulated clock for a solar eclipse in progress and works out
 * what the renderer needs to draw its shadow: the track across the ground, the
 * umbra's position right now, and the edge of the region that sees anything.
 *
 * The track is computed once per eclipse; the moving parts are refreshed as the
 * clock advances, throttled so that scrubbing time quickly stays cheap.
 */
import type { SolarEclipse } from '../astro/eclipse';
import { findEclipses } from '../astro/eclipse';
import type { EclipsePath } from '../astro/eclipsepath';
import { penumbraOutline, shadowPositionAt, solarEclipsePath } from '../astro/eclipsepath';

export interface EclipseOverlay {
  eclipse: SolarEclipse;
  path: EclipsePath;
  /** where the axis is aimed at this instant */
  current: ReturnType<typeof shadowPositionAt>;
  /** edge of the area seeing a partial eclipse, in geographic coordinates */
  penumbra: Array<{ latitude: number; longitude: number }>;
  /** 0 at first contact, 1 at last */
  progress: number;
}

/** Padding either side of the penumbral contacts, so the track is visible early. */
const LEAD_IN_DAYS = 1.5 / 24;

export class EclipseWatcher {
  private cached: { eclipse: SolarEclipse; path: EclipsePath } | null = null;
  private searchedAround = Number.NaN;
  private outline: Array<{ latitude: number; longitude: number }> = [];
  private outlineAt = Number.NaN;

  /** @returns the overlay for the eclipse under way, or null when there is none */
  update(jd: number): EclipseOverlay | null {
    const active = this.eclipseAround(jd);
    if (!active) return null;
    const { eclipse, path } = active;

    // The outline is the expensive part; a few seconds of simulated time either
    // way makes no visible difference to a shape this size.
    if (!Number.isFinite(this.outlineAt) || Math.abs(jd - this.outlineAt) > 20 / 86400) {
      this.outline = penumbraOutline(jd, 72);
      this.outlineAt = jd;
    }

    const span = path.penumbraEnd - path.penumbraStart;
    return {
      eclipse,
      path,
      current: shadowPositionAt(jd),
      penumbra: this.outline,
      progress: span > 0 ? (jd - path.penumbraStart) / span : 0,
    };
  }

  private eclipseAround(jd: number): { eclipse: SolarEclipse; path: EclipsePath } | null {
    if (this.cached && this.within(jd, this.cached.path)) return this.cached;

    // Only look again once the clock has moved somewhere new.
    if (Number.isFinite(this.searchedAround) && Math.abs(jd - this.searchedAround) < 0.05) {
      return this.cached && this.within(jd, this.cached.path) ? this.cached : null;
    }
    this.searchedAround = jd;
    this.cached = null;
    this.outlineAt = Number.NaN;

    const next = findEclipses(jd - 0.3, { limit: 1, solar: true, lunar: false })[0];
    if (!next || next.kind !== 'solar') return null;
    if (Math.abs(next.jdMax - jd) > 0.25) return null;

    const path = solarEclipsePath(next, 4);
    this.cached = { eclipse: next, path };
    return this.within(jd, path) ? this.cached : null;
  }

  private within(jd: number, path: EclipsePath): boolean {
    return jd >= path.penumbraStart - LEAD_IN_DAYS && jd <= path.penumbraEnd + LEAD_IN_DAYS;
  }

  reset(): void {
    this.cached = null;
    this.searchedAround = Number.NaN;
    this.outlineAt = Number.NaN;
  }
}
