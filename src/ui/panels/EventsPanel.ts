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
import { type StringKey, t, tr } from '../../i18n';
import { DayEvents, dayEvents } from '../../astro/riseset';
import {
  ApsisEvent, ElongationEvent, elongationFromEarth, nextApsides, nextElongationEvents,
  solarDayEvents,
} from '../../astro/localsky';
import {
  Eclipse, LunarEclipse, SolarEclipse, findEclipses, localSolarCircumstances, lunarEclipseVisible,
} from '../../astro/eclipse';
import { moonPhase, moonPosition } from '../../astro/moon';
import { nextSolarLongitude, sunPosition } from '../../astro/sun';
import { jdToTT, ttToJD } from '../../astro/time';

const SOLAR_TYPE_KEYS: Record<string, StringKey> = {
  total: 'eclipse.solar.total', annular: 'eclipse.solar.annular',
  hybrid: 'eclipse.solar.hybrid', partial: 'eclipse.solar.partial',
};
const LUNAR_TYPE_KEYS: Record<string, StringKey> = {
  total: 'eclipse.lunar.total', partial: 'eclipse.lunar.partial',
  penumbral: 'eclipse.lunar.penumbral',
};
const ELONGATION_KEYS: Record<ElongationEvent['kind'], StringKey> = {
  opposition: 'elongation.opposition',
  conjunction: 'elongation.conjunction',
  inferiorConjunction: 'elongation.inferiorConjunction',
  superiorConjunction: 'elongation.superiorConjunction',
  greatestElongationEast: 'elongation.greatestElongationEast',
  greatestElongationWest: 'elongation.greatestElongationWest',
};
const SEASON_KEYS: StringKey[] = [
  'season.marchEquinox', 'season.juneSolstice',
  'season.septemberEquinox', 'season.decemberSolstice',
];

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
  private eclipseSection: HTMLElement | null = null;
  private eclipseKey = '';
  private readonly off: Array<() => void> = [];

  constructor(
    private readonly state: AppState,
    private readonly callbacks: EventsCallbacks,
  ) {
    this.bodyEl = el('div', { class: 'events-body' });
    this.element = el('div', { class: 'panel events-panel' }, this.bodyEl);
    this.off.push(state.on('selection', () => this.update(true)));
    this.off.push(state.on('observer', () => this.update(true)));
    this.update(true);
  }

  dispose(): void {
    for (const off of this.off) off();
    this.off.length = 0;
  }

  /** The body whose events are on show; defaults to the Earth. */
  private get targetId(): string {
    const selected = this.state.settings.selected;
    if (!selected) return 'earth';
    return selected;
  }

  /** @param force recompute even when nothing obvious has changed */
  update(force = false): void {
    // A panel on an inactive tab is not in the document, and rebuilding the
    // almanac for something nobody is looking at was costing a whole frame
    // every simulated day - which at a day a second is once per rotation.
    if (!this.element.isConnected) {
      this.cacheKey = '';
      return;
    }
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
        el('span', { class: 'events-head-name' }, tr(info.name)),
        el('span', { class: 'events-head-sub' }, t('events.of')),
        this.state.settings.selected
          ? null
          : el('span', { class: 'events-head-hint' }, t('events.defaultHint')),
      ),
    );

    if (info.kind === 'star') {
      this.renderSeasons();
      this.renderOrbitalEvents('earth', t('events.earthApsides'));
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
      el('div', { class: 'panel-title' }, icon(ICONS.location, 14),
        isEarth ? t('events.observerPoint') : t('events.observerPointOn', { body: tr(info.name) })),
    );
    this.bodyEl.appendChild(this.locationControls(info));
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.clock, 14),
        isEarth ? t('events.riseSetToday') : t('events.riseSet')),
    );
    if (isEarth) this.renderEarthDay();
    else this.renderGenericDay(info);
  }

  private locationControls(info: BodyInfo): HTMLElement {
    const isEarth = info.id === 'earth';
    const point = this.state.surfacePointFor(info.id);

    const latInput = el('input', {
      type: 'number', class: 'field field-num', step: '0.0001', min: '-90', max: '90',
      'aria-label': t('events.latitude'), value: point.latitude.toFixed(4),
    });
    const lonInput = el('input', {
      type: 'number', class: 'field field-num', step: '0.0001', min: '-180', max: '180',
      'aria-label': t('events.longitude'), value: point.longitude.toFixed(4),
    });
    const apply = () => {
      const latitude = Math.max(-90, Math.min(90, Number(latInput.value)));
      const longitude = Math.max(-180, Math.min(180, Number(lonInput.value)));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      if (isEarth) {
        this.state.setObserver({
          name: { zh: '自定义', en: 'Custom' }, latitude, longitude, elevation: 0,
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
        class: 'field', 'aria-label': t('events.observerPoint'),
        onchange: () => {
          if (select.value === 'custom') return;
          this.state.setObserver({ ...PRESET_LOCATIONS[Number(select.value)] });
          this.callbacks.onShowLocation('earth');
        },
      }, ...PRESET_LOCATIONS.map((p, i) => el('option', { value: String(i) }, tr(p.name))),
         el('option', { value: 'custom' }, t('events.customCoords')));
      const index = PRESET_LOCATIONS.findIndex((p) => p.name.en === this.state.observer.name.en);
      select.value = index >= 0 ? String(index) : 'custom';
      rows.push(el('div', { class: 'location-row' },
        select,
        el('button', {
          class: 'btn btn-ghost btn-small',
          title: t('events.locateTitle'),
          onclick: () => this.useGeolocation(),
        }, t('events.locate')),
      ));
    }
    rows.push(el('div', { class: 'location-row' },
      el('label', { class: 'field-label' }, t('events.latitude'), latInput),
      el('label', { class: 'field-label' }, t('events.longitude'), lonInput),
      el('button', {
        class: 'btn btn-ghost btn-small',
        title: t('events.locateHereTitle'),
        onclick: () => this.callbacks.onShowLocation(info.id),
      }, t('events.locateHere')),
    ));
    return el('div', {}, ...rows);
  }

  private useGeolocation(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.state.setObserver({
          name: { zh: '我的位置', en: 'My location' },
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevation: position.coords.altitude ?? 0,
          offsetHours: -new Date().getTimezoneOffset() / 60,
        });
        this.callbacks.onShowLocation('earth');
      },
      () => {
        this.bodyEl.prepend(el('div', { class: 'note' }, t('events.geolocationDenied')));
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
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, t('events.polarDay')));
    } else if (events.polarNight) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, t('events.polarNight')));
    }

    this.bodyEl.appendChild(table([
      [t('events.sunrise'), formatClock(events.sunrise, offset)],
      [t('events.solarNoon'), formatClock(events.solarNoon, offset)],
      [t('events.sunset'), formatClock(events.sunset, offset)],
      [t('events.dayLength'), events.dayLength
        ? t('events.dayLengthValue', {
          hours: Math.floor(events.dayLength),
          minutes: Math.round((events.dayLength % 1) * 60),
        })
        : '—'],
      [t('events.noonAltitude'), `${events.maxSunAltitude.toFixed(2)}°`],
      [t('events.civilTwilight'), `${formatClock(events.civilDawn, offset)} / ${formatClock(events.civilDusk, offset)}`],
      [t('events.nauticalTwilight'), `${formatClock(events.nauticalDawn, offset)} / ${formatClock(events.nauticalDusk, offset)}`],
      [t('events.astronomicalTwilight'), `${formatClock(events.astronomicalDawn, offset)} / ${formatClock(events.astronomicalDusk, offset)}`],
      [t('events.moonRiseSet'), `${formatClock(events.moonrise, offset)} / ${formatClock(events.moonset, offset)}`],
      [t('live.moonPhase'), t('events.moonPhaseSummary', {
        percent: (phase.illumination * 100).toFixed(0), days: phase.ageDays.toFixed(1),
      })],
    ]));
    this.bodyEl.appendChild(el('div', { class: 'events-foot' },
      `${formatDate(time.jd, offset)} · ${tr(observer.name)} ${observer.latitude.toFixed(3)}°, ${observer.longitude.toFixed(3)}° · ${formatOffset(offset)}`));

    const jump = el('div', { class: 'chip-row' });
    for (const [label, jd] of [
      [t('events.jumpToSunrise'), events.sunrise],
      [t('events.jumpToSunset'), events.sunset],
    ] as Array<[string, number | undefined]>) {
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
      this.bodyEl.appendChild(el('div', { class: 'note' }, t('events.noRotation')));
      return;
    }

    if (events.polarDay) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, t('events.polarDayHere')));
    } else if (events.polarNight) {
      this.bodyEl.appendChild(el('div', { class: 'highlight' }, t('events.polarNightHere')));
    }

    const solarDayHours = events.solarDayDays * 24;
    this.bodyEl.appendChild(table([
      [t('events.nextSunrise'), events.sunrise ? formatDate(ttToJD(events.sunrise), offset) + ' ' + formatClock(ttToJD(events.sunrise), offset) : '—'],
      [t('events.solarTransit'), events.noon ? formatDate(ttToJD(events.noon), offset) + ' ' + formatClock(ttToJD(events.noon), offset) : '—'],
      [t('events.nextSunset'), events.sunset ? formatDate(ttToJD(events.sunset), offset) + ' ' + formatClock(ttToJD(events.sunset), offset) : '—'],
      [t('events.daylight'), events.daylightHours > 0 ? formatDurationDays(events.daylightHours / 24) : '—'],
      [t('events.noonAltitude'), `${events.maxAltitude.toFixed(2)}°`],
      [t('events.solarDay'), solarDayHours < 72
        ? t('events.solarDayHours', { hours: solarDayHours.toFixed(2) })
        : t('events.solarDayDays', { days: events.solarDayDays.toFixed(2) })],
    ]));
    this.bodyEl.appendChild(el('div', { class: 'events-foot' },
      t('events.pointFooter', {
        latitude: point.latitude.toFixed(2), longitude: point.longitude.toFixed(2),
        offset: formatOffset(offset),
      })));

    const jump = el('div', { class: 'chip-row' });
    for (const [label, jd] of [
      [t('events.jumpToSunrise'), events.sunrise],
      [t('events.jumpToSunset'), events.sunset],
    ] as Array<[string, number | undefined]>) {
      if (jd === undefined) continue;
      jump.appendChild(el('button', { class: 'chip', onclick: () => this.jumpTo(ttToJD(jd)) }, label));
    }
    this.bodyEl.appendChild(jump);
  }

  // ---------------------------------------------------------------- eclipses

  /**
   * The eclipse list, cached.
   *
   * Searching the lunations and then working out local circumstances for six
   * eclipses is far too expensive to redo whenever the date rolls over - at a
   * day a second that is once every second. The list only changes materially
   * over weeks, so it is rebuilt on a much coarser clock and the existing
   * nodes are simply re-attached in between.
   */
  private renderEclipses(): void {
    const { time, observer } = this.state;
    const key = [
      Math.floor(time.jd / 15), observer.latitude.toFixed(3), observer.longitude.toFixed(3),
      observer.offsetHours,
    ].join('|');
    if (!this.eclipseSection || key !== this.eclipseKey) {
      this.eclipseKey = key;
      this.eclipseSection = el('div', {},
        el('div', { class: 'panel-title' }, icon(ICONS.eclipse, 14), t('events.eclipses')),
        ...findEclipses(time.jd, { limit: 6 }).map((eclipse) => this.eclipseCard(eclipse)),
        el('div', { class: 'events-foot' }, t('events.eclipseVisibility', {
          name: tr(observer.name),
          latitude: observer.latitude.toFixed(2),
          longitude: observer.longitude.toFixed(2),
        })),
      );
    }
    this.bodyEl.appendChild(this.eclipseSection);
  }

  private eclipseCard(eclipse: Eclipse): HTMLElement {
    const { observer } = this.state;
    const offset = observer.offsetHours;
    const isSolar = eclipse.kind === 'solar';
    const typeName = t(isSolar
      ? SOLAR_TYPE_KEYS[(eclipse as SolarEclipse).type]
      : LUNAR_TYPE_KEYS[(eclipse as LunarEclipse).type]);

    const lines: HTMLElement[] = [];
    if (isSolar) {
      const solar = eclipse as SolarEclipse;
      const local = localSolarCircumstances(solar, observer);
      lines.push(el('div', { class: 'eclipse-line' }, t('events.globalGreatest', {
        date: formatDate(solar.jdMax, offset), time: formatClock(solar.jdMax, offset),
        offset: formatOffset(offset),
      })));
      lines.push(el('div', { class: 'eclipse-line' }, t('events.greatestPoint', {
        latitude: solar.greatestAt.latitude.toFixed(1),
        longitude: solar.greatestAt.longitude.toFixed(1),
        gamma: solar.gamma.toFixed(3),
      })));
      if (local.visible && local.magnitude > 0) {
        const kind = t(local.type === 'total' ? 'eclipse.local.total'
          : local.type === 'annular' ? 'eclipse.local.annular' : 'eclipse.local.partial');
        lines.push(el('div', { class: 'eclipse-local is-visible' }, t('events.localVisible', {
          name: tr(observer.name), kind,
          magnitude: local.magnitude.toFixed(3),
          obscuration: (local.obscuration * 100).toFixed(1),
        })));
        lines.push(el('div', { class: 'eclipse-line' }, t('events.contacts', {
          first: formatClock(local.firstContact, offset),
          max: formatClock(local.jdMax, offset),
          last: formatClock(local.lastContact, offset),
        })));
        if (local.centralStart && local.centralEnd) {
          lines.push(el('div', { class: 'eclipse-line' }, t('events.centralDuration', {
            kind, seconds: ((local.centralEnd - local.centralStart) * 86400).toFixed(0),
          })));
        }
      } else {
        lines.push(el('div', { class: 'eclipse-local' },
          local.magnitude > 0
            ? t('events.belowHorizon', {
              name: tr(observer.name), altitude: Math.abs(local.sunAltitude).toFixed(0),
            })
            : t('events.outsidePath', { name: tr(observer.name) })));
      }
    } else {
      const lunar = eclipse as LunarEclipse;
      const visibility = lunarEclipseVisible(lunar, observer);
      lines.push(el('div', { class: 'eclipse-line' }, t('events.lunarGreatest', {
        date: formatDate(lunar.jdMax, offset), time: formatClock(lunar.jdMax, offset),
        offset: formatOffset(offset),
      })));
      if (lunar.umbralMagnitude > 0) {
        const partial = lunar.semiDurationPartial
          ? t('events.partialDuration', {
            duration: formatDurationDays((lunar.semiDurationPartial * 2) / 1440),
          })
          : '';
        lines.push(el('div', { class: 'eclipse-line' },
          t('events.umbralMagnitude', { magnitude: lunar.umbralMagnitude.toFixed(3) }) + partial));
      } else {
        lines.push(el('div', { class: 'eclipse-line' },
          t('events.penumbralMagnitude', { magnitude: lunar.penumbralMagnitude.toFixed(3) })));
      }
      if (lunar.semiDurationTotal) {
        lines.push(el('div', { class: 'eclipse-line' }, t('events.totalDuration', {
          duration: formatDurationDays((lunar.semiDurationTotal * 2) / 1440),
        })));
      }
      lines.push(el('div', { class: visibility.visible ? 'eclipse-local is-visible' : 'eclipse-local' },
        visibility.visible
          ? t('events.lunarVisible', {
            name: tr(observer.name), altitude: visibility.moonAltitude.toFixed(0),
          })
          : t('events.lunarNotVisible', { name: tr(observer.name) })));
    }

    return el('div', { class: `eclipse-card ${isSolar ? 'is-solar' : 'is-lunar'}` },
      el('div', { class: 'eclipse-head' },
        el('span', { class: 'eclipse-type' }, typeName),
        el('span', { class: 'eclipse-date' }, formatDate(eclipse.jdMax, offset)),
        el('button', {
          class: 'chip chip-small',
          title: t('events.watchIn3dTitle'),
          onclick: () => this.callbacks.onWatchEclipse(eclipse),
        }, t('events.watchIn3d')),
      ),
      ...lines,
    );
  }

  // ------------------------------------------------------------ orbit events

  private renderOrbitalEvents(id: string, title = t('events.orbital')): void {
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
        t(apsis.kind === 'perihelion' ? 'events.nextPerihelion' : 'events.nextAphelion'),
        t('events.apsisValue', {
          date: formatDate(ttToJD(apsis.jd), offset), distance: apsis.distanceAu.toFixed(4),
        }),
      ]);
    }
    const current = elongationFromEarth(id, jdtt);
    if (current && id !== 'earth') {
      rows.push([t('events.currentElongation'), t('events.currentElongationValue', {
        elongation: current.elongation.toFixed(1), distance: formatDistanceAu(current.distanceAu),
      })]);
    }
    this.bodyEl.appendChild(table(rows));

    for (const event of elongations.slice(0, 3)) {
      this.bodyEl.appendChild(
        el('div', { class: 'event-row' },
          el('div', { class: 'event-kind' }, t(ELONGATION_KEYS[event.kind])),
          el('div', { class: 'event-when' }, t('events.elongationWhen', {
            date: formatDate(ttToJD(event.jd), offset),
            elongation: event.elongation.toFixed(1),
            distance: event.distanceAu.toFixed(3),
          })),
          el('button', { class: 'chip chip-small', onclick: () => this.jumpTo(ttToJD(event.jd)) },
            t('events.jump')),
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
      if (current < previous && current < next) found.push([t('events.nextPerigee'), jd, current]);
      else if (current > previous && current > next) found.push([t('events.nextApogee'), jd, current]);
      previous = current;
      current = next;
    }
    if (found.length === 0) return;
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.globe, 14), t('events.lunarApsides')));
    this.bodyEl.appendChild(table(found.map(([label, jd, km]) => [
      label,
      t('events.perigeeValue', {
        date: formatDate(ttToJD(jd), offset), km: Math.round(km).toLocaleString('en-US'),
      }),
    ] as [string, string])));
  }

  /** For the Sun: the moments that define the Earth's seasons. */
  private renderSeasons(): void {
    const offset = this.state.observer.offsetHours;
    const jdtt = jdToTT(this.state.time.jd);
    const rows = SEASON_KEYS
      .map((key, i) => ({ name: t(key), jd: nextSolarLongitude(i * 90, jdtt) }))
      .sort((a, b) => a.jd - b.jd)
      .map(({ name, jd }) =>
        [name, `${formatDate(ttToJD(jd), offset)} ${formatClock(ttToJD(jd), offset)}`] as [string, string]);
    this.bodyEl.appendChild(
      el('div', { class: 'panel-title' }, icon(ICONS.clock, 14), t('events.seasons')));
    this.bodyEl.appendChild(table(rows));
  }

  private jumpTo(jd: number): void {
    this.state.time.jd = jd;
    this.state.time.playing = false;
    this.state.emit('time');
    this.update(true);
  }
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
