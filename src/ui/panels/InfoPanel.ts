/** Details of the selected body: live geometry plus the popular-science card. */
import { AppState } from '../../app/AppState';
import type { Simulation } from '../../app/Simulation';
import { BODY_BY_ID, BodyInfo, moonsOf } from '../../data';
import { ICONS, clear, el, icon } from '../dom';
import {
  formatAngle, formatBigNumber, formatDistanceAu, formatDurationDays, formatHours, formatKm,
  formatTemperature,
} from '../format';
import { joinList, t, tr } from '../../i18n';
import { otherName } from '../names';
import { moonPhase } from '../../astro/moon';
import { sunPosition } from '../../astro/sun';
import { jdToTT } from '../../astro/time';
import { vecLength, vecSub } from '../../astro/planets';
import { SATELLITE_ELEMENTS } from '../../astro/satellites';
import { SMALL_BODY_BY_ID } from '../../astro/smallbodies';

const APPROXIMATE_PHASE = new Set(
  SATELLITE_ELEMENTS.filter((s) => !s.phaseIsReal).map((s) => s.id),
);

export class InfoPanel {
  readonly element: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly liveEl: HTMLElement;
  private readonly off: Array<() => void> = [];
  private currentId: string | null = null;

  constructor(
    private readonly state: AppState,
    private readonly getSimulation: () => Simulation,
    private readonly onSurfaceView: (bodyId: string) => void,
  ) {
    this.bodyEl = el('div', { class: 'info-body' });
    this.liveEl = el('div', { class: 'info-live' });
    this.element = el('div', { class: 'panel info-panel' }, this.liveEl, this.bodyEl);
    this.off.push(state.on('selection', () => this.render()));
    this.render();
  }

  dispose(): void {
    for (const off of this.off) off();
    this.off.length = 0;
  }

  render(): void {
    const id = this.state.settings.selected;
    this.currentId = id;
    clear(this.bodyEl);
    clear(this.liveEl);
    this.element.classList.toggle('is-empty', !id);
    if (!id) {
      this.bodyEl.appendChild(
        el('div', { class: 'info-hint' },
          el('div', { class: 'info-hint-title' }, t('info.emptyTitle')),
          el('div', {}, t('info.emptyHint')),
        ),
      );
      return;
    }
    const info = BODY_BY_ID.get(id);
    if (!info) return;

    this.liveEl.appendChild(this.header(info));
    this.liveEl.appendChild(el('div', { class: 'live-grid', id: 'live-grid' }));

    this.bodyEl.appendChild(el('p', { class: 'info-desc' }, tr(info.description)));

    if (APPROXIMATE_PHASE.has(info.id) || (SMALL_BODY_BY_ID.get(info.id)?.phaseIsReal === false)) {
      this.bodyEl.appendChild(el('div', { class: 'note' }, t('info.approxNote')));
    }

    this.bodyEl.appendChild(this.factList(info));
    this.bodyEl.appendChild(this.physicalTable(info));
    if (info.orbit) this.bodyEl.appendChild(this.orbitTable(info));

    const moons = moonsOf(info.id);
    if (moons.length > 0) {
      this.bodyEl.appendChild(
        el('h3', { class: 'info-h3' }, t('info.moons', { count: moons.length })));
      const list = el('div', { class: 'chip-row' });
      for (const moon of moons) {
        list.appendChild(el('button', {
          class: 'chip',
          onclick: () => this.state.select(moon.id),
        }, tr(moon.name)));
      }
      this.bodyEl.appendChild(list);
    }

    if (info.discovery) {
      this.bodyEl.appendChild(
        el('div', { class: 'info-meta' },
          t('info.discovery', { by: tr(info.discovery.by), year: info.discovery.year })),
      );
    }
    if (info.missions) {
      this.bodyEl.appendChild(
        el('div', { class: 'info-meta' }, t('info.missions', { list: joinList(tr(info.missions)) })),
      );
    }
  }

