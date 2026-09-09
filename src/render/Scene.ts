/**
 * Scene assembly and the per-frame update: positions everything the simulation
 * produced, keeps the camera pointed at whatever is focused, and answers
 * picking queries.
 */
import * as THREE from 'three';
import type { BodyState, Simulation } from '../app/Simulation';
import { ALL_BODIES, BODY_BY_ID, BodyInfo, BodyKind } from '../data';
import { BodyView, PhotoMaps } from './Bodies';
import { Belts } from './Belts';
import { CameraRig } from './CameraRig';
import { Labels } from './Labels';
import {
  OrbitLine, applyOrbitScale, createHeliocentricOrbits, createLunarOrbit, createSatelliteOrbits,
} from './Orbits';
import { Sky } from './Sky';
import { LocationMarker } from './LocationMarker';
import { EclipseTrack } from './EclipseTrack';
import type { EclipseOverlay } from '../app/EclipseWatcher';
import { AtmosphereSky, SKY_PROFILES } from './AtmosphereSky';
import { AU_UNITS, ScaleSettings, scaleHeliocentric } from './frame';
import { AU_KM } from '../astro/planets';
import { iauFrame, surfaceFrame } from './orientation';
import { lunarPositionJ2000 } from '../astro/satellites';
import { jdToTT } from '../astro/time';
import { scheduleFrame } from '../app/schedule';
import { tr } from '../i18n';
import { J2000 } from '../astro/time';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  labelContainer: HTMLElement;
  quality: 'low' | 'medium' | 'high';
  onSelect: (id: string) => void;
}

export interface ViewSettings {
  scale: ScaleSettings;
  /** which classes of body are drawn at all */
  visibleKinds: Record<BodyKind, boolean>;
  showOrbits: boolean;
  showMoonOrbits: boolean;
  showLabels: boolean;
  showBelts: boolean;
  showOort: boolean;
  /** draw the umbra's track across the ground during a solar eclipse */
  showEclipseTrack: boolean;
  showStars: boolean;
  showMilkyWay: boolean;
  /** body the camera is locked to, or null for free flight around the Sun */
  focus: string | null;
  selected: string | null;
  /** first-person observer, when standing on a surface */
  surface: { bodyId: string; latitude: number; longitude: number } | null;
}

const SUN_RADIUS_KM = 696340;
const LOCATION_LABEL_ID = '__location';

interface Occluder {
  direction: THREE.Vector3;
  distance: number;
  angularRadius: number;
}

