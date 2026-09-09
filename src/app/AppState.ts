/** Application state shared by the renderer and the UI, with a tiny event bus. */
import type { Observer } from '../astro/coords';
import { BODY_BY_ID, type BodyKind } from '../data';
import type { ViewSettings } from '../render/Scene';
import { COMPACT_SCALE, REAL_SCALE } from '../render/frame';
import { TimeController } from './TimeController';
import type { Localised } from '../i18n';

export interface NamedObserver extends Observer {
  name: Localised<string>;
  /** UTC offset in hours used for displaying local times */
  offsetHours: number;
}

export const PRESET_LOCATIONS: NamedObserver[] = [
  { name: { zh: '北京', en: 'Beijing' }, latitude: 39.9042, longitude: 116.4074, elevation: 44, offsetHours: 8 },
  { name: { zh: '上海', en: 'Shanghai' }, latitude: 31.2304, longitude: 121.4737, elevation: 4, offsetHours: 8 },
  { name: { zh: '广州', en: 'Guangzhou' }, latitude: 23.1291, longitude: 113.2644, elevation: 21, offsetHours: 8 },
  { name: { zh: '成都', en: 'Chengdu' }, latitude: 30.5728, longitude: 104.0668, elevation: 500, offsetHours: 8 },
  { name: { zh: '乌鲁木齐', en: 'Ürümqi' }, latitude: 43.8256, longitude: 87.6168, elevation: 800, offsetHours: 8 },
  { name: { zh: '香港', en: 'Hong Kong' }, latitude: 22.3193, longitude: 114.1694, elevation: 20, offsetHours: 8 },
  { name: { zh: '台北', en: 'Taipei' }, latitude: 25.033, longitude: 121.5654, elevation: 10, offsetHours: 8 },
  { name: { zh: '东京', en: 'Tokyo' }, latitude: 35.6762, longitude: 139.6503, elevation: 40, offsetHours: 9 },
  { name: { zh: '新加坡', en: 'Singapore' }, latitude: 1.3521, longitude: 103.8198, elevation: 15, offsetHours: 8 },
  { name: { zh: '伦敦', en: 'London' }, latitude: 51.5074, longitude: -0.1278, elevation: 11, offsetHours: 0 },
  { name: { zh: '巴黎', en: 'Paris' }, latitude: 48.8566, longitude: 2.3522, elevation: 35, offsetHours: 1 },
  { name: { zh: '纽约', en: 'New York' }, latitude: 40.7128, longitude: -74.006, elevation: 10, offsetHours: -5 },
  { name: { zh: '洛杉矶', en: 'Los Angeles' }, latitude: 34.0522, longitude: -118.2437, elevation: 71, offsetHours: -8 },
  { name: { zh: '悉尼', en: 'Sydney' }, latitude: -33.8688, longitude: 151.2093, elevation: 58, offsetHours: 10 },
  { name: { zh: '开普敦', en: 'Cape Town' }, latitude: -33.9249, longitude: 18.4241, elevation: 25, offsetHours: 2 },
  { name: { zh: '雷克雅未克', en: 'Reykjavík' }, latitude: 64.1466, longitude: -21.9426, elevation: 61, offsetHours: 0 },
  { name: { zh: '南极中山站', en: 'Zhongshan Station, Antarctica' }, latitude: -69.3733, longitude: 76.3697, elevation: 15, offsetHours: 8 },
];

export type AppEvent =
  | 'time'
  | 'selection'
  | 'settings'
  | 'observer'
  | 'frame';

export class AppState {
  readonly time = new TimeController();
  observer: NamedObserver = { ...PRESET_LOCATIONS[0] };
  settings: ViewSettings = {
    scale: { ...COMPACT_SCALE },
    visibleKinds: { star: true, planet: true, dwarf: true, moon: true, comet: true },
    showOrbits: true,
    showMoonOrbits: true,
    showLabels: true,
    showBelts: true,
    showOort: false,
    showEclipseTrack: true,
    showSolarActivity: true,
    showStars: true,
    showMilkyWay: true,
    focus: 'sun',
    selected: null,
    surface: null,
  };
  /** true while the compact layout (phones) is active */
  compact = false;
  /**
   * Where to stand on bodies other than the Earth. The Earth uses `observer`,
   * which also carries a name and a time zone.
   */
  otherSurfacePoint = { latitude: 0, longitude: 0 };

  private readonly listeners = new Map<AppEvent, Set<() => void>>();

  on(event: AppEvent, handler: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => set.delete(handler);
  }

  emit(event: AppEvent): void {
    for (const handler of this.listeners.get(event) ?? []) handler();
  }

  select(id: string | null, focus = true): void {
    this.settings.selected = id;
    if (focus && id) this.settings.focus = id;
    this.emit('selection');
  }

  setScaleMode(mode: 'compact' | 'real'): void {
    this.settings.scale = mode === 'real' ? { ...REAL_SCALE } : { ...COMPACT_SCALE };
    this.emit('settings');
  }

  get scaleMode(): 'compact' | 'real' {
    return this.settings.scale.distanceExponent === 1 && this.settings.scale.bodyScale === 1
      ? 'real'
      : 'compact';
  }

  setObserver(observer: NamedObserver): void {
    this.observer = observer;
    this.emit('observer');
  }

  /** The surface point used for a given body's local sky. */
  surfacePointFor(bodyId: string): { latitude: number; longitude: number } {
    return bodyId === 'earth' ? this.observer : this.otherSurfacePoint;
  }

  setKindVisible(kind: BodyKind, visible: boolean): void {
    this.settings.visibleKinds[kind] = visible;
    // Never leave the selection pointing at something that is now hidden.
    const selected = this.settings.selected ? BODY_BY_ID.get(this.settings.selected) : undefined;
    if (selected && !visible && selected.kind === kind) this.settings.selected = null;
    this.emit('settings');
  }
}
