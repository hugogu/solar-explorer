/**
 * A pin on a globe.
 *
 * Marks the place whose sunrise, sunset and eclipse circumstances the events
 * panel is describing, so the numbers have somewhere to point at. It sits on
 * the surface, keeps a constant size on screen and disappears round the back of
 * the body rather than showing through it.
 */
import * as THREE from 'three';
import { locationRingSprite } from './textures/generators';

export class LocationMarker {
  readonly group = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly stem: THREE.Line;
  /** which body it is attached to, or null when nothing is marked */
  bodyId: string | null = null;
  latitude = 0;
  longitude = 0;
  label = '';

  constructor() {
    this.group.name = 'location-marker';
    this.group.visible = false;

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: locationRingSprite(),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.sprite.renderOrder = 8;
    this.group.add(this.sprite);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.stem = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.7, depthTest: false }),
    );
    this.stem.renderOrder = 7;
    this.stem.frustumCulled = false;
    this.group.add(this.stem);
  }

  set(bodyId: string, latitude: number, longitude: number, label: string): void {
    this.bodyId = bodyId;
    this.latitude = latitude;
    this.longitude = longitude;
    this.label = label;
  }

  clear(): void {
    this.bodyId = null;
    this.group.visible = false;
  }

  /**
   * @param surfacePosition world position of the point on the surface
   * @param up outward normal at that point
   * @param screenScale world size that reads as a constant number of pixels
   */
  update(surfacePosition: THREE.Vector3, up: THREE.Vector3, cameraPosition: THREE.Vector3, screenScale: number): void {
    // Hide it once the point has rotated round to the far side.
    const toCamera = cameraPosition.clone().sub(surfacePosition).normalize();
    if (toCamera.dot(up) < 0.06) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const stemLength = screenScale * 2.2;
    const tip = surfacePosition.clone().addScaledVector(up, stemLength);
    this.sprite.position.copy(tip);
    this.sprite.scale.setScalar(screenScale * 2.4);

    const array = this.stem.geometry.getAttribute('position') as THREE.BufferAttribute;
    array.setXYZ(0, surfacePosition.x, surfacePosition.y, surfacePosition.z);
    array.setXYZ(1, tip.x, tip.y, tip.z);
    array.needsUpdate = true;
    this.stem.geometry.computeBoundingSphere();
  }

  /** World position of the label anchor, for the DOM overlay. */
  get anchor(): THREE.Vector3 {
    return this.sprite.position;
  }
}
