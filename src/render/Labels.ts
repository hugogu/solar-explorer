/** DOM label overlay: cheaper and crisper than sprite text, and selectable. */
import * as THREE from 'three';

export interface LabelSpec {
  id: string;
  text: string;
  kind: string;
  onClick: (id: string) => void;
}

export class Labels {
  private readonly elements = new Map<string, HTMLButtonElement>();
  private readonly projected = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {}

  ensure(spec: LabelSpec): HTMLButtonElement {
    let element = this.elements.get(spec.id);
    if (!element) {
      element = document.createElement('button');
      element.className = `label label-${spec.kind}`;
      element.type = 'button';
      element.dataset.id = spec.id;
      // Stay hidden until the first frame places it, so nothing piles up in
      // the corner before the scene has been drawn once.
      element.style.display = 'none';
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        spec.onClick(spec.id);
      });
      this.container.appendChild(element);
      this.elements.set(spec.id, element);
    }
    if (element.textContent !== spec.text) element.textContent = spec.text;
    return element;
  }

  /** Screen boxes claimed so far this frame, used to cull overlapping labels. */
  private readonly claimed: Array<[number, number, number, number]> = [];

  /** Call once per frame before placing any labels. */
  beginFrame(): void {
    this.claimed.length = 0;
  }

  /**
   * Place a label at a world position.
   *
   * Labels are offered in priority order and a lower priority one is dropped
   * when it would collide with a box already taken, which keeps a crowded inner
   * system readable instead of a pile of overlapping comet names.
   *
   * @returns false when the label is off screen or was culled
   */
  place(
    id: string,
    worldPosition: THREE.Vector3,
    camera: THREE.Camera,
    width: number,
    height: number,
    selected: boolean,
  ): boolean {
    const element = this.elements.get(id);
    if (!element) return false;
    this.projected.copy(worldPosition).project(camera);
    const onScreen =
      this.projected.z < 1 &&
      this.projected.x > -1.05 && this.projected.x < 1.05 &&
      this.projected.y > -1.05 && this.projected.y < 1.05;
    if (!onScreen) {
      element.style.display = 'none';
      return false;
    }
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;

    // Estimated box: CJK glyphs are close to square at the label font size.
    const text = element.textContent ?? '';
    const glyphs = [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55), 0);
    const halfWidth = glyphs * 6.5 + 8;
    const box: [number, number, number, number] = [x - halfWidth, y - 9, x + halfWidth, y + 9];

    if (!selected) {
      for (const other of this.claimed) {
        if (box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]) {
          element.style.display = 'none';
          return false;
        }
      }
    }
    this.claimed.push(box);

    element.style.display = '';
    element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    element.classList.toggle('is-selected', selected);
    return true;
  }

  hide(id: string): void {
    const element = this.elements.get(id);
    if (element) element.style.display = 'none';
  }

  hideAll(): void {
    for (const element of this.elements.values()) element.style.display = 'none';
  }

  remove(id: string): void {
    this.elements.get(id)?.remove();
    this.elements.delete(id);
  }
}
