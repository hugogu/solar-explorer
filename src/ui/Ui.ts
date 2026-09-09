/**
 * Layout and wiring for the whole interface.
 *
 * Desktop keeps the navigator on the left and a tabbed detail column on the
 * right; below 900 px everything collapses into a single bottom sheet, which is
 * what makes the same code usable on a phone.
 */
import { AppState } from '../app/AppState';
import type { Simulation } from '../app/Simulation';
import { ICONS, clear, el, icon } from './dom';
import { BodyList } from './panels/BodyList';
import { EventsPanel } from './panels/EventsPanel';
import type { Eclipse } from '../astro/eclipse';
import { InfoPanel } from './panels/InfoPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { TimePanel } from './panels/TimePanel';
import { SurfaceHud } from './panels/SurfaceHud';
import { EclipseHud } from './panels/EclipseHud';
import { type StringKey, language, setLanguage, t } from '../i18n';

type TabId = 'bodies' | 'info' | 'events' | 'settings';

const TABS: Array<{ id: TabId; labelKey: StringKey; iconPath: string }> = [
  { id: 'bodies', labelKey: 'tab.bodies', iconPath: ICONS.layers },
  { id: 'info', labelKey: 'tab.info', iconPath: ICONS.info },
  { id: 'events', labelKey: 'tab.events', iconPath: ICONS.eclipse },
  { id: 'settings', labelKey: 'tab.settings', iconPath: ICONS.globe },
];

export class Ui {
  readonly timePanel: TimePanel;
  readonly bodyList: BodyList;
  readonly infoPanel: InfoPanel;
  readonly eventsPanel: EventsPanel;
  readonly settingsPanel: SettingsPanel;
  readonly surfaceHud: SurfaceHud;
  readonly eclipseHud: EclipseHud;

  private readonly root: HTMLElement;
  private readonly leftDock: HTMLElement;
  private readonly rightDock: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly langButton: HTMLButtonElement;
  private activeTab: TabId = 'info';
  private compact = false;
  private sheetOpen = false;
  private readonly off: Array<() => void> = [];

  constructor(
    container: HTMLElement,
    private readonly state: AppState,
    getSimulation: () => Simulation,
    callbacks: {
      onSurfaceView: (bodyId: string) => void;
      onExitSurface: () => void;
      onWatchEclipse: (eclipse: Eclipse) => void;
      onShowLocation: (bodyId: string) => void;
    },
  ) {
    this.timePanel = new TimePanel(state);
    this.bodyList = new BodyList(state);
    this.infoPanel = new InfoPanel(state, getSimulation, callbacks.onSurfaceView);
    this.eventsPanel = new EventsPanel(state, {
      onWatchEclipse: callbacks.onWatchEclipse,
      onShowLocation: callbacks.onShowLocation,
    });
    this.settingsPanel = new SettingsPanel(state, callbacks.onExitSurface);
    this.surfaceHud = new SurfaceHud(state, getSimulation, callbacks.onExitSurface);
    this.eclipseHud = new EclipseHud(() => state.observer.offsetHours);

    this.leftDock = el('div', { class: 'dock dock-left' });
    this.rightDock = el('div', { class: 'dock dock-right' });
    this.tabBar = el('div', { class: 'tab-bar' });
    this.sheetBody = el('div', { class: 'sheet-body' });
    this.langButton = el('button', {
      class: 'btn btn-ghost lang-btn',
      title: t('lang.switchLabel'),
      'aria-label': t('lang.switchLabel'),
      onclick: () => setLanguage(language() === 'zh' ? 'en' : 'zh'),
    });
    this.sheet = el('div', { class: 'sheet' },
      el('button', {
        class: 'sheet-handle',
        'aria-label': t('sheet.toggle'),
        onclick: () => this.toggleSheet(),
      }),
      this.tabBar,
      this.sheetBody,
    );

    this.root = el('div', { class: 'ui-root' },
      el('header', { class: 'topbar' },
        el('div', { class: 'brand' },
          el('span', { class: 'brand-mark' }, '☉'),
          el('span', { class: 'brand-name' }, t('app.brand')),
        ),
        this.timePanel.element,
        this.langButton,
        el('button', {
          class: 'btn btn-ghost icon-btn help-btn',
          title: t('help.button'),
          onclick: () => this.toggleHelp(),
        }, icon(ICONS.info, 16)),
      ),
      this.leftDock,
      this.rightDock,
      this.sheet,
      this.surfaceHud.element,
      this.eclipseHud.element,
      this.helpOverlay(),
    );
    container.appendChild(this.root);

    this.buildTabs();
    this.layout();
    const onResize = () => this.layout();
    window.addEventListener('resize', onResize);
    this.off.push(() => window.removeEventListener('resize', onResize));
    this.off.push(state.on('selection', () => {
      if (this.compact && this.activeTab !== 'info') this.setTab('info');
      if (this.compact) this.setSheetOpen(true);
    }));
  }