  private header(info: BodyInfo): HTMLElement {
    const parent = info.parent ? BODY_BY_ID.get(info.parent) : undefined;
    const actions = el('div', { class: 'info-actions' });
    if (info.id === 'earth' || info.id === 'mars' || info.id === 'moon') {
      actions.appendChild(el('button', {
        class: 'btn btn-small',
        onclick: () => this.onSurfaceView(info.id),
      }, icon(ICONS.globe, 13), t('info.standOn')));
    }
    actions.appendChild(el('button', {
      class: 'btn btn-small',
      onclick: () => { this.state.settings.focus = info.id; this.state.emit('settings'); },
    }, t('info.follow')));

    return el(
      'div',
      { class: 'info-head' },
      el('div', { class: 'info-title-row' },
        info.symbol ? el('span', { class: 'info-symbol' }, info.symbol) : null,
        el('h2', { class: 'info-title' }, tr(info.name)),
        el('span', { class: 'info-en' }, otherName(info)),
      ),
      el('div', { class: 'info-tagline' }, tr(info.tagline)),
      parent ? el('div', { class: 'info-parent' }, t('info.moonOf', { parent: tr(parent.name) })) : null,
      actions,
    );
  }

  /**
   * One fact at a time in a shuffled order.
   *
   * The full list is a wall of text on a phone; a single card invites reading
   * it, and shuffling means a second visit to the same body shows something
   * different rather than always opening on the same line.
   */
  private factList(info: BodyInfo): HTMLElement {
    const facts = tr(info.facts);
    const order = shuffled(facts.length);
    let cursor = 0;
    const text = el('p', { class: 'fact-text' }, facts[order[0]]);
    const dots = el('div', { class: 'fact-dots' });
    const counter = el('span', { class: 'fact-counter' });

    const paint = () => {
      text.textContent = facts[order[cursor]];
      counter.textContent = `${cursor + 1} / ${facts.length}`;
      dots.replaceChildren(
        ...facts.map((_, i) =>
          el('span', { class: `fact-dot${i === cursor ? ' is-active' : ''}` })),
      );
    };

    const next = el('button', {
      class: 'chip',
      onclick: () => {
        cursor = (cursor + 1) % facts.length;
        text.classList.remove('is-fresh');
        // Restart the fade so the change is noticeable.
        void text.offsetWidth;
        text.classList.add('is-fresh');
        paint();
      },
    }, t('info.another'));

    paint();
    text.classList.add('is-fresh');
    return el('div', { class: 'fact-card' },
      el('h3', { class: 'info-h3' }, t('info.didYouKnow')),
      text,
      el('div', { class: 'fact-foot' }, dots, counter, next),
    );
  }

  private physicalTable(info: BodyInfo): HTMLElement {
    const p = info.physical;
    const rows: Array<[string, string]> = [
      [t('physical.radius'), formatKm(p.radiusKm)],
      [t('physical.mass'), t('physical.massValue', { value: p.massKg.toExponential(3) })],
    ];
    if (p.density) rows.push([t('physical.density'), `${p.density.toFixed(3)} g/cm³`]);
    if (p.gravity) {
      rows.push([t('physical.gravity'), t('physical.gravityValue', {
        value: p.gravity.toFixed(2), ratio: (p.gravity / 9.807).toFixed(2),
      })]);
    }
    if (p.escapeVelocity) rows.push([t('physical.escape'), `${p.escapeVelocity.toFixed(2)} km/s`]);
    if (p.rotationHours) rows.push([t('physical.rotation'), formatHours(p.rotationHours)]);
    if (p.axialTilt !== undefined) rows.push([t('physical.tilt'), formatAngle(p.axialTilt, 2)]);
    if (p.albedo !== undefined) rows.push([t('physical.albedo'), p.albedo.toFixed(3)]);
    if (p.meanTempC !== undefined) {
      const range = p.minTempC !== undefined && p.maxTempC !== undefined
        ? t('physical.temperatureRange', {
          mean: formatTemperature(p.meanTempC), min: p.minTempC, max: p.maxTempC,
        })
        : formatTemperature(p.meanTempC);
      rows.push([t('physical.temperature'), range]);
    }
    if (p.surfacePressureBar !== undefined) rows.push([t('physical.pressure'), `${p.surfacePressureBar} bar`]);
    if (p.atmosphere) rows.push([t('physical.atmosphere'), tr(p.atmosphere)]);
    if (p.moonCount !== undefined) {
      rows.push([t('physical.moonCount'), t('physical.moonCountValue', { count: p.moonCount })]);
    }
    return el('div', {}, el('h3', { class: 'info-h3' }, t('info.physical')), table(rows));
  }