const QUALITY_PRESETS = {
  low: { textureSize: 512, segments: 32, starCount: 5000, milkyWay: 384, pixelRatio: 1 },
  medium: { textureSize: 1024, segments: 48, starCount: 12000, milkyWay: 512, pixelRatio: 1.5 },
  high: { textureSize: 2048, segments: 96, starCount: 22000, milkyWay: 768, pixelRatio: 2 },
} as const;

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly views = new Map<string, BodyView>();
  private readonly sky: Sky;
  private readonly belts = new Belts();
  private readonly atmosphereSky = new AtmosphereSky();
  readonly locationMarker = new LocationMarker();
  private readonly eclipseTrack = new EclipseTrack();
  private eclipseOverlay: EclipseOverlay | null = null;
  /**
   * While set, the camera keeps the marked place facing the viewer as the body
   * turns. Rotating by hand releases it, so the lock never fights the user.
   */
  lockCameraToMarker = false;
  private focusedId: string | null = null;
  private readonly labels: Labels;
  private readonly orbits: OrbitLine[] = [];
  private readonly orbitById = new Map<string, OrbitLine>();
  private readonly sunLight: THREE.PointLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly scaledPositions = new Map<string, THREE.Vector3>();
  private readonly preset: (typeof QUALITY_PRESETS)[keyof typeof QUALITY_PRESETS];
  private readonly onSelect: (id: string) => void;
  private width = 1;
  private height = 1;
  private appliedScale: ScaleSettings | null = null;

  constructor(options: SceneOptions, photoMaps: Map<string, PhotoMaps>, jd: number) {
    this.preset = QUALITY_PRESETS[options.quality];
    this.onSelect = options.onSelect;

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.quality !== 'low',
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.rig = new CameraRig(1);
    this.labels = new Labels(options.labelContainer);

    this.sky = new Sky({
      radius: 4e8,
      starCount: this.preset.starCount,
      milkyWayResolution: this.preset.milkyWay,
    });
    this.scene.add(this.sky.group);
    this.scene.add(this.belts.group);
    this.scene.add(this.atmosphereSky.mesh);
    this.scene.add(this.locationMarker.group);
    this.scene.add(this.eclipseTrack.group);

    // The Sun lights everything; falloff is compressed in the material tint
    // rather than the light itself, so distant planets stay legible.
    this.sunLight = new THREE.PointLight(0xfff4e0, 3.2, 0, 0);
    this.scene.add(this.sunLight);
    this.ambient = new THREE.AmbientLight(0x2a3550, 0.35);
    this.scene.add(this.ambient);

    const jdtt = jdToTT(jd);
    for (const info of ALL_BODIES) {
      const view = new BodyView(info, {
        textureSize: textureSizeFor(info, this.preset.textureSize),
        segments: segmentsFor(info, this.preset.segments),
        photoMaps,
      });
      this.views.set(info.id, view);
      this.scene.add(view.group);
      this.labels.ensure({
        id: info.id,
        text: tr(info.name),
        kind: info.kind,
        onClick: this.onSelect,
      });
    }

    for (const orbit of [
      ...createHeliocentricOrbits(jdtt),
      ...createSatelliteOrbits(jdtt),
      createLunarOrbit(lunarPositionJ2000, jdtt),
    ]) {
      this.orbits.push(orbit);
      this.orbitById.set(orbit.id, orbit);
      if (orbit.parentId) {
        // Satellite orbits ride along with their parent's group.
        this.views.get(orbit.parentId)?.group.add(orbit.line);
      } else {
        this.scene.add(orbit.line);
      }
    }
  }

  /** Re-label every body, for when the interface language changes. */
  refreshLabels(): void {
    for (const info of ALL_BODIES) {
      this.labels.ensure({
        id: info.id,
        text: tr(info.name),
        kind: info.kind,
        onClick: this.onSelect,
      });
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
  }

  /** Scene-space position of a body under the current scale settings. */
  positionOf(id: string): THREE.Vector3 | undefined {
    return this.scaledPositions.get(id);
  }

  update(simulation: Simulation, settings: ViewSettings, dt: number): void {
    const { scale } = settings;
    if (
      !this.appliedScale ||
      this.appliedScale.distanceExponent !== scale.distanceExponent ||
      this.appliedScale.moonOrbitScale !== scale.moonOrbitScale
    ) {
      for (const orbit of this.orbits) applyOrbitScale(orbit, scale);
      this.appliedScale = { ...scale };
    }

    // Planet and small-body positions first, then moons relative to them.
    for (const state of simulation.list()) {
      const position = this.scaledPositionOf(state, scale);
      this.scaledPositions.set(state.id, position);
    }

    const sunPosition = this.scaledPositions.get('sun') as THREE.Vector3;
    this.sunLight.position.copy(sunPosition);

    // The camera moves before anything that depends on where it is: marker
    // sizing, occlusion and label placement all read the pose set here, so they
    // describe this frame rather than the last one.
    this.updateCamera(simulation, settings, dt);

    const sunDirection = new THREE.Vector3();
    const occluder = this.currentOccluder(settings);
    for (const state of simulation.list()) {
      const view = this.views.get(state.id);
      const position = this.scaledPositions.get(state.id);
      if (!view || !position) continue;
      const kindVisible = settings.visibleKinds[state.info.kind] !== false;
      view.group.visible = kindVisible;
      if (!kindVisible) continue;
      sunDirection.copy(sunPosition).sub(position).normalize();
      view.update(state, scale, position, sunDirection);
      const cameraDistance = this.rig.camera.position.distanceTo(position);
      view.updateMarker(
        this.minimumVisibleSize(cameraDistance),
        view.baseRadius * scale.bodyScale * 2,
        state.id !== settings.focus && this.isOccluded(position, occluder),
      );
    }

    this.updateEclipseShadows(simulation);
    this.updateLocationMarker(simulation, settings);
    this.updateEclipseTrack(simulation, settings);
    this.belts.update(jdToTT(simulation.jd) - J2000, scale, this.beltPointScale());
    this.belts.setAllVisible(settings.showBelts);
    this.belts.setVisible('oort', settings.showOort);
    this.sky.update(this.rig.camera.position);
    this.sky.setVisible(settings.showStars, settings.showMilkyWay);
    this.updateOrbitVisibility(settings);
    this.updateLabels(simulation, settings);
  }

  /**
   * Work out which body, if any, is currently casting a shadow onto each world,
   * and hand the true geometry to its material.
   *
   * This is what puts the Moon's shadow on the Earth during a solar eclipse and
   * Io's shadow on Jupiter, and it uses unscaled positions so the shadow is the
   * right size no matter how the scene is scaled for viewing.
   */
  private updateEclipseShadows(simulation: Simulation): void {
    const sun = simulation.get('sun');
    if (!sun) return;
    const relative = (a: BodyState, b: BodyState, radiusKm: number): THREE.Vector3 =>
      new THREE.Vector3(
        a.position[0] - b.position[0],
        a.position[2] - b.position[2],
        -(a.position[1] - b.position[1]),
      ).multiplyScalar(AU_KM / radiusKm);

    for (const state of simulation.list()) {
      const view = this.views.get(state.id);
      if (!view || state.info.kind === 'star' || state.info.kind === 'comet') continue;
      const radiusKm = state.info.physical.radiusKm;
      const sunRel = relative(sun, state, radiusKm);
      const sunRadius = SUN_RADIUS_KM / radiusKm;

      let bestCaster: BodyState | null = null;
      let bestAngle = Infinity;
      for (const candidate of this.shadowCandidates(simulation, state)) {
        const casterRel = relative(candidate, state, radiusKm);
        if (casterRel.length() >= sunRel.length()) continue;
        const angle = casterRel.angleTo(sunRel);
        if (angle < bestAngle) {
          bestAngle = angle;
          bestCaster = candidate;
        }
      }
      // Beyond a few degrees the shadow cone cannot touch this body at all.
      if (bestCaster && bestAngle < 0.35) {
        view.setEclipseCaster(
          sunRel, sunRadius,
          relative(bestCaster, state, radiusKm),
          bestCaster.info.physical.radiusKm / radiusKm,
        );
      } else {
        view.setEclipseCaster(sunRel, sunRadius, null, 0);
      }
    }
  }

  /** Put the marked place on the surface of its body, at a constant screen size. */
  private updateLocationMarker(simulation: Simulation, settings: ViewSettings): void {
    const marker = this.locationMarker;
    const id = marker.bodyId;
    if (!id || settings.surface) {
      marker.group.visible = false;
      return;
    }
    const state = simulation.get(id);
    const view = this.views.get(id);
    const position = this.scaledPositions.get(id);
    if (!state || !view || !position || settings.visibleKinds[state.info.kind] === false) {
      marker.group.visible = false;
      return;
    }
    const radius = view.baseRadius * settings.scale.bodyScale;
    const frame = surfaceFrame(
      state.raDec0[0], state.raDec0[1], state.meridian,
      marker.latitude, marker.longitude, radius,
    );
    const surfacePosition = frame.position.clone().add(position);
    const cameraPosition = this.rig.camera.position;
    const distance = cameraPosition.distanceTo(surfacePosition);
    marker.update(surfacePosition, frame.up, cameraPosition, this.minimumVisibleSize(distance) * 3.2);
  }

  /** Hand the renderer the eclipse currently under way, or null for none. */
  setEclipseOverlay(overlay: EclipseOverlay | null): void {
    this.eclipseOverlay = overlay;
  }

  /** Lay the shadow track on the Earth and move the umbra marker along it. */
  private updateEclipseTrack(simulation: Simulation, settings: ViewSettings): void {
    const overlay = settings.showEclipseTrack && !settings.surface ? this.eclipseOverlay : null;
    const state = simulation.get('earth');
    const view = this.views.get('earth');
    const position = this.scaledPositions.get('earth');
    if (!overlay || !state || !view || !position || settings.visibleKinds.planet === false) {
      this.eclipseTrack.setOverlay(null, 0);
      return;
    }
    const radius = view.baseRadius * settings.scale.bodyScale;
    this.eclipseTrack.setOverlay(overlay, radius);
    const distance = this.rig.camera.position.distanceTo(position);
    this.eclipseTrack.update(
      overlay,
      position,
      iauFrame(state.raDec0[0], state.raDec0[1], state.meridian),
      radius,
      this.minimumVisibleSize(distance),
    );
  }

  /** Bodies close enough to this one to plausibly eclipse its sunlight. */
  private shadowCandidates(simulation: Simulation, state: BodyState): BodyState[] {
    const result: BodyState[] = [];
    if (state.parentId) {
      const parent = simulation.get(state.parentId);
      if (parent) result.push(parent);
      for (const sibling of simulation.list()) {
        if (sibling.parentId === state.parentId && sibling.id !== state.id) result.push(sibling);
      }
    } else {
      for (const other of simulation.list()) {
        if (other.parentId === state.id) result.push(other);
      }
    }
    return result;
  }

  private scaledPositionOf(state: BodyState, scale: ScaleSettings): THREE.Vector3 {
    if (state.parentId) {
      const parent = this.scaledPositions.get(state.parentId);
      const offset = new THREE.Vector3(
        state.relative[0], state.relative[2], -state.relative[1],
      ).multiplyScalar(AU_UNITS * scale.moonOrbitScale);
      return parent ? offset.add(parent) : offset;
    }
    const scaled = scaleHeliocentric(state.position, scale);
    return new THREE.Vector3(scaled[0], scaled[2], -scaled[1]).multiplyScalar(AU_UNITS);
  }

  private updateCamera(simulation: Simulation, settings: ViewSettings, dt: number): void {
    if (settings.surface) {
      const state = simulation.get(settings.surface.bodyId);
      const view = this.views.get(settings.surface.bodyId);
      const position = this.scaledPositions.get(settings.surface.bodyId);
      const sunPosition = this.scaledPositions.get('sun');
      if (state && view && position && sunPosition) {
        const radius = view.baseRadius * settings.scale.bodyScale;
        // Eye height of about 1.8 m, in scene units, so the horizon sits where
        // it really would rather than kilometres up.
        const frame = surfaceFrame(
          state.raDec0[0], state.raDec0[1], state.meridian,
          settings.surface.latitude, settings.surface.longitude,
          radius + 0.0000018,
        );
        const eye = frame.position.clone().add(position);
        this.rig.mode = 'surface';
        this.rig.setSurfaceFrame(eye, frame.up, frame.north, frame.east);
        const toSun = sunPosition.clone().sub(eye).normalize();
        this.atmosphereSky.update(settings.surface.bodyId, eye, frame.up, toSun);
        // Stars wash out as the sky brightens, the way they really do.
        const sunAltitude = (Math.asin(Math.max(-1, Math.min(1, toSun.dot(frame.up)))) * 180) / Math.PI;
        this.sky.setNightFactor(
          SKY_PROFILES[settings.surface.bodyId] ? (-sunAltitude - 3) / 12 : 1,
        );
      }
    } else {
      this.atmosphereSky.setVisible(false);
      this.sky.setNightFactor(1);
      this.rig.mode = 'orbit';
      if (this.rig.userRotated) {
        this.rig.userRotated = false;
        this.lockCameraToMarker = false;
      }
      const marker = this.locationMarker;
      if (this.lockCameraToMarker && marker.bodyId) {
        // Turn with the body so the marked place stays facing the viewer. The
        // target angle sweeps a full turn per rotation, far faster than the
        // damping could follow, so the orientation is snapped rather than eased.
        const markerState = simulation.get(marker.bodyId);
        if (markerState) {
          const markerFrame = surfaceFrame(
            markerState.raDec0[0], markerState.raDec0[1], markerState.meridian,
            marker.latitude, marker.longitude, 1,
          );
          this.rig.azimuth = Math.atan2(markerFrame.up.x, markerFrame.up.z);
          this.rig.polar = Math.acos(Math.max(-1, Math.min(1, markerFrame.up.y)));
          this.rig.snapOrientation();
        }
      }
      const focus = settings.focus ? this.scaledPositions.get(settings.focus) : undefined;
      if (settings.focus !== this.focusedId) {
        this.focusedId = settings.focus;
        this.rig.beginTargetTransition();
      }
      this.rig.target.copy(focus ?? new THREE.Vector3());
      const view = settings.focus ? this.views.get(settings.focus) : undefined;
      if (view) this.rig.minDistance = Math.max(0.05, view.baseRadius * settings.scale.bodyScale * 1.12);
      else this.rig.minDistance = 100;
    }
    this.rig.update(dt);
  }

  private updateOrbitVisibility(settings: ViewSettings): void {
    for (const orbit of this.orbits) {
      const material = orbit.line.material as THREE.LineBasicMaterial;
      const isMoon = orbit.parentId !== undefined;
      const info = BODY_BY_ID.get(orbit.id);
      let visible = isMoon ? settings.showMoonOrbits : settings.showOrbits;
      if (info && settings.visibleKinds[info.kind] === false) visible = false;
      if (settings.surface) visible = false;
      if (isMoon && visible) {
        // Only draw moon paths when their planet is actually being looked at.
        const parentPos = this.scaledPositions.get(orbit.parentId as string);
        if (parentPos) {
          const distance = this.rig.camera.position.distanceTo(parentPos);
          const view = this.views.get(orbit.id);
          const spanUnits =
            (view ? view.baseRadius : 1) * 0 +
            orbitSpan(orbit) * settings.scale.moonOrbitScale;
          visible = distance < spanUnits * 90;
        }
      }
      orbit.line.visible = visible;
      material.opacity = settings.selected === orbit.id ? 0.85 : isMoon ? 0.3 : 0.34;
    }
  }

  private updateLabels(simulation: Simulation, settings: ViewSettings): void {
    if (!settings.showLabels) {
      this.labels.hideAll();
      return;
    }
    this.labels.beginFrame();
    const cameraPosition = this.rig.camera.position;
    const occluder = this.currentOccluder(settings);

    // Offer labels most-important first so collisions drop the least useful.
    const ordered = simulation.list().slice().sort((a, b) => {
      if (a.id === settings.selected) return -1;
      if (b.id === settings.selected) return 1;
      return labelPriority(a) - labelPriority(b);
    });

    for (const state of ordered) {
      const position = this.scaledPositions.get(state.id);
      const view = this.views.get(state.id);
      if (!position || !view) continue;
      if (settings.visibleKinds[state.info.kind] === false) {
        this.labels.hide(state.id);
        continue;
      }
      const distance = cameraPosition.distanceTo(position);
      const radius = view.baseRadius * settings.scale.bodyScale;
      const apparentSize = radius / distance;

      let show = true;
      if (state.info.kind === 'moon') {
        // Only while its planet is actually being looked at.
        const parentPosition = this.scaledPositions.get(state.parentId as string);
        show = parentPosition
          ? cameraPosition.distanceTo(parentPosition) <
            state.parentDistance * AU_UNITS * settings.scale.moonOrbitScale * 12
          : false;
      } else if (state.info.kind === 'comet') {
        // A comet is worth naming when it is close enough to the Sun to be
        // active, or when the viewer has gone looking for it.
        show = state.sunDistance < 6 ||
          state.id === settings.selected ||
          distance < 3e5;
      }
      // A label sitting inside the body it names is just noise.
      if (apparentSize > 0.6) show = false;
      if (show && state.id !== settings.focus && this.isOccluded(position, occluder)) show = false;
      if (settings.surface && state.id === settings.surface.bodyId) show = false;
      if (show) {
        this.labels.place(
          state.id, position, this.rig.camera, this.width, this.height,
          settings.selected === state.id,
        );
      } else {
        this.labels.hide(state.id);
      }
    }

    const marker = this.locationMarker;
    if (marker.bodyId && marker.group.visible) {
      this.labels.ensure({
        id: LOCATION_LABEL_ID,
        text: marker.label,
        kind: 'place',
        onClick: () => {},
      });
      this.labels.place(
        LOCATION_LABEL_ID, marker.anchor, this.rig.camera, this.width, this.height, true,
      );
    } else {
      this.labels.hide(LOCATION_LABEL_ID);
    }
  }

  /**
   * True when a body is hidden behind the one currently being looked at.
   *
   * Without this, Neptune's label happily floats across the middle of the Earth
   * whenever the two line up, which reads as a bug even though the geometry is
   * right.
   */
  private isOccluded(position: THREE.Vector3, occluder: Occluder | null): boolean {
    if (!occluder) return false;
    const camera = this.rig.camera.position;
    const toBody = position.clone().sub(camera);
    const distance = toBody.length();
    if (distance <= occluder.distance) return false;
    const angle = toBody.normalize().angleTo(occluder.direction);
    return angle < occluder.angularRadius;
  }

  /** The body the camera is looking at, as a blocking disc. */
  private currentOccluder(settings: ViewSettings): Occluder | null {
    const id = settings.focus;
    if (!id || settings.surface) return null;
    const position = this.scaledPositions.get(id);
    const view = this.views.get(id);
    if (!position || !view) return null;
    const camera = this.rig.camera.position;
    const toBody = position.clone().sub(camera);
    const distance = toBody.length();
    const radius = view.baseRadius * settings.scale.bodyScale;
    if (distance <= radius) return null;
    return {
      direction: toBody.normalize(),
      distance,
      angularRadius: Math.asin(Math.min(1, radius / distance)),
    };
  }

  /** World-space diameter that corresponds to a few pixels on screen. */
  private minimumVisibleSize(distance: number): number {
    const fov = (this.rig.camera.fov * Math.PI) / 180;
    const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / Math.max(1, this.height);
    return worldPerPixel * 3.2;
  }

  private beltPointScale(): number {
    return Math.min(2.5, Math.max(0.4, 60000 / Math.max(1, this.rig.currentDistance) + 0.5));
  }

  /**
   * Build the procedural surfaces a few at a time, largest bodies first, so the
   * scene is interactive immediately and sharpens over the next second or two.
   */
  generateSurfaces(onProgress?: (done: number, total: number, name: string) => void): void {
    const pending = [...this.views.values()]
      .filter((view) => view.needsGeneratedSurface)
      .sort((a, b) => priority(a.info) - priority(b.info));
    const total = pending.length;
    let done = 0;
    const step = () => {
      const budgetEnd = performance.now() + 12;
      while (pending.length > 0 && performance.now() < budgetEnd) {
        const view = pending.shift() as BodyView;
        view.generateSurfaceNow();
        done += 1;
        onProgress?.(done, total, tr(view.info.name));
      }
      if (pending.length > 0) scheduleFrame(step);
    };
    scheduleFrame(step);
  }

  /** Nearest body to a screen point, within a tolerance in pixels. */
  pick(clientX: number, clientY: number, tolerance = 44, visibleKinds?: Record<BodyKind, boolean>): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: string | null = null;
    let bestDistance = tolerance;
    const projected = new THREE.Vector3();
    for (const [id, position] of this.scaledPositions) {
      const info = BODY_BY_ID.get(id);
      if (visibleKinds && info && visibleKinds[info.kind] === false) continue;
      projected.copy(position).project(this.rig.camera);
      if (projected.z > 1) continue;
      const sx = (projected.x * 0.5 + 0.5) * this.width;
      const sy = (-projected.y * 0.5 + 0.5) * this.height;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = id;
      }
    }
    return best;
  }

  render(): void {
    this.renderer.render(this.scene, this.rig.camera);
  }
}

