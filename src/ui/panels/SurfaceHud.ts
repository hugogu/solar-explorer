/**
 * Heads-up display for the first-person surface view: where you are standing,
 * which way you are looking, and where the Sun and Moon are right now.
 */
import { AppState } from '../../app/AppState';
import type { Simulation } from '../../app/Simulation';
import { BODY_BY_ID } from '../../data';
import { el } from '../dom';
import { sunAltitude, moonAltitude } from '../../astro/riseset';

const COMPASS: Array<[number, string]> = [
  [0, '北'], [45, '东北'], [90, '东'], [135, '东南'],
  [180, '南'], [225, '西南'], [270, '西'], [315, '西北'],
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
        el('div', { class: 'surface-note' }, '地表视角使用真实比例，日月的视直径与实际相同'),
        el('button', { class: 'btn btn-small', onclick: () => onExit() }, '返回太空视角'),
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
      ['所在', `${body?.name ?? ''} · ${surface.latitude.toFixed(2)}°, ${surface.longitude.toFixed(2)}°`],
    ];

    if (surface.bodyId === 'earth') {
      const sun = sunAltitude(time.jd, observer);
      const moon = moonAltitude(time.jd, observer);
      rows.push(['太阳高度', `${sun.altitude.toFixed(1)}° ${describeSun(sun.altitude)}`]);
      rows.push(['月亮高度', `${moon.altitude.toFixed(1)}°`]);
    }

    const simulation = this.getSimulation();
    const state = simulation.get(surface.bodyId);
    if (state) rows.push(['当前自转角', `${state.meridian.toFixed(1)}°`]);

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
      ...COMPASS.map(([angle, label]) => {
        let delta = ((angle - heading + 540) % 360) - 180;
        const mark = el('span', { class: 'compass-mark' }, label);
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
  if (altitude > 0) return '（白昼）';
  if (altitude > -6) return '（民用曙暮光）';
  if (altitude > -12) return '（航海曙暮光）';
  if (altitude > -18) return '（天文曙暮光）';
  return '（夜）';
}
