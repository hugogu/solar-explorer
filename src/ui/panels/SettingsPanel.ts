/** View options: scale mode, what is drawn, and the first-person surface view. */
import { AppState } from '../../app/AppState';
import { el } from '../dom';

interface ToggleSpec {
  label: string;
  hint?: string;
  get: () => boolean;
  set: (value: boolean) => void;
}

export class SettingsPanel {
  readonly element: HTMLElement;
  private readonly sizeSlider: HTMLInputElement;
  private readonly sizeValue: HTMLElement;

  private readonly exitSurfaceButton: HTMLButtonElement;

  constructor(private readonly state: AppState, onExitSurface: () => void) {
    this.exitSurfaceButton = el('button', {
      class: 'btn btn-block',
      onclick: () => onExitSurface(),
    }, '退出地表视角 / 回到太空');
    const modeRow = el('div', { class: 'segmented' },
      this.modeButton('compact', '紧凑视图'),
      this.modeButton('real', '真实比例'),
    );

    this.sizeValue = el('span', { class: 'slider-value' });
    this.sizeSlider = el('input', {
      type: 'range', min: '1', max: '60', step: '1',
      value: String(state.settings.scale.bodyScale),
      class: 'slider',
      'aria-label': '天体放大倍数',
      oninput: () => {
        state.settings.scale.bodyScale = Number(this.sizeSlider.value);
        state.settings.scale.moonOrbitScale = Math.max(1, Number(this.sizeSlider.value) * 0.5);
        this.sizeValue.textContent = `×${this.sizeSlider.value}`;
        state.emit('settings');
      },
    });
    this.sizeValue.textContent = `×${state.settings.scale.bodyScale}`;

    const toggles: ToggleSpec[] = [
      { label: '行星轨道', get: () => state.settings.showOrbits, set: (v) => { state.settings.showOrbits = v; } },
      { label: '卫星轨道', get: () => state.settings.showMoonOrbits, set: (v) => { state.settings.showMoonOrbits = v; } },
      { label: '天体名称', get: () => state.settings.showLabels, set: (v) => { state.settings.showLabels = v; } },
      { label: '小行星带与柯伊伯带', get: () => state.settings.showBelts, set: (v) => { state.settings.showBelts = v; } },
      { label: '奥尔特云内缘', hint: '约 2000 AU', get: () => state.settings.showOort, set: (v) => { state.settings.showOort = v; } },
      { label: '恒星', get: () => state.settings.showStars, set: (v) => { state.settings.showStars = v; } },
      { label: '银河', get: () => state.settings.showMilkyWay, set: (v) => { state.settings.showMilkyWay = v; } },
    ];

    this.element = el(
      'div',
      { class: 'panel settings-panel' },
      el('div', { class: 'panel-title' }, '视图比例'),
      modeRow,
      el('div', { class: 'note note-tight' },
        '真实比例下行星之间的距离极其空旷——这正是太阳系的真实样子；紧凑视图会压缩距离并放大天体，方便观察。'),
      el('label', { class: 'slider-row' },
        el('span', {}, '天体放大'),
        this.sizeSlider,
        this.sizeValue,
      ),
      el('div', { class: 'panel-title' }, '显示内容'),
      el('div', { class: 'toggle-list' }, ...toggles.map((t) => this.toggle(t))),
      el('div', { class: 'panel-title' }, '视角'),
      this.exitSurfaceButton,
      el('div', { class: 'note note-tight' },
        '操作：拖动旋转 · 滚轮或双指缩放 · 点击天体选中 · 空格播放暂停 · [ ] 调速 · 数字键 1—9 快速切换行星。'),
    );
    state.on('settings', () => this.sync());
    this.sync();
  }

  private modeButton(mode: 'compact' | 'real', label: string): HTMLButtonElement {
    return el('button', {
      class: 'segment',
      'data-mode': mode,
      onclick: () => {
        this.state.setScaleMode(mode);
        this.sizeSlider.value = String(this.state.settings.scale.bodyScale);
        this.sizeValue.textContent = `×${this.state.settings.scale.bodyScale}`;
      },
    }, label);
  }

  private toggle(spec: ToggleSpec): HTMLElement {
    const input = el('input', { type: 'checkbox' });
    input.checked = spec.get();
    input.addEventListener('change', () => {
      spec.set(input.checked);
      this.state.emit('settings');
    });
    return el('label', { class: 'toggle' },
      input,
      el('span', { class: 'toggle-label' }, spec.label),
      spec.hint ? el('span', { class: 'toggle-hint' }, spec.hint) : null,
    );
  }

  private sync(): void {
    this.exitSurfaceButton.disabled = this.state.settings.surface === null;
    const mode = this.state.scaleMode;
    for (const button of this.element.querySelectorAll('.segment')) {
      button.classList.toggle('is-active', button.getAttribute('data-mode') === mode);
    }
    if (this.sizeSlider.value !== String(this.state.settings.scale.bodyScale)) {
      this.sizeSlider.value = String(this.state.settings.scale.bodyScale);
      this.sizeValue.textContent = `×${this.state.settings.scale.bodyScale}`;
    }
  }
}
