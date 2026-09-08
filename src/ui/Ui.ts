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

type TabId = 'bodies' | 'info' | 'events' | 'settings';

const TABS: Array<{ id: TabId; label: string; iconPath: string }> = [
  { id: 'bodies', label: '天体', iconPath: ICONS.layers },
  { id: 'info', label: '信息', iconPath: ICONS.info },
  { id: 'events', label: '事件', iconPath: ICONS.eclipse },
  { id: 'settings', label: '设置', iconPath: ICONS.globe },
];

export class Ui {
  readonly timePanel: TimePanel;
  readonly bodyList: BodyList;
  readonly infoPanel: InfoPanel;
  readonly eventsPanel: EventsPanel;
  readonly settingsPanel: SettingsPanel;
  readonly surfaceHud: SurfaceHud;

  private readonly root: HTMLElement;
  private readonly leftDock: HTMLElement;
  private readonly rightDock: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly tabBar: HTMLElement;
  private activeTab: TabId = 'info';
  private compact = false;
  private sheetOpen = false;

  constructor(
    container: HTMLElement,
    private readonly state: AppState,
    getSimulation: () => Simulation,
    callbacks: {
      onSurfaceView: (bodyId: string) => void;
      onExitSurface: () => void;
      onWatchEclipse: (eclipse: Eclipse) => void;
    },
  ) {
    this.timePanel = new TimePanel(state);
    this.bodyList = new BodyList(state);
    this.infoPanel = new InfoPanel(state, getSimulation, callbacks.onSurfaceView);
    this.eventsPanel = new EventsPanel(state, { onWatchEclipse: callbacks.onWatchEclipse });
    this.settingsPanel = new SettingsPanel(state, callbacks.onExitSurface);
    this.surfaceHud = new SurfaceHud(state, getSimulation, callbacks.onExitSurface);

    this.leftDock = el('div', { class: 'dock dock-left' });
    this.rightDock = el('div', { class: 'dock dock-right' });
    this.tabBar = el('div', { class: 'tab-bar' });
    this.sheetBody = el('div', { class: 'sheet-body' });
    this.sheet = el('div', { class: 'sheet' },
      el('button', {
        class: 'sheet-handle',
        'aria-label': '展开或收起面板',
        onclick: () => this.toggleSheet(),
      }),
      this.tabBar,
      this.sheetBody,
    );

    this.root = el('div', { class: 'ui-root' },
      el('header', { class: 'topbar' },
        el('div', { class: 'brand' },
          el('span', { class: 'brand-mark' }, '☉'),
          el('span', { class: 'brand-name' }, '太阳系'),
        ),
        this.timePanel.element,
        el('button', {
          class: 'btn btn-ghost icon-btn help-btn',
          title: '快捷键与说明',
          onclick: () => this.toggleHelp(),
        }, icon(ICONS.info, 16)),
      ),
      this.leftDock,
      this.rightDock,
      this.sheet,
      this.surfaceHud.element,
      this.helpOverlay(),
    );
    container.appendChild(this.root);

    this.buildTabs();
    this.layout();
    window.addEventListener('resize', () => this.layout());
    state.on('selection', () => {
      if (this.compact && this.activeTab !== 'info') this.setTab('info');
      if (this.compact) this.setSheetOpen(true);
    });
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
      }, icon(tab.iconPath, 15), el('span', {}, tab.label)));
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
    const rows: Array<[string, string]> = [
      ['拖动 / 单指滑动', '旋转视角'],
      ['滚轮 / 双指捏合', '缩放'],
      ['点击天体或标签', '选中并跟随'],
      ['空格', '播放 / 暂停'],
      ['[ 与 ]', '减速 / 加速'],
      ['← → ↑ ↓ 或 WASD', '旋转视角'],
      ['Q / E 或 + -', '缩放'],
      ['1—9', '快速切换到八大行星与冥王星'],
      ['0', '回到太阳'],
      ['R', '反转时间方向'],
      ['L / O', '开关标签 / 轨道'],
      ['Esc', '取消跟随，退出地表视角'],
    ];
    const table = el('div', { class: 'data-table' });
    for (const [key, action] of rows) {
      table.appendChild(el('div', { class: 'data-row' },
        el('div', { class: 'data-label' }, key),
        el('div', { class: 'data-value' }, action),
      ));
    }
    return el('div', { class: 'help-overlay', onclick: () => this.toggleHelp() },
      el('div', { class: 'help-card', onclick: (e: Event) => e.stopPropagation() },
        el('div', { class: 'help-head' },
          el('h2', {}, '操作与说明'),
          el('button', { class: 'btn btn-ghost icon-btn', onclick: () => this.toggleHelp() }, icon(ICONS.close, 16)),
        ),
        table,
        el('h3', { class: 'info-h3' }, '数据精度'),
        el('div', { class: 'note note-tight' },
          '太阳位置采用截断的 VSOP87D 地球级数（误差约几角秒），月球位置采用 ELP-2000/82 截断级数（经度误差约 10 角秒）。'
          + '行星位置来自 JPL 近似轨道根数（1800—2050 年有效，误差约 1 角分）。'
          + '日出日落由太阳高度过 -0.833° 的时刻求根得到，与天文年历一致到分钟以内。'
          + '日月食采用 Meeus《天文算法》第 54 章的方法，食甚时刻与已公布星表相差通常不超过 1 分钟；'
          + '本地环境由日月视圆面的地平坐标几何直接计算。'),
        el('div', { class: 'note note-tight' },
          '木星的四颗伽利略卫星使用真实平黄经，其余卫星、矮行星的轨道要素为实测值但历元相位为近似值，'
          + '小行星带与柯伊伯带为按真实分布统计生成的示意群体。'),
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
