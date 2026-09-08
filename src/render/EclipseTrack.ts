/**
 * The shadow's track drawn on the globe.
 *
 * Everything here lives in the planet's own body-fixed frame, so the track
 * turns with the planet exactly as a line drawn on a map would: the umbra
 * sweeps along it while the ground rotates underneath, which is the thing the
 * shading alone cannot show.
 */
import * as THREE from 'three';
import type { EclipseOverlay } from '../app/EclipseWatcher';
import { radialSprite } from './textures/generators';

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6378.14;

/** Body-fixed unit vector for a geographic position. */
function unitAt(latitude: number, longitude: number, target = new THREE.Vector3()): THREE.Vector3 {
  const lat = latitude * DEG;
  const lon = longitude * DEG;
  return target.set(
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  );
}

export class EclipseTrack {
  readonly group = new THREE.Group();
  private readonly centreLine: THREE.Line;
  private readonly band: THREE.Mesh;
  private readonly penumbraLoop: THREE.LineLoop;
  private readonly umbra: THREE.Mesh;
  private readonly umbraGlow: THREE.Sprite;
  private capacity = 0;
  private bandCapacity = 0;
  private penumbraCapacity = 0;

  constructor() {
    this.group.name = 'eclipse-track';
    this.group.visible = false;

    // Path of totality. Vertex colours carry how far the shadow has got, so
    // the track it has already covered reads as spent.
    const centreGeometry = new THREE.BufferGeometry();
    this.centreLine = new THREE.Line(
      centreGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.centreLine.frustumCulled = false;
    this.group.add(this.centreLine);

    // The band of totality, at its real width. A one pixel line cannot show
    // that the umbra is a couple of hundred kilometres across; this can.
    this.band = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffc06a,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.band.frustumCulled = false;
    this.group.add(this.band);

    const penumbraGeometry = new THREE.BufferGeometry();
    this.penumbraLoop = new THREE.LineLoop(
      penumbraGeometry,
      new THREE.LineBasicMaterial({
        color: 0x8fc8ff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    this.penumbraLoop.frustumCulled = false;
    this.group.add(this.penumbraLoop);

    // The umbra itself: a ring outline, because the surface shading already
    // supplies the darkness inside it.
    this.umbra = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd08a,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.group.add(this.umbra);

    this.umbraGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialSprite('#ffb347', 64, 2.4),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.umbraGlow);
  }

  private builtFor = Number.NaN;
  private builtRadius = 0;
  private builtOutline: unknown = null;

  /**
   * Rebuild the geometry for a new eclipse; pass null to clear.
   * Called every frame, but only touches buffers when something has changed.
   */
  setOverlay(overlay: EclipseOverlay | null, radiusUnits: number): void {
    if (!overlay) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const scaleChanged = radiusUnits !== this.builtRadius;
    if (overlay.eclipse.jdMax !== this.builtFor || scaleChanged) {
      this.builtFor = overlay.eclipse.jdMax;
      this.builtRadius = radiusUnits;
      this.buildCentreLine(overlay, radiusUnits);
      this.buildBand(overlay, radiusUnits);
      this.builtOutline = null;
    }
    if (overlay.penumbra !== this.builtOutline || scaleChanged) {
      this.builtOutline = overlay.penumbra;
      this.buildPenumbra(overlay, radiusUnits);
    }
  }

  private buildCentreLine(overlay: EclipseOverlay, radiusUnits: number): void {
    const samples = overlay.path.samples.filter((s) => s.central);
    const geometry = this.centreLine.geometry;
    if (samples.length < 2) {
      this.centreLine.visible = false;
      return;
    }
    this.centreLine.visible = true;
    if (samples.length > this.capacity) {
      this.capacity = samples.length;
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3));
    }
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    // Sit just clear of the surface so the line is not swallowed by it.
    const lift = radiusUnits * 1.003;
    for (let i = 0; i < samples.length; i++) {
      unitAt(samples[i].latitude, samples[i].longitude, v).multiplyScalar(lift);
      position.setXYZ(i, v.x, v.y, v.z);
      colour.setXYZ(i, 1, 0.82, 0.45);
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    geometry.setDrawRange(0, samples.length);
    geometry.computeBoundingSphere();
  }

  /**
   * Triangle strip following the track, its half width taken from the measured
   * umbra so the swath on screen is the swath on the ground.
   */
  private buildBand(overlay: EclipseOverlay, radiusUnits: number): void {
    const samples = overlay.path.samples.filter((s) => s.central && s.widthKm > 0);
    const geometry = this.band.geometry;
    if (samples.length < 2) {
      this.band.visible = false;
      return;
    }
    this.band.visible = true;
    const vertices = samples.length * 2;
    if (vertices > this.bandCapacity) {
      this.bandCapacity = vertices;
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.bandCapacity * 3), 3));
      const indices: number[] = [];
      for (let i = 0; i < this.bandCapacity / 2 - 1; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geometry.setIndex(indices);
    }
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const lift = radiusUnits * 1.0015;
    const centre = new THREE.Vector3();
    const next = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const sideways = new THREE.Vector3();
    const edge = new THREE.Vector3();

    for (let i = 0; i < samples.length; i++) {
      unitAt(samples[i].latitude, samples[i].longitude, centre);
      const other = samples[Math.min(i + 1, samples.length - 1)] === samples[i]
        ? samples[i - 1]
        : samples[Math.min(i + 1, samples.length - 1)];
      unitAt(other.latitude, other.longitude, next);
      tangent.copy(next).sub(centre);
      tangent.addScaledVector(centre, -tangent.dot(centre)).normalize();
      sideways.crossVectors(centre, tangent).normalize();
      // Half the track width as an angle on the sphere.
      const half = samples[i].widthKm / 2 / EARTH_RADIUS_KM;
      for (const sign of [1, -1]) {
        edge.copy(centre).multiplyScalar(Math.cos(half))
          .addScaledVector(sideways, sign * Math.sin(half))
          .multiplyScalar(lift);
        position.setXYZ(i * 2 + (sign === 1 ? 0 : 1), edge.x, edge.y, edge.z);
      }
    }
    position.needsUpdate = true;
    geometry.setDrawRange(0, (samples.length - 1) * 6);
    geometry.computeBoundingSphere();
  }

