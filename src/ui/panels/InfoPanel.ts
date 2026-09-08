/** Details of the selected body: live geometry plus the popular-science card. */
import { AppState } from '../../app/AppState';
import type { Simulation } from '../../app/Simulation';
import { BODY_BY_ID, BodyInfo, moonsOf } from '../../data';
import { ICONS, clear, el, icon } from '../dom';
import {
  formatAngle, formatBigNumber, formatDistanceAu, formatDurationDays, formatHours, formatKm,
  formatTemperature,
} from '../format';
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
  private currentId: string | null = null;

  constructor(
    private readonly state: AppState,
    private readonly getSimulation: () => Simulation,
    private readonly onSurfaceView: (bodyId: string) => void,
  ) {
    this.bodyEl = el('div', { class: 'info-body' });
    this.liveEl = el('div', { class: 'info-live' });
    this.element = el('div', { class: 'panel info-panel' }, this.liveEl, this.bodyEl);
    state.on('selection', () => this.render());
    this.render();
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
          el('div', { class: 'info-hint-title' }, '点击任意天体开始探索'),
          el('div', {}, '也可以从左侧列表选择，或用搜索框查找。'),
        ),
      );
      return;
    }
    const info = BODY_BY_ID.get(id);
    if (!info) return;

    this.liveEl.appendChild(this.header(info));
    this.liveEl.appendChild(el('div', { class: 'live-grid', id: 'live-grid' }));

    this.bodyEl.appendChild(el('p', { class: 'info-desc' }, info.description));

    if (APPROXIMATE_PHASE.has(info.id) || (SMALL_BODY_BY_ID.get(info.id)?.phaseIsReal === false)) {
      this.bodyEl.appendChild(
        el('div', { class: 'note' },
          '注：该天体的轨道要素（半长轴、偏心率、倾角、周期）为实测值，但历元时刻的轨道相位为近似值，因此显示位置与真实位置可能存在偏差。'),
      );
    }

    this.bodyEl.appendChild(this.factList(info));
    this.bodyEl.appendChild(this.physicalTable(info));
    if (info.orbit) this.bodyEl.appendChild(this.orbitTable(info));

    const moons = moonsOf(info.id);
    if (moons.length > 0) {
      this.bodyEl.appendChild(el('h3', { class: 'info-h3' }, `卫星（本站收录 ${moons.length} 颗）`));
      const list = el('div', { class: 'chip-row' });
      for (const moon of moons) {
        list.appendChild(el('button', {
          class: 'chip',
          onclick: () => this.state.select(moon.id),
        }, moon.name));
      }
      this.bodyEl.appendChild(list);
    }

    if (info.discovery) {
      this.bodyEl.appendChild(
        el('div', { class: 'info-meta' }, `发现：${info.discovery.by} · ${info.discovery.year} 年`),
      );
    }
    if (info.missions?.length) {
      this.bodyEl.appendChild(
        el('div', { class: 'info-meta' }, `探测任务：${info.missions.join('、')}`),
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
      }, icon(ICONS.globe, 13), '站在表面'));
    }
    actions.appendChild(el('button', {
      class: 'btn btn-small',
      onclick: () => { this.state.settings.focus = info.id; this.state.emit('settings'); },
    }, '跟随'));

    return el(
      'div',
      { class: 'info-head' },
      el('div', { class: 'info-title-row' },
        info.symbol ? el('span', { class: 'info-symbol' }, info.symbol) : null,
        el('h2', { class: 'info-title' }, info.name),
        el('span', { class: 'info-en' }, info.nameEn),
      ),
      el('div', { class: 'info-tagline' }, info.tagline),
      parent ? el('div', { class: 'info-parent' }, `${parent.name}的卫星`) : null,
      actions,
    );
  }

  private factList(info: BodyInfo): HTMLElement {
    const list = el('ul', { class: 'fact-list' });
    for (const fact of info.facts) list.appendChild(el('li', {}, fact));
    return el('div', {}, el('h3', { class: 'info-h3' }, '你可能不知道'), list);
  }

  private physicalTable(info: BodyInfo): HTMLElement {
    const p = info.physical;
    const rows: Array<[string, string]> = [
      ['平均半径', formatKm(p.radiusKm)],
      ['质量', `${p.massKg.toExponential(3)} 公斤`],
    ];
    if (p.density) rows.push(['平均密度', `${p.density.toFixed(3)} g/cm³`]);
    if (p.gravity) rows.push(['表面重力', `${p.gravity.toFixed(2)} m/s²（地球的 ${(p.gravity / 9.807).toFixed(2)} 倍）`]);
    if (p.escapeVelocity) rows.push(['逃逸速度', `${p.escapeVelocity.toFixed(2)} km/s`]);
    if (p.rotationHours) rows.push(['自转周期', formatHours(p.rotationHours)]);
    if (p.axialTilt !== undefined) rows.push(['自转轴倾角', formatAngle(p.axialTilt, 2)]);
    if (p.albedo !== undefined) rows.push(['反照率', p.albedo.toFixed(3)]);
    if (p.meanTempC !== undefined) {
      const range = p.minTempC !== undefined && p.maxTempC !== undefined
        ? `${formatTemperature(p.meanTempC)}（${p.minTempC} ~ ${p.maxTempC} ℃）`
        : formatTemperature(p.meanTempC);
      rows.push(['平均温度', range]);
    }
    if (p.surfacePressureBar !== undefined) rows.push(['地表气压', `${p.surfacePressureBar} bar`]);
    if (p.atmosphere) rows.push(['大气成分', p.atmosphere]);
    if (p.moonCount !== undefined) rows.push(['已确认卫星', `${p.moonCount} 颗`]);
    return el('div', {}, el('h3', { class: 'info-h3' }, '物理参数'), table(rows));
  }

  private orbitTable(info: BodyInfo): HTMLElement {
    const o = info.orbit as NonNullable<BodyInfo['orbit']>;
    const isMoon = info.kind === 'moon';
    const rows: Array<[string, string]> = [
      [isMoon ? '轨道半长轴' : '轨道半长轴', isMoon ? formatKm(o.semiMajorAxis) : formatDistanceAu(o.semiMajorAxis)],
      ['偏心率', o.eccentricity.toFixed(5)],
      [isMoon ? '轨道倾角（对母星赤道）' : '轨道倾角（对黄道）', formatAngle(o.inclination, 3)],
      ['公转周期', formatDurationDays(o.periodDays)],
    ];
    if (o.speedKms) rows.push(['平均轨道速度', `${o.speedKms.toFixed(2)} km/s`]);
    return el('div', {}, el('h3', { class: 'info-h3' }, '轨道参数'), table(rows));
  }

  /** Refreshed every frame: the numbers that change as time runs. */
  updateLive(): void {
    const id = this.currentId;
    if (!id) return;
    const grid = this.liveEl.querySelector('#live-grid') as HTMLElement | null;
    if (!grid) return;
    const simulation = this.getSimulation();
    const state = simulation.get(id);
    if (!state) return;
    const earth = simulation.get('earth');
    const jdtt = jdToTT(simulation.jd);

    const cells: Array<[string, string]> = [];
    if (id !== 'sun') {
      cells.push(['当前日心距', formatDistanceAu(state.sunDistance)]);
    }
    if (earth && id !== 'earth') {
      const delta = vecLength(vecSub(state.position, earth.position));
      cells.push(['当前地心距', formatDistanceAu(delta)]);
      cells.push(['光行时间', lightTime(delta)]);
    }
    if (state.parentId) {
      const parent = BODY_BY_ID.get(state.parentId);
      cells.push([`到${parent?.name ?? '母星'}距离`, formatKm(state.parentDistance * 149597870.7)]);
    }
    if (id !== 'sun') cells.push(['轨道速度', `${state.speedKms.toFixed(2)} km/s`]);
    if (id === 'moon') {
      const sun = sunPosition(jdtt);
      const phase = moonPhase(jdtt, sun.lon, sun.dist);
      cells.push(['月相', `${phaseName(phase.phase)} · 照亮 ${(phase.illumination * 100).toFixed(1)}%`]);
      cells.push(['月龄', `${phase.ageDays.toFixed(1)} 天`]);
    }
    cells.push(['自转角 W', formatAngle(state.meridian, 1)]);

    clear(grid);
    for (const [label, value] of cells) {
      grid.appendChild(el('div', { class: 'live-cell' },
        el('div', { class: 'live-label' }, label),
        el('div', { class: 'live-value' }, value),
      ));
    }
  }
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
  if (seconds < 90) return `${seconds.toFixed(1)} 秒`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} 分钟`;
  if (seconds < 86400 * 2) return `${(seconds / 3600).toFixed(2)} 小时`;
  return `${(seconds / 86400).toFixed(2)} 天`;
}

function phaseName(phase: number): string {
  const names: Array<[number, string]> = [
    [0.03, '新月'], [0.22, '娥眉月'], [0.28, '上弦月'], [0.47, '盈凸月'],
    [0.53, '满月'], [0.72, '亏凸月'], [0.78, '下弦月'], [0.97, '残月'], [1.01, '新月'],
  ];
  for (const [limit, name] of names) if (phase < limit) return name;
  return '新月';
}

export { formatBigNumber };
