/**
 * Pointer, touch and keyboard input.
 *
 * Pointer events cover mouse, pen and touch uniformly; a second active pointer
 * switches to pinch handling. Keys work on desktop and on tablets with a
 * keyboard attached.
 */
import { CameraRig } from './CameraRig';

export interface ControlCallbacks {
  onSelect?: (x: number, y: number) => void;
  onCommand?: (command: string) => void;
}

interface PointerState {
  x: number;
  y: number;
}

export class Controls {
  private readonly pointers = new Map<number, PointerState>();
  private lastPinchDistance = 0;
  private dragged = false;
  private downTime = 0;
  private readonly keys = new Set<string>();
  private rafKeysActive = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly rig: CameraRig,
    private readonly callbacks: ControlCallbacks = {},
  ) {
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragged = false;
    this.downTime = performance.now();
    if (this.pointers.size === 2) this.lastPinchDistance = this.pinchDistance();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.dragged = true;

    if (this.pointers.size >= 2) {
      const distance = this.pinchDistance();
      if (this.lastPinchDistance > 0 && distance > 0) {
        this.rig.zoom(this.lastPinchDistance / distance);
      }
      this.lastPinchDistance = distance;
      return;
    }
    const scale = 0.0055;
    this.rig.rotate(dx * scale, dy * scale);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.lastPinchDistance = 0;
    if (wasSingle && !this.dragged && performance.now() - this.downTime < 400) {
      this.callbacks.onSelect?.(event.clientX, event.clientY);
    }
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.rig.zoom(Math.exp(step * 0.0012));
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (HELD_KEYS.has(key)) {
      this.keys.add(key);
      event.preventDefault();
      this.startKeyLoop();
      return;
    }
    this.callbacks.onCommand?.(key);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  };

  /** Held keys need a loop of their own so movement is smooth, not repeat-rate limited. */
  private startKeyLoop(): void {
    if (this.rafKeysActive) return;
    this.rafKeysActive = true;
    const step = () => {
      if (this.keys.size === 0) {
        this.rafKeysActive = false;
        return;
      }
      const rotateStep = 0.022;
      if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.rig.rotate(-rotateStep * 3, 0);
      if (this.keys.has('ArrowRight') || this.keys.has('d')) this.rig.rotate(rotateStep * 3, 0);
      if (this.keys.has('ArrowUp') || this.keys.has('w')) this.rig.rotate(0, rotateStep * 3);
      if (this.keys.has('ArrowDown') || this.keys.has('s')) this.rig.rotate(0, -rotateStep * 3);
      if (this.keys.has('q') || this.keys.has('=') || this.keys.has('+')) this.rig.zoom(0.97);
      if (this.keys.has('e') || this.keys.has('-')) this.rig.zoom(1 / 0.97);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

const HELD_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'a', 'd', 'w', 's', 'q', 'e', '=', '+', '-',
]);
