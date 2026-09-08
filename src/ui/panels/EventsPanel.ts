/**
 * Events for the body you are looking at.
 *
 * The Earth gets the full almanac - rise, set, twilight, moon phase and the
 * eclipse list - because those are Earth phenomena. Every other world gets the
 * same question answered for itself: when does the Sun rise where you are
 * standing on it, how long is its day, and when does it next reach perihelion,
 * opposition or greatest elongation.
 */
import { AppState, PRESET_LOCATIONS } from '../../app/AppState';
import { BODY_BY_ID, BodyInfo } from '../../data';
import { ICONS, clear, el, icon } from '../dom';
import { formatClock, formatDate, formatDistanceAu, formatDurationDays, formatOffset } from '../format';
import { DayEvents, dayEvents } from '../../astro/riseset';
import {
  ApsisEvent, ElongationEvent, elongationFromEarth, nextApsides, nextElongationEvents,
  solarDayEvents,
} from '../../astro/localsky';
import {
  Eclipse, LunarEclipse, SolarEclipse, findEclipses, localSolarCircumstances, lunarEclipseVisible,
} from '../../astro/eclipse';
import { moonPhase, moonPosition } from '../../astro/moon';
import { sunPosition } from '../../astro/sun';
import { jdToTT, ttToJD } from '../../astro/time';

const SOLAR_TYPE_NAMES: Record<string, string> = {
  total: '日全食', annular: '日环食', hybrid: '全环食', partial: '日偏食',
};
const LUNAR_TYPE_NAMES: Record<string, string> = {
  total: '月全食', partial: '月偏食', penumbral: '半影月食',
};
const ELONGATION_NAMES: Record<ElongationEvent['kind'], string> = {
  opposition: '冲（整夜可见，最亮）',
  conjunction: '合（被太阳淹没）',
  inferiorConjunction: '下合（经过太阳与地球之间）',
  superiorConjunction: '上合（运行到太阳背后）',
  greatestElongationEast: '东大距（傍晚西方天空）',
  greatestElongationWest: '西大距（黎明东方天空）',
};

export interface EventsCallbacks {
  /** set the scene up to actually watch an eclipse happen */
  onWatchEclipse: (eclipse: Eclipse) => void;
  /** point the camera at a place on a body's surface and mark it */
  onShowLocation: (bodyId: string) => void;
}

/** Bodies whose surface you can meaningfully stand on for a sunrise. */
function hasSurface(info: BodyInfo): boolean {
  return info.kind !== 'star' && info.kind !== 'comet' && !!info.physical.rotationHours;
}

export class EventsPanel {
  readonly element: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private cacheKey = '';
  private lastComputeAt = 0;

  constructor(
    private readonly state: AppState,
    private readonly callbacks: EventsCallbacks,
  ) {
    this.bodyEl = el('div', { class: 'events-body' });
    this.element = el('div', { class: 'panel events-panel' }, this.bodyEl);
    state.on('selection', () => this.update(true));
    state.on('observer', () => this.update(true));
    this.update(true);
  }

  /** The body whose events are on show; defaults to the Earth. */
  private get targetId(): string {
    const selected = this.state.settings.selected;
    if (!selected) return 'earth';
    return selected;
  }

  /** @param force recompute even when nothing obvious has changed */
  update(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastComputeAt < 250) return;

