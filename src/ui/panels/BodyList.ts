/** Searchable navigator over the whole catalogue. */
import { ALL_BODIES, BodyInfo, moonsOf } from '../../data';
import { AppState } from '../../app/AppState';
import { ICONS, clear, el, icon } from '../dom';

const GROUPS: Array<{ title: string; match: (b: BodyInfo) => boolean }> = [
  { title: '恒星', match: (b) => b.kind === 'star' },
  { title: '行星', match: (b) => b.kind === 'planet' },
  { title: '矮行星', match: (b) => b.kind === 'dwarf' },
  { title: '彗星', match: (b) => b.kind === 'comet' },
];

export class BodyList {
  readonly element: HTMLElement;
  private readonly listEl: HTMLElement;
  private query = '';
  private readonly expanded = new Set<string>();

  constructor(private readonly state: AppState) {
    this.listEl = el('div', { class: 'body-list' });
    const search = el('input', {
      type: 'search',
      class: 'field search-field',
      placeholder: '搜索天体…',
      'aria-label': '搜索天体',
      oninput: (event) => {
        this.query = (event.target as HTMLInputElement).value.trim().toLowerCase();
        this.render();
      },
    });
    this.element = el(
      'div',
      { class: 'panel body-panel' },
      el('div', { class: 'panel-head' }, icon(ICONS.search, 14), search),
      this.listEl,
    );
    this.render();
    state.on('selection', () => this.markSelection());
  }

  private render(): void {
    clear(this.listEl);
    if (this.query) {
      const matches = ALL_BODIES.filter((b) => this.matchesQuery(b));
      if (matches.length === 0) {
        this.listEl.appendChild(el('div', { class: 'list-empty' }, '没有匹配的天体'));
      }
      for (const body of matches) this.listEl.appendChild(this.row(body, false));
      this.markSelection();
      return;
    }

    for (const group of GROUPS) {
      const bodies = ALL_BODIES.filter(group.match);
      if (bodies.length === 0) continue;
      this.listEl.appendChild(el('div', { class: 'list-group' }, group.title));
      for (const body of bodies) {
        const moons = moonsOf(body.id);
        this.listEl.appendChild(this.row(body, moons.length > 0));
        if (moons.length > 0 && this.expanded.has(body.id)) {
          for (const moon of moons) this.listEl.appendChild(this.row(moon, false, true));
        }
      }
    }
    this.markSelection();
  }

  private matchesQuery(body: BodyInfo): boolean {
    return (
      body.name.toLowerCase().includes(this.query) ||
      body.nameEn.toLowerCase().includes(this.query) ||
      body.tagline.toLowerCase().includes(this.query)
    );
  }

  private row(body: BodyInfo, expandable: boolean, isChild = false): HTMLElement {
    const swatch = el('span', { class: 'swatch' });
    swatch.style.background = body.color;

    const children: HTMLElement[] = [];
    if (expandable) {
      const toggle = el('button', {
        class: 'row-toggle' + (this.expanded.has(body.id) ? ' is-open' : ''),
        title: '展开卫星',
        'aria-label': `展开 ${body.name} 的卫星`,
        onclick: (event: Event) => {
          event.stopPropagation();
          if (this.expanded.has(body.id)) this.expanded.delete(body.id);
          else this.expanded.add(body.id);
          this.render();
        },
      }, icon(ICONS.chevron, 12));
      children.push(toggle);
    }

    const row = el(
      'button',
      {
        class: `body-row${isChild ? ' is-child' : ''}`,
        'data-id': body.id,
        onclick: () => this.state.select(body.id),
      },
      swatch,
      el('span', { class: 'row-name' }, body.name),
      el('span', { class: 'row-en' }, body.nameEn),
      ...children,
    );
    return row;
  }

  private markSelection(): void {
    for (const row of this.listEl.querySelectorAll('.body-row')) {
      row.classList.toggle('is-selected', row.getAttribute('data-id') === this.state.settings.selected);
    }
  }

  /** Open the parent's moon list and scroll a body into view. */
  reveal(id: string): void {
    const info = ALL_BODIES.find((b) => b.id === id);
    if (info?.parent) this.expanded.add(info.parent);
    this.render();
    this.listEl.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
