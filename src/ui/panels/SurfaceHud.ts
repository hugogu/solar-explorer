/**
 * Heads-up display for the first-person surface view: where you are standing,
 * which way you are looking, and where the Sun and Moon are right now.
 */
import { AppState } from '../../app/AppState';
import type { Simulation } from '../../app/Simulation';
import { BODY_BY_ID } from '../../data';
import { el } from '../dom';
import { type StringKey, t, tr } from '../../i18n';
import { sunAltitude, moonAltitude } from '../../astro/riseset';

const COMPASS: Array<[number, StringKey]> = [
  [0, 'compass.n'], [45, 'compass.ne'], [90, 'compass.e'], [135, 'compass.se'],
  [180, 'compass.s'], [225, 'compass.sw'], [270, 'compass.w'], [315, 'compass.nw'],
];

export class SurfaceHud {
  readonly element: HTMLElement;
  private readonly compassEl: HTMLElement;
  private readonly readoutEl: HTMLElement;

  constructor(
    private readonly state: AppState,
    private readonly getSimulation: () => Simulation,
    onExit: () => void,
  ) {
    this.compassEl = el('div', { class: 'compass' });
    this.readoutEl = el('div', { class: 'surface-readout' });
    this.element = el('div', { class: 'surface-hud' },
      this.compassEl,
      el('div', { class: 'surface-card' },
        this.readoutEl,
        el('div', { class: 'surface-note' }, t('surface.note')),
        el('button', { class: 'btn btn-small', onclick: () => onExit() }, t('surface.exit')),
      ),
    );
    this.element.style.display = 'none';
  }

  /** Redrawn every frame while the surface view is active. */
  update(): void {
    const surface = this.state.settings.surface;
    if (!surface) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';

    const { observer, time } = this.state;
    const body = BODY_BY_ID.get(surface.bodyId);
    const rows: Array<[string, string]> = [
      [t('surface.standingAt'),
        `${body ? tr(body.name) : ''} · ${surface.latitude.toFixed(2)}°, ${surface.longitude.toFixed(2)}°`],
    ];

    if (surface.bodyId === 'earth') {
      const sun = sunAltitude(time.jd, observer);
      const moon = moonAltitude(time.jd, observer);
      rows.push([t('surface.sunAltitude'), `${sun.altitude.toFixed(1)}° ${describeSun(sun.altitude)}`]);
      rows.push([t('surface.moonAltitude'), `${moon.altitude.toFixed(1)}°`]);
    }

    const simulation = this.getSimulation();
    const state = simulation.get(surface.bodyId);
    if (state) rows.push([t('surface.meridian'), `${state.meridian.toFixed(1)}°`]);

    this.readoutEl.replaceChildren(
      ...rows.map(([label, value]) =>
        el('div', { class: 'data-row' },
          el('div', { class: 'data-label' }, label),
          el('div', { class: 'data-value' }, value))),
    );

    this.drawCompass();
  }

  /** A strip showing the cardinal points at the current heading. */
  private drawCompass(): void {
    const heading = this.headingDegrees();
    this.compassEl.replaceChildren(
      ...COMPASS.map(([angle, key]) => {
        const delta = ((angle - heading + 540) % 360) - 180;
        const mark = el('span', { class: 'compass-mark' }, t(key));
        mark.style.left = `${50 + (delta / 60) * 50}%`;
        mark.style.opacity = Math.abs(delta) > 60 ? '0' : String(1 - Math.abs(delta) / 80);
        return mark;
      }),
      el('span', { class: 'compass-centre' }),
    );
  }

  private headingDegrees(): number {
    return this.heading;
  }

  /** Fed by the render loop, which owns the camera. */
  heading = 180;
}

function describeSun(altitude: number): string {
  if (altitude > 0) return t('surface.daylight');
  if (altitude > -6) return t('surface.civilTwilight');
  if (altitude > -12) return t('surface.nauticalTwilight');
  if (altitude > -18) return t('surface.astronomicalTwilight');
  return t('surface.night');
}
