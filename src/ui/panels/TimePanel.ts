/** Clock, transport controls and the date picker. */
import { AppState } from '../../app/AppState';
import { SPEED_PRESETS } from '../../app/TimeController';
import { ICONS, clear, el, icon } from '../dom';
import { formatDate, formatClockSeconds, formatOffset, weekday } from '../format';
import { jdToDate, utcToJD } from '../../astro/time';

export class TimePanel {
  readonly element: HTMLElement;
  private readonly dateEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly reverseButton: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly dateInput: HTMLInputElement;
  private readonly rangeWarning: HTMLElement;
  private readonly timeInput: HTMLInputElement;
  private editingDate = false;

  constructor(private readonly state: AppState) {
    this.dateEl = el('div', { class: 'time-date' });
    this.clockEl = el('div', { class: 'time-clock' });
    this.speedEl = el('div', { class: 'time-speed' });

    this.playButton = el('button', {
      class: 'btn btn-primary',
      title: '播放 / 暂停（空格）',
      onclick: () => {
        this.state.time.toggle();
        this.renderPlayIcon();
      },
    });

    // Running time backwards is worth a control of its own: it is how you watch
    // an eclipse shadow retrace its path, or wind a planet back to a past
    // opposition.
    this.reverseButton = el('button', {
      class: 'btn btn-ghost',
      title: '时间倒流（R）',
      'aria-label': '时间倒流',
      onclick: () => {
        this.state.time.toggleDirection();
        this.update();
      },
    }, icon(ICONS.reverse, 15));

    this.slider = el('input', {
      type: 'range',
      min: '0',
      max: String(SPEED_PRESETS.length - 1),
      step: '1',
      value: String(state.time.speedIndex),
      class: 'speed-slider',
      'aria-label': '模拟速度',
      oninput: () => {
        this.state.time.speedIndex = Number(this.slider.value);
        this.update();
      },
    });

    this.dateInput = el('input', { type: 'date', class: 'field', 'aria-label': '日期' });
    this.timeInput = el('input', { type: 'time', class: 'field', step: '1', 'aria-label': '时间' });
    for (const input of [this.dateInput, this.timeInput]) {
      input.addEventListener('focus', () => { this.editingDate = true; });
      input.addEventListener('blur', () => { this.editingDate = false; });
      input.addEventListener('change', () => this.applyDateInput());
    }

    this.rangeWarning = el('div', { class: 'time-warning' }, '超出行星根数有效区间（1800—2050），位置仅供示意');
    this.rangeWarning.style.display = 'none';

    this.element = el(
      'div',
      { class: 'panel time-panel' },
      el(
        'div',
        { class: 'time-readout' },
        el('div', { class: 'time-main' }, this.dateEl, this.clockEl),
        el('div', { class: 'time-zone' }, `${state.observer.name} · ${formatOffset(state.observer.offsetHours)}`),
        this.rangeWarning,
      ),
      el(
        'div',
        { class: 'time-controls' },
        this.reverseButton,
        this.stepButton(ICONS.back, '后退一步', -1),
        this.playButton,
        this.stepButton(ICONS.forward, '前进一步', 1),
        el('button', {
          class: 'btn btn-ghost',
          title: '回到此刻',
          onclick: () => { this.state.time.now(); this.update(); },
        }, '现在'),
      ),
      el('div', { class: 'time-speed-row' }, this.slider, this.speedEl),
      el('div', { class: 'time-jump' }, this.dateInput, this.timeInput),
    );

    this.renderPlayIcon();
    this.update();
    state.on('observer', () => this.update());
  }

  private stepButton(path: string, title: string, direction: number): HTMLButtonElement {
    return el('button', {
      class: 'btn btn-ghost',
      title,
      onclick: () => {
        const seconds = SPEED_PRESETS[this.state.time.speedIndex].secondsPerSecond;
        this.state.time.step((direction * seconds) / 86400);
        this.update();
      },
    }, icon(path, 15));
  }

  private renderPlayIcon(): void {
    clear(this.playButton);
    this.playButton.appendChild(icon(this.state.time.playing ? ICONS.pause : ICONS.play, 15));
  }

  private applyDateInput(): void {
    const [y, m, d] = this.dateInput.value.split('-').map(Number);
    const [hh, mm, ss] = (this.timeInput.value || '12:00:00').split(':').map(Number);
    if (!y || !m || !d) return;
    this.state.time.jd = utcToJD(y, m, d, hh || 0, mm || 0, ss || 0) - this.state.observer.offsetHours / 24;
    this.state.emit('time');
  }

  /** Called every frame; keeps the readout live without rebuilding the DOM. */
  update(): void {
    const { time, observer } = this.state;
    this.dateEl.textContent = `${formatDate(time.jd, observer.offsetHours)} ${weekday(time.jd, observer.offsetHours)}`;
    this.clockEl.textContent = formatClockSeconds(time.jd, observer.offsetHours);
    this.speedEl.textContent = time.speedLabel;
    this.reverseButton.classList.toggle('is-active', time.reversed);
    this.element.classList.toggle('is-reversed', time.reversed);
    if (this.slider.value !== String(time.speedIndex)) this.slider.value = String(time.speedIndex);
    const zone = this.element.querySelector('.time-zone');
    if (zone) zone.textContent = `${observer.name} · ${formatOffset(observer.offsetHours)}`;
    if (!this.editingDate) {
      const d = jdToDate(time.jd + observer.offsetHours / 24);
      this.dateInput.value = d.toISOString().slice(0, 10);
      this.timeInput.value = d.toISOString().slice(11, 19);
    }
    // The JPL element set the planets use is fitted to 1800-2050.
    const year = jdToDate(time.jd).getUTCFullYear();
    this.rangeWarning.style.display = year < 1800 || year > 2050 ? '' : 'none';
    this.renderPlayIcon();
  }
}
