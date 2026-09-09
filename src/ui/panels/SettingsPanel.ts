/** View options: scale mode, what is drawn, and the first-person surface view. */
import { AppState } from '../../app/AppState';
import { el } from '../dom';
import { type StringKey, t } from '../../i18n';

interface ToggleSpec {
  labelKey: StringKey;
  hintKey?: StringKey;
  get: () => boolean;
  set: (value: boolean) => void;
}

export class SettingsPanel {
  readonly element: HTMLElement;
  private readonly sizeSlider: HTMLInputElement;
  private readonly sizeValue: HTMLElement;

  private readonly exitSurfaceButton: HTMLButtonElement;
  private readonly off: Array<() => void> = [];

  constructor(private readonly state: AppState, onExitSurface: () => void) {
    this.exitSurfaceButton = el('button', {
      class: 'btn btn-block',
      onclick: () => onExitSurface(),
    }, t('settings.exitSurface'));
    const modeRow = el('div', { class: 'segmented' },
      this.modeButton('compact', t('settings.compact')),
      this.modeButton('real', t('settings.real')),
    );

    this.sizeValue = el('span', { class: 'slider-value' });
    this.sizeSlider = el('input', {
      type: 'range', min: '1', max: '60', step: '1',
      value: String(state.settings.scale.bodyScale),
      class: 'slider',
      'aria-label': t('settings.bodyScaleLabel'),
      oninput: () => {
        state.settings.scale.bodyScale = Number(this.sizeSlider.value);
        state.settings.scale.moonOrbitScale = Math.max(1, Number(this.sizeSlider.value) * 0.5);
        this.sizeValue.textContent = `×${this.sizeSlider.value}`;
        state.emit('settings');
      },
    });
    this.sizeValue.textContent = `×${state.settings.scale.bodyScale}`;

    const toggles: ToggleSpec[] = [
      { labelKey: 'settings.planetOrbits', get: () => state.settings.showOrbits, set: (v) => { state.settings.showOrbits = v; } },
      { labelKey: 'settings.moonOrbits', get: () => state.settings.showMoonOrbits, set: (v) => { state.settings.showMoonOrbits = v; } },
      { labelKey: 'settings.labels', get: () => state.settings.showLabels, set: (v) => { state.settings.showLabels = v; } },
      { labelKey: 'settings.belts', get: () => state.settings.showBelts, set: (v) => { state.settings.showBelts = v; } },
      { labelKey: 'settings.oort', hintKey: 'settings.oortHint', get: () => state.settings.showOort, set: (v) => { state.settings.showOort = v; } },
      { labelKey: 'settings.eclipseTrack', hintKey: 'settings.eclipseTrackHint', get: () => state.settings.showEclipseTrack, set: (v) => { state.settings.showEclipseTrack = v; } },
      { labelKey: 'settings.solarActivity', hintKey: 'settings.solarActivityHint', get: () => state.settings.showSolarActivity, set: (v) => { state.settings.showSolarActivity = v; } },
      { labelKey: 'settings.stars', get: () => state.settings.showStars, set: (v) => { state.settings.showStars = v; } },
      { labelKey: 'settings.milkyWay', get: () => state.settings.showMilkyWay, set: (v) => { state.settings.showMilkyWay = v; } },
    ];

    this.element = el(
      'div',
      { class: 'panel settings-panel' },
      el('div', { class: 'panel-title' }, t('settings.scale')),
      modeRow,
      el('div', { class: 'note note-tight' }, t('settings.scaleNote')),
      el('label', { class: 'slider-row' },
        el('span', {}, t('settings.bodyScale')),
        this.sizeSlider,
        this.sizeValue,
      ),
      el('div', { class: 'panel-title' }, t('settings.shown')),
      el('div', { class: 'toggle-list' }, ...toggles.map((spec) => this.toggle(spec))),
      el('div', { class: 'panel-title' }, t('settings.view')),
      this.exitSurfaceButton,
      el('div', { class: 'note note-tight' }, t('settings.controlsNote')),
    );
    this.off.push(state.on('settings', () => this.sync()));
    this.sync();
  }

  dispose(): void {
    for (const off of this.off) off();
    this.off.length = 0;
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
      el('span', { class: 'toggle-label' }, t(spec.labelKey)),
      spec.hintKey ? el('span', { class: 'toggle-hint' }, t(spec.hintKey)) : null,
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