    const { time, observer } = this.state;
    const id = this.targetId;
    const point = this.state.surfacePointFor(id);
    const key = [
      id,
      Math.floor(time.jd + observer.offsetHours / 24 + 0.5),
      point.latitude.toFixed(3),
      point.longitude.toFixed(3),
    ].join('|');
    if (!force && key === this.cacheKey) return;
    this.cacheKey = key;
    this.lastComputeAt = now;
    this.render();
  }

  private render(): void {
    const id = this.targetId;
    const info = BODY_BY_ID.get(id);
    clear(this.bodyEl);
    if (!info) return;

    this.bodyEl.appendChild(
      el('div', { class: 'events-head' },
        el('span', { class: 'events-head-name' }, info.name),
        el('span', { class: 'events-head-sub' }, '的事件'),
        this.state.settings.selected
          ? null
          : el('span', { class: 'events-head-hint' }, '（未选中天体，默认显示地球）'),
      ),
    );

    if (info.kind === 'star') {
      this.renderSeasons();
      this.renderOrbitalEvents('earth', '地球的近日点与远日点');
      return;
    }

    if (hasSurface(info)) this.renderSurfaceSection(info);
    if (id === 'earth' || id === 'moon') this.renderEclipses();
    if (id === 'moon') this.renderLunarApsides();
    if (info.kind !== 'moon') this.renderOrbitalEvents(id);
  }

  // ---------------------------------------------------------------- surface

  private renderSurfaceSection(info: BodyInfo): void {
    const isEarth = info.id === 'earth';
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.location, 14), isEarth ? '观测地点' : `${info.name}上的观测点`),
    );
    this.bodyEl.appendChild(this.locationControls(info));
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.clock, 14), isEarth ? '当日日出日落' : '日出日落'),
    );
    if (isEarth) this.renderEarthDay();
    else this.renderGenericDay(info);
  }

  private locationControls(info: BodyInfo): HTMLElement {
    const isEarth = info.id === 'earth';
    const point = this.state.surfacePointFor(info.id);

    const latInput = el('input', {
      type: 'number', class: 'field field-num', step: '0.0001', min: '-90', max: '90',
      'aria-label': '纬度', value: point.latitude.toFixed(4),
    });
    const lonInput = el('input', {
      type: 'number', class: 'field field-num', step: '0.0001', min: '-180', max: '180',
      'aria-label': '经度', value: point.longitude.toFixed(4),
    });
    const apply = () => {
      const latitude = Math.max(-90, Math.min(90, Number(latInput.value)));
      const longitude = Math.max(-180, Math.min(180, Number(lonInput.value)));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      if (isEarth) {
        this.state.setObserver({
          name: '自定义', latitude, longitude, elevation: 0,
          offsetHours: Math.round(longitude / 15),
        });
      } else {
        this.state.otherSurfacePoint = { latitude, longitude };
        this.update(true);
      }
      this.callbacks.onShowLocation(info.id);
    };
    latInput.addEventListener('change', apply);
    lonInput.addEventListener('change', apply);

    const rows: HTMLElement[] = [];
    if (isEarth) {
      const select = el('select', {
        class: 'field', 'aria-label': '观测地点',
        onchange: () => {
          if (select.value === 'custom') return;
          this.state.setObserver({ ...PRESET_LOCATIONS[Number(select.value)] });
          this.callbacks.onShowLocation('earth');
        },
      }, ...PRESET_LOCATIONS.map((p, i) => el('option', { value: String(i) }, p.name)),
         el('option', { value: 'custom' }, '自定义坐标…'));
      const index = PRESET_LOCATIONS.findIndex((p) => p.name === this.state.observer.name);
      select.value = index >= 0 ? String(index) : 'custom';
      rows.push(el('div', { class: 'location-row' },
        select,
        el('button', {
          class: 'btn btn-ghost btn-small',
          title: '使用设备定位',
          onclick: () => this.useGeolocation(),
        }, '定位'),
      ));
    }
    rows.push(el('div', { class: 'location-row' },
      el('label', { class: 'field-label' }, '纬度', latInput),
      el('label', { class: 'field-label' }, '经度', lonInput),
      el('button', {
        class: 'btn btn-ghost btn-small',
        title: '把镜头转到这个位置',
        onclick: () => this.callbacks.onShowLocation(info.id),
      }, '定位到此'),
    ));
    return el('div', {}, ...rows);
  }

  private useGeolocation(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.state.setObserver({
          name: '我的位置',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevation: position.coords.altitude ?? 0,
          offsetHours: -new Date().getTimezoneOffset() / 60,
        });
        this.callbacks.onShowLocation('earth');
      },
      () => {
        this.bodyEl.prepend(el('div', { class: 'note' }, '无法获取定位权限，请手动输入坐标。'));
      },
      { timeout: 8000 },
    );
  }

  private renderEarthDay(): void {
    const { observer, time } = this.state;
    const offset = observer.offsetHours;
    const localMidnight = Math.floor(time.jd + offset / 24 + 0.5) - 0.5 - offset / 24;
    const events: DayEvents = dayEvents(localMidnight, observer);

    const jdtt = jdToTT(time.jd);
    const sun = sunPosition(jdtt);
    const phase = moonPhase(jdtt, sun.lon, sun.dist);

    if (events.polarDay) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, '极昼：太阳整日不落'));
    } else if (events.polarNight) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, '极夜：太阳整日不升'));
    }

    this.bodyEl.appendChild(table([
      ['日出', formatClock(events.sunrise, offset)],
      ['正午（上中天）', formatClock(events.solarNoon, offset)],
      ['日落', formatClock(events.sunset, offset)],
      ['昼长', events.dayLength
        ? `${Math.floor(events.dayLength)} 小时 ${Math.round((events.dayLength % 1) * 60)} 分`
        : '—'],
      ['正午太阳高度', `${events.maxSunAltitude.toFixed(2)}°`],
      ['民用晨光 / 昏影', `${formatClock(events.civilDawn, offset)} / ${formatClock(events.civilDusk, offset)}`],
      ['航海晨光 / 昏影', `${formatClock(events.nauticalDawn, offset)} / ${formatClock(events.nauticalDusk, offset)}`],
      ['天文晨光 / 昏影', `${formatClock(events.astronomicalDawn, offset)} / ${formatClock(events.astronomicalDusk, offset)}`],
      ['月出 / 月落', `${formatClock(events.moonrise, offset)} / ${formatClock(events.moonset, offset)}`],
      ['月相', `照亮 ${(phase.illumination * 100).toFixed(0)}% · 月龄 ${phase.ageDays.toFixed(1)} 天`],
    ]));
    this.bodyEl.appendChild(el('div', { class: 'events-foot' },
      `${formatDate(time.jd, offset)} · ${observer.name} ${observer.latitude.toFixed(3)}°, ${observer.longitude.toFixed(3)}° · ${formatOffset(offset)}`));

    const jump = el('div', { class: 'chip-row' });
    for (const [label, jd] of [['跳到日出', events.sunrise], ['跳到日落', events.sunset]] as Array<[string, number | undefined]>) {
      if (jd === undefined) continue;
      jump.appendChild(el('button', { class: 'chip', onclick: () => this.jumpTo(jd) }, label));
    }
    this.bodyEl.appendChild(jump);
  }

  private renderGenericDay(info: BodyInfo): void {
    const offset = this.state.observer.offsetHours;
    const point = this.state.surfacePointFor(info.id);
    const events = solarDayEvents(
      { bodyId: info.id, latitude: point.latitude, longitude: point.longitude },
      jdToTT(this.state.time.jd),
    );
    if (!events) {
      this.bodyEl.appendChild(el('div', { class: 'note' }, '该天体的自转数据不足以计算日出日落。'));
      return;
    }

    if (events.polarDay) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, '此刻该点处于极昼：太阳不落'));
    } else if (events.polarNight) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, '此刻该点处于极夜：太阳不升'));
    }

    const solarDayHours = events.solarDayDays * 24;
    this.bodyEl.appendChild(table([
      ['下次日出', events.sunrise ? formatDate(ttToJD(events.sunrise), offset) + ' ' + formatClock(ttToJD(events.sunrise), offset) : '—'],
      ['太阳上中天', events.noon ? formatDate(ttToJD(events.noon), offset) + ' ' + formatClock(ttToJD(events.noon), offset) : '—'],
      ['下次日落', events.sunset ? formatDate(ttToJD(events.sunset), offset) + ' ' + formatClock(ttToJD(events.sunset), offset) : '—'],
      ['白昼时长', events.daylightHours > 0 ? formatDurationDays(events.daylightHours / 24) : '—'],
      ['正午太阳高度', `${events.maxAltitude.toFixed(2)}°`],
      ['一个太阳日', solarDayHours < 72
        ? `${solarDayHours.toFixed(2)} 小时`
        : `${events.solarDayDays.toFixed(2)} 个地球日`],
    ]));
    this.bodyEl.appendChild(el('div', { class: 'events-foot' },
      `观测点 ${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}° · 时刻按${formatOffset(offset)}显示`));

    const jump = el('div', { class: 'chip-row' });
    for (const [label, jd] of [['跳到日出', events.sunrise], ['跳到日落', events.sunset]] as Array<[string, number | undefined]>) {
      if (jd === undefined) continue;
      jump.appendChild(el('button', { class: 'chip', onclick: () => this.jumpTo(ttToJD(jd)) }, label));
    }
    this.bodyEl.appendChild(jump);
  }

  // ---------------------------------------------------------------- eclipses

  private renderEclipses(): void {
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.eclipse, 14), '未来的日食与月食'),
    );
    for (const eclipse of findEclipses(this.state.time.jd, { limit: 6 })) {
      this.bodyEl.appendChild(this.eclipseCard(eclipse));
    }
    this.bodyEl.appendChild(el('div', { class: 'events-foot' },
      `本地可见性按 ${this.state.observer.name}（${this.state.observer.latitude.toFixed(2)}°, ${this.state.observer.longitude.toFixed(2)}°）计算`));
  }

  private eclipseCard(eclipse: Eclipse): HTMLElement {
    const { observer } = this.state;
    const offset = observer.offsetHours;
    const isSolar = eclipse.kind === 'solar';
    const typeName = isSolar
      ? SOLAR_TYPE_NAMES[(eclipse as SolarEclipse).type]
      : LUNAR_TYPE_NAMES[(eclipse as LunarEclipse).type];

    const lines: HTMLElement[] = [];
    if (isSolar) {
      const solar = eclipse as SolarEclipse;
      const local = localSolarCircumstances(solar, observer);
      lines.push(el('div', { class: 'eclipse-line' },
        `全球食甚：${formatDate(solar.jdMax, offset)} ${formatClock(solar.jdMax, offset)}（${formatOffset(offset)}）`));
      lines.push(el('div', { class: 'eclipse-line' },
        `食甚点：${solar.greatestAt.latitude.toFixed(1)}°, ${solar.greatestAt.longitude.toFixed(1)}° · γ=${solar.gamma.toFixed(3)}`));
      if (local.visible && local.magnitude > 0) {
        const kind = local.type === 'total' ? '全食' : local.type === 'annular' ? '环食' : '偏食';
        lines.push(el('div', { class: 'eclipse-local is-visible' },
          `${observer.name}可见${kind}：食分 ${local.magnitude.toFixed(3)}，遮挡 ${(local.obscuration * 100).toFixed(1)}%`));
        lines.push(el('div', { class: 'eclipse-line' },
          `初亏 ${formatClock(local.firstContact, offset)} · 食甚 ${formatClock(local.jdMax, offset)} · 复圆 ${formatClock(local.lastContact, offset)}`));
        if (local.centralStart && local.centralEnd) {
          lines.push(el('div', { class: 'eclipse-line' },
            `${kind}持续 ${((local.centralEnd - local.centralStart) * 86400).toFixed(0)} 秒`));
        }
      } else {
        lines.push(el('div', { class: 'eclipse-local' },
          local.magnitude > 0
            ? `${observer.name}不可见：食甚时太阳在地平线下 ${Math.abs(local.sunAltitude).toFixed(0)}°`
            : `${observer.name}不可见：此地不在食带范围内`));
      }
    } else {
      const lunar = eclipse as LunarEclipse;
      const visibility = lunarEclipseVisible(lunar, observer);
      lines.push(el('div', { class: 'eclipse-line' },
        `食甚：${formatDate(lunar.jdMax, offset)} ${formatClock(lunar.jdMax, offset)}（${formatOffset(offset)}）`));
      if (lunar.umbralMagnitude > 0) {
        lines.push(el('div', { class: 'eclipse-line' },
          `本影食分 ${lunar.umbralMagnitude.toFixed(3)}${lunar.semiDurationPartial ? ` · 偏食持续 ${formatDurationDays((lunar.semiDurationPartial * 2) / 1440)}` : ''}`));
      } else {
        lines.push(el('div', { class: 'eclipse-line' }, `半影食分 ${lunar.penumbralMagnitude.toFixed(3)}`));
      }
      if (lunar.semiDurationTotal) {
        lines.push(el('div', { class: 'eclipse-line' },
          `全食持续 ${formatDurationDays((lunar.semiDurationTotal * 2) / 1440)}`));
      }
      lines.push(el('div', { class: visibility.visible ? 'eclipse-local is-visible' : 'eclipse-local' },
        visibility.visible
          ? `${observer.name}可见（食甚时月亮高度 ${visibility.moonAltitude.toFixed(0)}°）`
          : `${observer.name}不可见（食甚时月亮在地平线下）`));
    }

    return el('div', { class: `eclipse-card ${isSolar ? 'is-solar' : 'is-lunar'}` },
      el('div', { class: 'eclipse-head' },
        el('span', { class: 'eclipse-type' }, typeName),
        el('span', { class: 'eclipse-date' }, formatDate(eclipse.jdMax, offset)),
        el('button', {
          class: 'chip chip-small',
          title: '把时间调到食甚并把镜头对准影子',
          onclick: () => this.callbacks.onWatchEclipse(eclipse),
        }, '在 3D 中观看'),
      ),
      ...lines,
    );
  }

  // ------------------------------------------------------------ orbit events

  private renderOrbitalEvents(id: string, title = '轨道事件'): void {
    const offset = this.state.observer.offsetHours;
    const jdtt = jdToTT(this.state.time.jd);
    const info = BODY_BY_ID.get(id);
    const period = info?.orbit?.periodDays ?? 365.25;
    const horizon = Math.min(Math.max(period * 1.4, 500), 40000);

    const apsides: ApsisEvent[] = nextApsides(id, jdtt, horizon);
    const elongations: ElongationEvent[] = id === 'earth' ? [] : nextElongationEvents(id, jdtt, horizon);
    if (apsides.length === 0 && elongations.length === 0) return;

    this.bodyEl.appendChild(el('div', { class: 'panel-title' }, icon(ICONS.globe, 14), title));

    const rows: Array<[string, string]> = [];
    for (const apsis of apsides) {
      rows.push([
        apsis.kind === 'perihelion' ? '下次过近日点' : '下次过远日点',
        `${formatDate(ttToJD(apsis.jd), offset)} · ${apsis.distanceAu.toFixed(4)} AU`,
      ]);
    }
    const current = elongationFromEarth(id, jdtt);
    if (current && id !== 'earth') {
      rows.push(['当前距角', `${current.elongation.toFixed(1)}° · 距地球 ${formatDistanceAu(current.distanceAu)}`]);
    }
    this.bodyEl.appendChild(table(rows));

    for (const event of elongations.slice(0, 3)) {
      this.bodyEl.appendChild(
        el('div', { class: 'event-row' },
          el('div', { class: 'event-kind' }, ELONGATION_NAMES[event.kind]),
          el('div', { class: 'event-when' },
            `${formatDate(ttToJD(event.jd), offset)} · 距角 ${event.elongation.toFixed(1)}° · 距地球 ${event.distanceAu.toFixed(3)} AU`),
          el('button', { class: 'chip chip-small', onclick: () => this.jumpTo(ttToJD(event.jd)) }, '跳转'),
        ),
      );
    }
  }

  /** Perigee and apogee, which is why some full moons are "supermoons". */
  private renderLunarApsides(): void {
    const offset = this.state.observer.offsetHours;
    const jdtt = jdToTT(this.state.time.jd);
    const distance = (jd: number) => moonPosition(jd).distKm;
    const found: Array<[string, number, number]> = [];
    const step = 0.25;
    let previous = distance(jdtt);
    let current = distance(jdtt + step);
    for (let jd = jdtt + step; jd < jdtt + 60 && found.length < 2; jd += step) {
      const next = distance(jd + step);
      if (current < previous && current < next) found.push(['下次过近地点', jd, current]);
      else if (current > previous && current > next) found.push(['下次过远地点', jd, current]);
      previous = current;
      current = next;
    }
    if (found.length === 0) return;
    this.bodyEl.appendChild(el('div', { class: 'panel-title' }, icon(ICONS.globe, 14), '近地点与远地点'));
    this.bodyEl.appendChild(table(found.map(([label, jd, km]) =>
      [label, `${formatDate(ttToJD(jd), offset)} · ${Math.round(km).toLocaleString('en-US')} 公里`] as [string, string])));
  }

  /** For the Sun: the moments that define the Earth's seasons. */
  private renderSeasons(): void {
    const offset = this.state.observer.offsetHours;
    const names = ['春分', '夏至', '秋分', '冬至'];
    const jdtt = jdToTT(this.state.time.jd);
    const rows: Array<[string, string]> = [];
    for (let i = 0; i < 4; i++) {
      const target = i * 90;
      const jd = solveSolarLongitude(target, jdtt);
      if (jd > jdtt) rows.push([names[i], `${formatDate(ttToJD(jd), offset)} ${formatClock(ttToJD(jd), offset)}`]);
    }
    // Wrap into next year so four entries are always shown.
    for (let i = 0; i < 4 && rows.length < 4; i++) {
      const jd = solveSolarLongitude(i * 90, jdtt + 366);
      rows.push([names[i], `${formatDate(ttToJD(jd), offset)} ${formatClock(ttToJD(jd), offset)}`]);
    }
    rows.sort((a, b) => a[1].localeCompare(b[1]));
    this.bodyEl.appendChild(el('div', { class: 'panel-title' }, icon(ICONS.clock, 14), '二分二至（北半球）'));
    this.bodyEl.appendChild(table(rows));
  }

  private jumpTo(jd: number): void {
    this.state.time.jd = jd;
    this.state.time.playing = false;
    this.state.emit('time');
    this.update(true);
  }
}

/** First instant after `after` when the Sun reaches the given ecliptic longitude. */
function solveSolarLongitude(targetDeg: number, after: number): number {
  let jd = after;
  for (let i = 0; i < 60; i++) {
    const lon = sunPosition(jd).lon;
    let delta = ((lon - targetDeg + 540) % 360) - 180;
    if (delta > 0) delta -= 360; // always search forwards
    jd -= delta / 0.9856473;
    if (Math.abs(delta) < 1e-7) break;
  }
  return jd;
}

function table(rows: Array<[string, string]>): HTMLElement {
  const node = el('div', { class: 'data-table' });
  for (const [label, value] of rows) {
    node.appendChild(el('div', { class: 'data-row' },
      el('div', { class: 'data-label' }, label),
      el('div', { class: 'data-value' }, value),
    ));
  }
  return node;
}
