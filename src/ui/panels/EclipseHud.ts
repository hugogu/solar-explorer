/**
 * Readout shown while a solar eclipse is under way, so the band drawn on the
 * globe comes with the numbers that describe it.
 */
import type { EclipseOverlay } from '../../app/EclipseWatcher';
import { el } from '../dom';
import { formatClock, formatDate } from '../format';

const TYPE_NAMES: Record<string, string> = {
  total: '日全食', annular: '日环食', hybrid: '全环食', partial: '日偏食',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes > 0 ? `${minutes} 分 ${rest} 秒` : `${rest} 秒`;
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
      this.titleEl.textContent =
        `${TYPE_NAMES[eclipse.type] ?? '日食'}进行中 · ${formatDate(eclipse.jdMax, offset)}`;
    }

    // An annular eclipse leaves a ring of Sun showing, so its central shadow is
    // never "full" - the wording follows the kind of eclipse it actually is.
    const annular = eclipse.type === 'annular' || current.annular;
    const shadowName = annular ? '环影' : '本影';
    const rows: Array<[string, string]> = [];
    if (current.central) {
      rows.push([`${shadowName}位置`, `${formatLatitude(current.latitude)} ${formatLongitude(current.longitude)}`]);
      rows.push(['当前食带宽度', `${current.umbraWidthKm.toFixed(0)} 公里`]);
      rows.push(['该处食分', `遮挡 ${(current.coverage * 100).toFixed(1)}%`]);
    } else {
      rows.push(['影锥中心', `${formatLatitude(current.latitude)} ${formatLongitude(current.longitude)}`]);
      rows.push(['该处食分', `遮挡 ${(current.coverage * 100).toFixed(1)}%`]);
    }
    if (path.centralStart !== undefined) {
      rows.push([annular ? '最长环食' : '最长全食', formatDuration(path.maxDurationSeconds)]);
      rows.push(['食带最宽', `${path.maxWidthKm.toFixed(0)} 公里`]);
      rows.push(['中心食时段', `${formatClock(path.centralStart, offset)} — ${formatClock(path.centralEnd as number, offset)}`]);
    } else {
      rows.push(['类型', '影锥未触及地表，全球仅见偏食']);
    }
    rows.push(['偏食时段', `${formatClock(path.penumbraStart, offset)} — ${formatClock(path.penumbraEnd, offset)}`]);

    this.rowsEl.replaceChildren(
      ...rows.map(([label, value]) =>
        el('div', { class: 'data-row' },
          el('div', { class: 'data-label' }, label),
          el('div', { class: 'data-value' }, value))),
    );
  }
}
