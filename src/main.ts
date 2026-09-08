import './ui/styles.css';
import { AppState } from './app/AppState';
import { Simulation } from './app/Simulation';
import { Scene } from './render/Scene';
import { Controls } from './render/Controls';
import { Ui } from './ui/Ui';
import { loadPhotoMaps } from './render/textures/photoMaps';
import { PLANET_IDS } from './astro/planets';
import { nextFrame } from './app/schedule';
import { surfaceFrame } from './render/orientation';
import type { Eclipse } from './astro/eclipse';
import * as THREE from 'three';

const PLANET_KEYS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

async function boot(): Promise<void> {
  const canvas = document.getElementById('viewport') as HTMLCanvasElement;
  const labelContainer = document.getElementById('labels') as HTMLElement;
  const uiContainer = document.getElementById('ui') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;
  const fill = document.getElementById('loading-fill') as HTMLElement;
  const stepText = document.getElementById('loading-step') as HTMLElement;

  const progress = (value: number, text: string) => {
    fill.style.width = `${Math.round(value * 100)}%`;
    stepText.textContent = text;
    return nextFrame();
  };

  await progress(0.08, '读取贴图资源…');
  const photoMaps = await loadPhotoMaps();

  const state = new AppState();
  // Default the display timezone to the device's, keeping Beijing's coordinates
  // unless the offset clearly points elsewhere.
  const deviceOffset = -new Date().getTimezoneOffset() / 60;
  if (Math.abs(deviceOffset - 8) > 0.1) state.observer = { ...state.observer, offsetHours: deviceOffset };

  const simulation = new Simulation(state.time.jd);

  await progress(0.3, '构建场景…');
  const scene = new Scene(
    {
      canvas,
      labelContainer,
      quality: pickQuality(),
      onSelect: (id) => state.select(id),
    },
    photoMaps,
    state.time.jd,
  );

  /**
   * Standing on a surface only tells the truth at true scale: with bodies
   * exaggerated the Sun and Moon would look many times too wide, and eclipses
   * would be nonsense. So the surface view switches the scene over and the
   * previous viewing scale is restored on the way out.
   */
  let scaleBeforeSurface = { ...state.settings.scale };
  const enterSurface = (bodyId: string) => {
    if (!state.settings.surface) scaleBeforeSurface = { ...state.settings.scale };
    state.setScaleMode('real');
    state.settings.surface = {
      bodyId,
      latitude: state.observer.latitude,
      longitude: state.observer.longitude,
    };
    state.settings.focus = bodyId;
    state.emit('settings');
  };
  const exitSurface = () => {
    if (!state.settings.surface) return;
    const bodyId = state.settings.surface.bodyId;
    state.settings.surface = null;
    state.settings.scale = { ...scaleBeforeSurface };
    state.settings.focus = bodyId;
    const view = scene.views.get(bodyId);
    if (view) scene.rig.frameBody(view.baseRadius * state.settings.scale.bodyScale, 6);
    scene.rig.snap();
    state.emit('settings');
  };

  /**
   * Put the camera where the eclipse can actually be seen.
   *
   * Shadow geometry is only right at true scale - exaggerated bodies would cast
   * exaggerated shadows - so watching an eclipse switches the view over.
   */
  const watchEclipse = (eclipse: Eclipse) => {
    state.time.jd = eclipse.jdMax;
    state.time.playing = false;
    state.settings.surface = null;
    state.setScaleMode('real');
    const solar = eclipse.kind === 'solar';
    const targetId = solar ? 'earth' : 'moon';
    state.select(targetId);
    simulation.update(state.time.jd);
    scene.update(simulation, state.settings, 0.016);

    const rig = scene.rig;
    const target = scene.positionOf(targetId);
    const sunPosition = scene.positionOf('sun');
    if (!target || !sunPosition) return;

    let direction: THREE.Vector3;
    if (solar) {
      // Look straight down on the point of greatest eclipse.
      const earth = simulation.get('earth');
      const rotation = earth ? earth.raDec0 : [0, 90];
      const frame = surfaceFrame(
        rotation[0], rotation[1], earth?.meridian ?? 0,
        eclipse.greatestAt.latitude, eclipse.greatestAt.longitude, 1,
      );
      direction = frame.up.clone();
    } else {
      // Watch the Moon from the Earth's night side, looking down the shadow.
      direction = target.clone().sub(sunPosition).normalize();
    }
    rig.azimuth = Math.atan2(direction.x, direction.z);
    rig.polar = Math.acos(Math.max(-1, Math.min(1, direction.y)));
    const view = scene.views.get(targetId);
    rig.frameBody(view ? view.baseRadius : 1.7, solar ? 2.6 : 5);
    rig.snap();
    state.emit('settings');
  };

  /**
   * Mark a place on a body and swing the camera round so you can see it.
   * Without this, picking a city changes the numbers in the panel but nothing
   * on screen, which leaves you guessing where on the globe it actually is.
   */
  const showLocation = (bodyId: string) => {
    const point = state.surfacePointFor(bodyId);
    const name = bodyId === 'earth'
      ? state.observer.name
      : `${point.latitude.toFixed(1)}°, ${point.longitude.toFixed(1)}°`;
    scene.locationMarker.set(bodyId, point.latitude, point.longitude, name);
    if (state.settings.surface) return;
    scene.lockCameraToMarker = true;

    state.select(bodyId);
    simulation.update(state.time.jd);
    scene.update(simulation, state.settings, 0.016);
    const body = simulation.get(bodyId);
    const view = scene.views.get(bodyId);
    if (!body || !view) return;

    // Look straight down on the marked point from a few radii out.
    const frame = surfaceFrame(
      body.raDec0[0], body.raDec0[1], body.meridian,
      point.latitude, point.longitude, 1,
    );
    const rig = scene.rig;
    rig.azimuth = Math.atan2(frame.up.x, frame.up.z);
    rig.polar = Math.acos(Math.max(-1, Math.min(1, frame.up.y)));
    rig.frameBody(view.baseRadius * state.settings.scale.bodyScale, 3.4);
    rig.userRotated = false;
    state.emit('settings');
  };

  const ui = new Ui(uiContainer, state, () => simulation, {
    onSurfaceView: enterSurface,
    onExitSurface: exitSurface,
    onWatchEclipse: watchEclipse,
    onShowLocation: showLocation,
  });

  state.on('observer', () => {
    if (state.settings.surface) {
      state.settings.surface = {
        ...state.settings.surface,
        latitude: state.observer.latitude,
        longitude: state.observer.longitude,
      };
    }
  });
  state.on('selection', () => {
    // Looking at something else means the marked place is no longer the subject.
    if (state.settings.selected !== scene.locationMarker.bodyId) scene.lockCameraToMarker = false;
    const view = scene.views.get(state.settings.selected ?? '');
    if (view && !state.settings.surface) {
      scene.rig.frameBody(view.baseRadius * state.settings.scale.bodyScale, 7);
    }
  });

  new Controls(canvas, scene.rig, {
    onSelect: (x, y) => {
      const id = scene.pick(x, y, 44, state.settings.visibleKinds);
      if (id) state.select(id);
    },
    onCommand: (key) => handleKey(key),
  });

  function handleKey(key: string): void {
    const time = state.time;
    switch (key) {
      case ' ':
        time.toggle();
        break;
      case ']':
        time.faster();
        break;
      case '[':
        time.slower();
        break;
      case 'r':
        time.direction = time.direction === 1 ? -1 : 1;
        break;
      case 'l':
        state.settings.showLabels = !state.settings.showLabels;
        state.emit('settings');
        break;
      case 'o':
        state.settings.showOrbits = !state.settings.showOrbits;
        state.emit('settings');
        break;
      case 'Escape':
        if (state.settings.surface) exitSurface();
        else {
          state.settings.focus = 'sun';
          state.select(null, false);
        }
        break;
      case '0':
        state.select('sun');
        break;
      default:
        if (key >= '1' && key <= '9') state.select(PLANET_KEYS[Number(key) - 1]);
    }
  }

  // A hidden tab can report a zero-sized viewport; keeping the last good size
  // avoids a divide-by-zero camera and a spurious switch to the phone layout.
  const resize = () => {
    if (window.innerWidth < 1 || window.innerHeight < 1) return;
    scene.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();
  scene.rig.distance = 1.9e6;
  scene.rig.polar = 0.85;
  scene.rig.snap();

  await progress(1, '就绪');
  loading.classList.add('is-done');
  scene.generateSurfaces((done, total, name) => {
    stepText.textContent = `${name} (${done}/${total})`;
  });

  if (import.meta.env.DEV) {
    // Handy for poking at the running simulation from the console.
    (window as unknown as Record<string, unknown>).__solar = { state, simulation, scene, ui };
  }

  let last = performance.now();
  let uiAccumulator = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    state.time.advance(dt);
    simulation.update(state.time.jd);
    scene.update(simulation, state.settings, dt);
    scene.render();

    uiAccumulator += dt;
    if (uiAccumulator > 0.1) {
      uiAccumulator = 0;
      ui.surfaceHud.heading = scene.rig.surfaceAzimuth;
      ui.update();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * Texture resolution budget.
 *
 * Judged from the device rather than the window: a browser window dragged
 * narrow, or one reporting zero size because its tab is hidden, is still a
 * desktop and should not be handed phone-sized textures.
 */
function pickQuality(): 'low' | 'medium' | 'high' {
  const cores = navigator.hardwareConcurrency ?? 4;
  const touchFirst = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const shortEdge = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080);
  if (touchFirst && shortEdge < 900) return 'low';
  if (cores <= 4) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export { PLANET_IDS };

boot();
