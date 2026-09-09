/**
 * Readout shown while a solar eclipse is under way, so the band drawn on the
 * globe comes with the numbers that describe it.
 */
import type { EclipseOverlay } from '../../app/EclipseWatcher';
import { el } from '../dom';
import { formatClock, formatDate } from '../format';
import { type StringKey, t } from '../../i18n';

const TYPE_KEYS: Record<string, StringKey> = {
  total: 'eclipse.solar.total', annular: 'eclipse.solar.annular',
  hybrid: 'eclipse.solar.hybrid', partial: 'eclipse.solar.partial',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes > 0
    ? t('eclipseHud.minutesSeconds', { minutes, seconds: rest })
    : t('eclipseHud.seconds', { seconds: rest });
}

function formatLatitude(value: number): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLongitude(value: number): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? 'E' : 'W'}`;
}

export class EclipseHud {
  readonly element: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly barEl: HTMLElement;
  private readonly rowsEl: HTMLElement;
  private lastKey = '';

  constructor(private readonly offsetHours: () => number) {
    this.titleEl = el('div', { class: 'eclipse-hud-title' });
    this.barEl = el('div', { class: 'eclipse-hud-fill' });
    this.rowsEl = el('div', { class: 'eclipse-hud-rows' });
    this.element = el('div', { class: 'eclipse-hud' },
      this.titleEl,
      el('div', { class: 'eclipse-hud-bar' }, this.barEl),
      this.rowsEl,
    );
    this.element.style.display = 'none';
  }

  update(overlay: EclipseOverlay | null): void {
    if (!overlay) {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';
    const offset = this.offsetHours();
    const { eclipse, path, current } = overlay;

    this.barEl.style.width = `${Math.max(0, Math.min(1, overlay.progress)) * 100}%`;

    const key = `${eclipse.jdMax}|${offset}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const typeKey = TYPE_KEYS[eclipse.type];
      this.titleEl.textContent = t('eclipseHud.running', {
        type: typeKey ? t(typeKey) : t('eclipseHud.fallbackType'),
        date: formatDate(eclipse.jdMax, offset),
      });
    }

    // An annular eclipse leaves a ring of Sun showing, so its central shadow is
    // never "full" - the wording follows the kind of eclipse it actually is.
    const annular = eclipse.type === 'annular' || current.annular;
    const shadowName = t(annular ? 'eclipseHud.antumbra' : 'eclipseHud.umbra');
    const position = `${formatLatitude(current.latitude)} ${formatLongitude(current.longitude)}`;
    const coverage = t('eclipseHud.coverageValue', { percent: (current.coverage * 100).toFixed(1) });
    const rows: Array<[string, string]> = [];
    if (current.central) {
      rows.push([t('eclipseHud.shadowPosition', { shadow: shadowName }), position]);
      rows.push([t('eclipseHud.pathWidth'), t('eclipseHud.km', { value: current.umbraWidthKm.toFixed(0) })]);
      rows.push([t('eclipseHud.coverage'), coverage]);
    } else {
      rows.push([t('eclipseHud.axisPosition'), position]);
      rows.push([t('eclipseHud.coverage'), coverage]);
    }
    if (path.centralStart !== undefined) {
      rows.push([
        t(annular ? 'eclipseHud.longestAnnular' : 'eclipseHud.longestTotal'),
        formatDuration(path.maxDurationSeconds),
      ]);
      rows.push([t('eclipseHud.maxWidth'), t('eclipseHud.km', { value: path.maxWidthKm.toFixed(0) })]);
      rows.push([t('eclipseHud.centralWindow'),
        `${formatClock(path.centralStart, offset)} — ${formatClock(path.centralEnd as number, offset)}`]);
    } else {
      rows.push([t('eclipseHud.type'), t('eclipseHud.partialOnly')]);
    }
    rows.push([t('eclipseHud.partialWindow'),
      `${formatClock(path.penumbraStart, offset)} — ${formatClock(path.penumbraEnd, offset)}`]);

    this.rowsEl.replaceChildren(
      ...rows.map(([label, value]) =>
        el('div', { class: 'data-row' },
          el('div', { class: 'data-label' }, label),
          el('div', { class: 'data-value' }, value))),
    );
  }
}
