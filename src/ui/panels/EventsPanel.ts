/**
 * Sun and Moon events for the chosen place: rise, transit, set, twilight and
 * the next eclipses with the local circumstances actually visible from there.
 */
import { AppState, PRESET_LOCATIONS } from '../../app/AppState';
import { ICONS, clear, el, icon } from '../dom';
import { formatClock, formatDate, formatDurationDays, formatOffset } from '../format';
import { DayEvents, dayEvents } from '../../astro/riseset';
import {
  Eclipse, LunarEclipse, SolarEclipse, findEclipses, localSolarCircumstances, lunarEclipseVisible,
} from '../../astro/eclipse';
import { moonPhase } from '../../astro/moon';
import { sunPosition } from '../../astro/sun';
import { jdToTT } from '../../astro/time';

const SOLAR_TYPE_NAMES: Record<string, string> = {
  total: '日全食', annular: '日环食', hybrid: '全环食', partial: '日偏食',
};
const LUNAR_TYPE_NAMES: Record<string, string> = {
  total: '月全食', partial: '月偏食', penumbral: '半影月食',
};

export interface EventsCallbacks {
  /** set the scene up to actually watch an eclipse happen */
  onWatchEclipse: (eclipse: Eclipse) => void;
}

export class EventsPanel {
  readonly element: HTMLElement;
  private readonly dayEl: HTMLElement;
  private readonly eclipseEl: HTMLElement;
  private readonly locationSelect: HTMLSelectElement;
  private readonly latInput: HTMLInputElement;
  private readonly lonInput: HTMLInputElement;
  private cachedDayKey = '';
  private cachedEclipseKey = '';

  constructor(
    private readonly state: AppState,
    private readonly callbacks: EventsCallbacks,
  ) {
    this.dayEl = el('div', { class: 'events-day' });
    this.eclipseEl = el('div', { class: 'events-eclipse' });

    this.locationSelect = el('select', {
      class: 'field',
      'aria-label': '观测地点',
      onchange: () => this.applyPreset(),
    }, ...PRESET_LOCATIONS.map((p, i) => el('option', { value: String(i) }, p.name)),
       el('option', { value: 'custom' }, '自定义坐标…'));

    this.latInput = el('input', { type: 'number', class: 'field field-num', step: '0.0001', min: '-90', max: '90', 'aria-label': '纬度' });
    this.lonInput = el('input', { type: 'number', class: 'field field-num', step: '0.0001', min: '-180', max: '180', 'aria-label': '经度' });
    for (const input of [this.latInput, this.lonInput]) {
      input.addEventListener('change', () => this.applyManual());
    }

    this.element = el(
      'div',
      { class: 'panel events-panel' },
      el('div', { class: 'panel-title' }, icon(ICONS.location, 14), '观测地点'),
      el('div', { class: 'location-row' },
        this.locationSelect,
        el('button', {
          class: 'btn btn-ghost btn-small',
          title: '使用设备定位',
          onclick: () => this.useGeolocation(),
        }, '定位'),
      ),
      el('div', { class: 'location-row' },
        el('label', { class: 'field-label' }, '纬度', this.latInput),
        el('label', { class: 'field-label' }, '经度', this.lonInput),
      ),
      el('div', { class: 'panel-title' }, icon(ICONS.clock, 14), '当日日出日落'),
      this.dayEl,
      el('div', { class: 'panel-title' }, icon(ICONS.eclipse, 14), '未来的日食与月食'),
      this.eclipseEl,
    );

    this.syncInputs();
    state.on('observer', () => {
      this.syncInputs();
      this.cachedDayKey = '';
      this.cachedEclipseKey = '';
      this.update(true);
    });
    this.update(true);
  }

  private syncInputs(): void {
    const { observer } = this.state;
    this.latInput.value = observer.latitude.toFixed(4);
    this.lonInput.value = observer.longitude.toFixed(4);
    const index = PRESET_LOCATIONS.findIndex((p) => p.name === observer.name);
    this.locationSelect.value = index >= 0 ? String(index) : 'custom';
  }

  private applyPreset(): void {
    const value = this.locationSelect.value;
    if (value === 'custom') return;
    this.state.setObserver({ ...PRESET_LOCATIONS[Number(value)] });
  }