  /**
   * Detach everything.
   *
   * Switching language rebuilds the whole interface rather than trying to
   * re-label it in place, so the old tree and every listener it registered has
   * to go or they pile up with each switch.
   */
  dispose(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    this.timePanel.dispose();
    this.bodyList.dispose();
    this.infoPanel.dispose();
    this.eventsPanel.dispose();
    this.settingsPanel.dispose();
    this.root.remove();
  }

  private buildTabs(): void {
    clear(this.tabBar);
    for (const tab of TABS) {
      if (!this.compact && tab.id === 'bodies') continue;
      this.tabBar.appendChild(el('button', {
        class: 'tab',
        'data-tab': tab.id,
        onclick: () => {
          if (this.compact && this.activeTab === tab.id && this.sheetOpen) {
            this.setSheetOpen(false);
            return;
          }
          this.setTab(tab.id);
          this.setSheetOpen(true);
        },
      }, icon(tab.iconPath, 15), el('span', {}, t(tab.labelKey))));
    }
    this.markTab();
  }

  private setTab(id: TabId): void {
    this.activeTab = id;
    this.renderPanels();
    this.markTab();
  }

  private markTab(): void {
    for (const button of this.tabBar.querySelectorAll('.tab')) {
      button.classList.toggle('is-active', button.getAttribute('data-tab') === this.activeTab);
    }
  }

  private layout(): void {
    if (window.innerWidth < 1) return;
    const compact = window.innerWidth < 900;
    if (compact !== this.compact) {
      this.compact = compact;
      this.state.compact = compact;
      if (compact && this.activeTab === 'bodies') this.activeTab = 'info';
      this.buildTabs();
    }
    this.root.classList.toggle('is-compact', compact);
    // The phone top bar has no room for "English"; a two-character code keeps
    // the button the same width whichever language is showing.
    this.langButton.textContent = t(compact ? 'lang.switchShort' : 'lang.switchTo');
    this.renderPanels();
  }

  private renderPanels(): void {
    const panels: Record<TabId, HTMLElement> = {
      bodies: this.bodyList.element,
      info: this.infoPanel.element,
      events: this.eventsPanel.element,
      settings: this.settingsPanel.element,
    };
    if (this.compact) {
      clear(this.leftDock);
      clear(this.rightDock);
      clear(this.sheetBody);
      this.sheetBody.appendChild(panels[this.activeTab]);
      this.sheet.classList.toggle('is-open', this.sheetOpen);
      return;
    }
    clear(this.sheetBody);
    clear(this.leftDock);
    clear(this.rightDock);
    this.leftDock.appendChild(this.bodyList.element);
    this.rightDock.appendChild(this.tabBar);
    this.rightDock.appendChild(panels[this.activeTab === 'bodies' ? 'info' : this.activeTab]);
  }

  private setSheetOpen(open: boolean): void {
    this.sheetOpen = open;
    this.sheet.classList.toggle('is-open', open);
  }

  private toggleSheet(): void {
    this.setSheetOpen(!this.sheetOpen);
  }

  private toggleHelp(): void {
    this.root.querySelector('.help-overlay')?.classList.toggle('is-open');
  }

  private helpOverlay(): HTMLElement {
    const rows: Array<[StringKey, StringKey]> = [
      ['help.key.drag', 'help.act.rotate'],
      ['help.key.wheel', 'help.act.zoom'],
      ['help.key.tap', 'help.act.select'],
      ['help.key.space', 'help.act.play'],
      ['help.key.brackets', 'help.act.speed'],
      ['help.key.arrows', 'help.act.rotate'],
      ['help.key.qe', 'help.act.zoom'],
      ['help.key.digits', 'help.act.planets'],
      ['help.key.zero', 'help.act.sun'],
      ['help.key.r', 'help.act.reverse'],
      ['help.key.lo', 'help.act.labels'],
      ['help.key.esc', 'help.act.esc'],
    ];
    const table = el('div', { class: 'data-table' });
    for (const [key, action] of rows) {
      table.appendChild(el('div', { class: 'data-row' },
        el('div', { class: 'data-label' }, t(key)),
        el('div', { class: 'data-value' }, t(action)),
      ));
    }
    return el('div', { class: 'help-overlay', onclick: () => this.toggleHelp() },
      el('div', { class: 'help-card', onclick: (e: Event) => e.stopPropagation() },
        el('div', { class: 'help-head' },
          el('h2', {}, t('help.heading')),
          el('button', { class: 'btn btn-ghost icon-btn', onclick: () => this.toggleHelp() }, icon(ICONS.close, 16)),
        ),
        table,
        el('h3', { class: 'info-h3' }, t('help.accuracy')),
        el('div', { class: 'note note-tight' }, t('help.accuracy.ephemeris')),
        el('div', { class: 'note note-tight' }, t('help.accuracy.approx')),
      ),
    );
  }

  /** Per-frame refresh of the live readouts. */
  update(): void {
    this.timePanel.update();
    this.infoPanel.updateLive();
    this.eventsPanel.update();
    this.surfaceHud.update();
  }
}