/** Label importance: lower wins a collision. */
function labelPriority(state: BodyState): number {
  switch (state.info.kind) {
    case 'star': return 0;
    case 'planet': return 1;
    case 'dwarf': return 3;
    case 'moon': return 4;
    default: return 5;
  }
}

/** Big, prominent bodies get their surfaces first. */
function priority(info: BodyInfo): number {
  if (info.kind === 'star') return 0;
  if (info.kind === 'planet') return 1;
  if (info.id === 'moon') return 2;
  if (info.physical.radiusKm > 1000) return 3;
  if (info.kind === 'dwarf') return 4;
  return 5;
}

function orbitSpan(orbit: OrbitLine): number {
  let max = 0;
  for (const p of orbit.points) max = Math.max(max, Math.hypot(p[0], p[1], p[2]));
  return max / 1000; // km -> scene units
}

function textureSizeFor(info: BodyInfo, base: number): number {
  if (info.kind === 'star' || info.id === 'jupiter' || info.id === 'earth' || info.id === 'saturn') return base;
  if (info.kind === 'planet' || info.id === 'moon' || info.id === 'titan' || info.id === 'io') return Math.max(256, base / 2);
  return Math.max(128, base / 4);
}

function segmentsFor(info: BodyInfo, base: number): number {
  if (info.kind === 'planet' || info.kind === 'star') return base;
  if (info.physical.radiusKm > 500) return Math.max(16, base / 2);
  return Math.max(12, base / 3);
}
