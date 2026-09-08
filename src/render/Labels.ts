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

  /** Place a label at a world position; returns false when it is off screen. */
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
    const visible =
      this.projected.z < 1 &&
      this.projected.x > -1.15 && this.projected.x < 1.15 &&
      this.projected.y > -1.15 && this.projected.y < 1.15;
    if (!visible) {
      element.style.display = 'none';
      return false;
    }
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;
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