  private buildPenumbra(overlay: EclipseOverlay, radiusUnits: number): void {
    const points = overlay.penumbra;
    const geometry = this.penumbraLoop.geometry;
    if (points.length < 8) {
      this.penumbraLoop.visible = false;
      return;
    }
    this.penumbraLoop.visible = true;
    if (points.length > this.penumbraCapacity) {
      this.penumbraCapacity = points.length;
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.penumbraCapacity * 3), 3));
    }
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const lift = radiusUnits * 1.002;
    for (let i = 0; i < points.length; i++) {
      unitAt(points[i].latitude, points[i].longitude, v).multiplyScalar(lift);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    position.needsUpdate = true;
    geometry.setDrawRange(0, points.length);
    geometry.computeBoundingSphere();
  }

  /**
   * Place the track on its planet and move the umbra marker.
   *
   * @param frame body-fixed to scene rotation, so the track turns with the ground
   * @param minimumWorldSize world size that reads as a few pixels, so a
   *   two-hundred-kilometre umbra can still be found on a whole globe
   */
  update(
    overlay: EclipseOverlay | null,
    bodyPosition: THREE.Vector3,
    frame: THREE.Matrix4,
    radiusUnits: number,
    minimumWorldSize: number,
  ): void {
    if (!overlay || !this.group.visible) return;
    this.group.position.copy(bodyPosition);
    this.group.quaternion.setFromRotationMatrix(frame);

    const current = overlay.current;
    const onEarth = current.onEarth && current.coverage > 0.001;
    this.umbra.visible = onEarth;
    this.umbraGlow.visible = onEarth;
    if (!onEarth) return;

    const normal = unitAt(current.latitude, current.longitude);
    const position = normal.clone().multiplyScalar(radiusUnits * 1.004);
    // The umbra really is small - a couple of hundred kilometres on a globe
    // twelve thousand across - so the marker never shrinks below a few pixels.
    const trueRadius = (current.umbraWidthKm / 2) / 1000;
    const radius = Math.max(trueRadius, minimumWorldSize * 0.5);

    this.umbra.position.copy(position);
    this.umbra.scale.setScalar(radius);
    this.umbra.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.umbraGlow.position.copy(position);
    this.umbraGlow.scale.setScalar(radius * 4);
  }

  dispose(): void {
    this.centreLine.geometry.dispose();
    (this.centreLine.material as THREE.Material).dispose();
    this.penumbraLoop.geometry.dispose();
    (this.penumbraLoop.material as THREE.Material).dispose();
    this.umbra.geometry.dispose();
    this.band.geometry.dispose();
    (this.band.material as THREE.Material).dispose();
  }
}