  private applyManual(): void {
    const latitude = Math.max(-90, Math.min(90, Number(this.latInput.value)));
    const longitude = Math.max(-180, Math.min(180, Number(this.lonInput.value)));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    this.state.setObserver({
      name: '自定义',
      latitude,
      longitude,
      elevation: 0,
      // Nearest whole hour to the longitude, which is right for most places.
      offsetHours: Math.round(longitude / 15),
    });
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
      },
      () => {
        this.dayEl.prepend(el('div', { class: 'note' }, '无法获取定位权限，请手动输入坐标。'));
      },
      { timeout: 8000 },
    );
  }

  /** @param force recompute even when the day has not changed */
  update(force = false): void {
    const { time, observer } = this.state;
    const localDay = Math.floor(time.jd + observer.offsetHours / 24 + 0.5);
    const dayKey = `${localDay}|${observer.latitude}|${observer.longitude}`;
    if (force || dayKey !== this.cachedDayKey) {
      this.cachedDayKey = dayKey;
      this.renderDay(localDay - 0.5 - observer.offsetHours / 24);
    }
    const eclipseKey = `${Math.floor(time.jd / 30)}|${observer.latitude}|${observer.longitude}`;
    if (force || eclipseKey !== this.cachedEclipseKey) {
      this.cachedEclipseKey = eclipseKey;
      this.renderEclipses();
    }
  }

  private renderDay(jdLocalMidnight: number): void {
    const { observer, time } = this.state;
    const events: DayEvents = dayEvents(jdLocalMidnight, observer);
    const offset = observer.offsetHours;
    clear(this.dayEl);

    const jdtt = jdToTT(time.jd);
    const sun = sunPosition(jdtt);
    const phase = moonPhase(jdtt, sun.lon, sun.dist);

    if (events.polarDay) {
      this.dayEl.appendChild(el('div', { class: 'highlight' }, '极昼：太阳整日不落'));
    } else if (events.polarNight) {
      this.dayEl.appendChild(el('div', { class: 'highlight' }, '极夜：太阳整日不升'));
    }

    const rows: Array<[string, string]> = [
      ['日出', formatClock(events.sunrise, offset)],
      ['正午（上中天）', formatClock(events.solarNoon, offset)],
      ['日落', formatClock(events.sunset, offset)],
      ['昼长', events.dayLength ? `${Math.floor(events.dayLength)} 小时 ${Math.round((events.dayLength % 1) * 60)} 分` : '—'],
      ['正午太阳高度', `${events.maxSunAltitude.toFixed(2)}°`],
      ['民用晨光 / 昏影', `${formatClock(events.civilDawn, offset)} / ${formatClock(events.civilDusk, offset)}`],
      ['航海晨光 / 昏影', `${formatClock(events.nauticalDawn, offset)} / ${formatClock(events.nauticalDusk, offset)}`],
      ['天文晨光 / 昏影', `${formatClock(events.astronomicalDawn, offset)} / ${formatClock(events.astronomicalDusk, offset)}`],
      ['月出 / 月落', `${formatClock(events.moonrise, offset)} / ${formatClock(events.moonset, offset)}`],
      ['月相', `照亮 ${(phase.illumination * 100).toFixed(0)}% · 月龄 ${phase.ageDays.toFixed(1)} 天`],
    ];
    const table = el('div', { class: 'data-table' });
    for (const [label, value] of rows) {
      table.appendChild(el('div', { class: 'data-row' },
        el('div', { class: 'data-label' }, label),
        el('div', { class: 'data-value' }, value),
      ));
    }
    this.dayEl.appendChild(table);
    this.dayEl.appendChild(el('div', { class: 'events-foot' },
      `${formatDate(this.state.time.jd, offset)} · ${observer.name} ${observer.latitude.toFixed(3)}°, ${observer.longitude.toFixed(3)}° · ${formatOffset(offset)}`));

    const jump = el('div', { class: 'chip-row' });
    for (const [label, jd] of [['跳到日出', events.sunrise], ['跳到日落', events.sunset]] as Array<[string, number | undefined]>) {
      if (jd === undefined) continue;
      jump.appendChild(el('button', {
        class: 'chip',
        onclick: () => { this.state.time.jd = jd; this.state.time.playing = false; this.state.emit('time'); },
      }, label));
    }
    this.dayEl.appendChild(jump);
  }

  private renderEclipses(): void {
    const { time, observer } = this.state;
    clear(this.eclipseEl);
    const eclipses = findEclipses(time.jd, { limit: 8 });
    for (const eclipse of eclipses) {
      this.eclipseEl.appendChild(this.eclipseCard(eclipse));
    }
    this.eclipseEl.appendChild(el('div', { class: 'events-foot' },
      `本地可见性按 ${observer.name}（${observer.latitude.toFixed(2)}°, ${observer.longitude.toFixed(2)}°）计算`));
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
}