  private orbitTable(info: BodyInfo): HTMLElement {
    const o = info.orbit as NonNullable<BodyInfo['orbit']>;
    const isMoon = info.kind === 'moon';
    const rows: Array<[string, string]> = [
      [t('orbit.semiMajor'), isMoon ? formatKm(o.semiMajorAxis) : formatDistanceAu(o.semiMajorAxis)],
      [t('orbit.eccentricity'), o.eccentricity.toFixed(5)],
      [
        t(isMoon ? 'orbit.inclinationParent' : 'orbit.inclinationEcliptic'),
        formatAngle(o.inclination, 3),
      ],
      [t('orbit.period'), formatDurationDays(o.periodDays)],
    ];
    if (o.speedKms) rows.push([t('orbit.speed'), `${o.speedKms.toFixed(2)} km/s`]);
    return el('div', {}, el('h3', { class: 'info-h3' }, t('info.orbit')), table(rows));
  }

  /** Refreshed every frame: the numbers that change as time runs. */
  updateLive(): void {
    const id = this.currentId;
    if (!id || !this.element.isConnected) return;
    const grid = this.liveEl.querySelector('#live-grid') as HTMLElement | null;
    if (!grid) return;
    const simulation = this.getSimulation();
    const state = simulation.get(id);
    if (!state) return;
    const earth = simulation.get('earth');
    const jdtt = jdToTT(simulation.jd);

    const cells: Array<[string, string]> = [];
    if (id !== 'sun') {
      cells.push([t('live.sunDistance'), formatDistanceAu(state.sunDistance)]);
    }
    if (earth && id !== 'earth') {
      const delta = vecLength(vecSub(state.position, earth.position));
      cells.push([t('live.earthDistance'), formatDistanceAu(delta)]);
      cells.push([t('live.lightTime'), lightTime(delta)]);
    }
    if (state.parentId) {
      const parent = BODY_BY_ID.get(state.parentId);
      const name = parent ? tr(parent.name) : t('live.parentFallback');
      cells.push([
        t('live.parentDistance', { parent: name }),
        formatKm(state.parentDistance * 149597870.7),
      ]);
    }
    if (id !== 'sun') cells.push([t('live.orbitSpeed'), `${state.speedKms.toFixed(2)} km/s`]);
    if (id === 'moon') {
      const sun = sunPosition(jdtt);
      const phase = moonPhase(jdtt, sun.lon, sun.dist);
      cells.push([t('live.moonPhase'), t('live.moonPhaseValue', {
        phase: phaseName(phase.phase), percent: (phase.illumination * 100).toFixed(1),
      })]);
      cells.push([t('live.moonAge'), t('live.moonAgeValue', { days: phase.ageDays.toFixed(1) })]);
    }
    cells.push([t('live.meridian'), formatAngle(state.meridian, 1)]);

    clear(grid);
    for (const [label, value] of cells) {
      grid.appendChild(el('div', { class: 'live-cell' },
        el('div', { class: 'live-label' }, label),
        el('div', { class: 'live-value' }, value),
      ));
    }
  }
}

/** Indices 0..n-1 in a random order. */
function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function table(rows: Array<[string, string]>): HTMLElement {
  const t = el('div', { class: 'data-table' });
  for (const [label, value] of rows) {
    t.appendChild(el('div', { class: 'data-row' },
      el('div', { class: 'data-label' }, label),
      el('div', { class: 'data-value' }, value),
    ));
  }
  return t;
}

function lightTime(au: number): string {
  const seconds = au * 499.005;
  if (seconds < 90) return t('unit.seconds', { value: seconds.toFixed(1) });
  if (seconds < 5400) return t('unit.minutes', { value: (seconds / 60).toFixed(1) });
  if (seconds < 86400 * 2) return t('unit.hours', { value: (seconds / 3600).toFixed(2) });
  return t('unit.days', { value: (seconds / 86400).toFixed(2) });
}

const PHASE_LIMITS: Array<[number, Parameters<typeof t>[0]]> = [
  [0.03, 'phase.new'], [0.22, 'phase.waxingCrescent'], [0.28, 'phase.firstQuarter'],
  [0.47, 'phase.waxingGibbous'], [0.53, 'phase.full'], [0.72, 'phase.waningGibbous'],
  [0.78, 'phase.lastQuarter'], [0.97, 'phase.waningCrescent'], [1.01, 'phase.new'],
];

function phaseName(phase: number): string {
  for (const [limit, key] of PHASE_LIMITS) if (phase < limit) return t(key);
  return t('phase.new');
}

export { formatBigNumber };
