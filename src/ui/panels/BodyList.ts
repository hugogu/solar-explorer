/** Searchable navigator over the whole catalogue. */
import { ALL_BODIES, BodyInfo, BodyKind, moonsOf } from '../../data';
import { AppState } from '../../app/AppState';
import { ICONS, clear, el, icon } from '../dom';
import { type StringKey, t, tr } from '../../i18n';
import { otherName, searchableText } from '../names';

interface Group {
  titleKey: StringKey;
  kind: BodyKind;
  /** moons are listed nested under their planet rather than as rows here */
  nested?: boolean;
  hintKey?: StringKey;
}

const GROUPS: Group[] = [
  { titleKey: 'group.star', kind: 'star' },
  { titleKey: 'group.planet', kind: 'planet' },
  { titleKey: 'group.moon', kind: 'moon', nested: true, hintKey: 'group.moonHint' },
  { titleKey: 'group.dwarf', kind: 'dwarf' },
  { titleKey: 'group.comet', kind: 'comet' },
];

export class BodyList {
  readonly element: HTMLElement;
  private readonly listEl: HTMLElement;
  private query = '';
  private readonly expanded = new Set<string>();
  private readonly off: Array<() => void> = [];

  constructor(private readonly state: AppState) {
    this.listEl = el('div', { class: 'body-list' });
    const search = el('input', {
      type: 'search',
      class: 'field search-field',
      placeholder: t('list.search'),
      'aria-label': t('list.search'),
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
    this.off.push(state.on('selection', () => this.markSelection()));
    this.off.push(state.on('settings', () => this.render()));
  }

  dispose(): void {
    for (const off of this.off) off();
    this.off.length = 0;
  }

  private render(): void {
    clear(this.listEl);
    if (this.query) {
      const matches = ALL_BODIES.filter((b) => this.matchesQuery(b));
      if (matches.length === 0) {
        this.listEl.appendChild(el('div', { class: 'list-empty' }, t('list.empty')));
      }
      for (const body of matches) this.listEl.appendChild(this.row(body, false));
      this.markSelection();
      return;
    }

    for (const group of GROUPS) {
      const bodies = ALL_BODIES.filter((b) => b.kind === group.kind);
      if (bodies.length === 0) continue;
      this.listEl.appendChild(this.groupHeader(group, bodies.length));
      if (group.nested) continue;
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

  /** Group heading with a switch that hides the whole class from the scene. */
  private groupHeader(group: Group, count: number): HTMLElement {
    const title = t(group.titleKey);
    const input = el('input', { type: 'checkbox', 'aria-label': t('list.showKind', { kind: title }) });
    input.checked = this.state.settings.visibleKinds[group.kind];
    input.addEventListener('change', () => {
      this.state.setKindVisible(group.kind, input.checked);
      this.render();
    });
    return el('div', { class: 'list-group' },
      el('span', { class: 'list-group-title' }, title),
      el('span', { class: 'list-group-count' }, group.hintKey ? t(group.hintKey) : String(count)),
      el('label', { class: 'group-switch', title: t('list.toggleKind', { kind: title }) },
        input, el('span', {})),
    );
  }

  /** Matches either language, so an English query still finds a Chinese name. */
  private matchesQuery(body: BodyInfo): boolean {
    return searchableText(body).includes(this.query);
  }

  private row(body: BodyInfo, expandable: boolean, isChild = false): HTMLElement {
    const swatch = el('span', { class: 'swatch' });
    swatch.style.background = body.color;

    const children: HTMLElement[] = [];
    if (expandable) {
      const toggle = el('button', {
        class: 'row-toggle' + (this.expanded.has(body.id) ? ' is-open' : ''),
        title: t('list.expandMoons'),
        'aria-label': t('list.expandMoonsOf', { name: tr(body.name) }),
        onclick: (event: Event) => {
          event.stopPropagation();
          if (this.expanded.has(body.id)) this.expanded.delete(body.id);
          else this.expanded.add(body.id);
          this.render();
        },
      }, icon(ICONS.chevron, 12));
      children.push(toggle);
    }

    const hidden = !this.state.settings.visibleKinds[body.kind];
    const row = el(
      'button',
      {
        class: `body-row${isChild ? ' is-child' : ''}${hidden ? ' is-hidden-kind' : ''}`,
        'data-id': body.id,
        onclick: () => this.state.select(body.id),
      },
      swatch,
      el('span', { class: 'row-name' }, tr(body.name)),
      el('span', { class: 'row-en' }, otherName(body)),
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
