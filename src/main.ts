import './ui/styles.css';
import { AppState } from './app/AppState';
import { Simulation } from './app/Simulation';
import { Scene } from './render/Scene';
import { Controls } from './render/Controls';
import { Ui } from './ui/Ui';
import { loadPhotoMaps } from './render/textures/photoMaps';
import { PLANET_IDS } from './astro/planets';
import { nextFrame } from './app/schedule';

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

  const enterSurface = (bodyId: string) => {
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
    state.settings.focus = bodyId;
    const view = scene.views.get(bodyId);
    if (view) scene.rig.frameBody(view.baseRadius * state.settings.scale.bodyScale, 6);
    scene.rig.snap();
    state.emit('settings');
  };

  const ui = new Ui(uiContainer, state, () => simulation, {
    onSurfaceView: enterSurface,
    onExitSurface: exitSurface,
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
    const view = scene.views.get(state.settings.selected ?? '');
    if (view && !state.settings.surface) {
      scene.rig.frameBody(view.baseRadius * state.settings.scale.bodyScale, 7);
    }
  });

  new Controls(canvas, scene.rig, {
    onSelect: (x, y) => {
      const id = scene.pick(x, y);
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

  const resize = () => scene.resize(window.innerWidth, window.innerHeight);
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

function pickQuality(): 'low' | 'medium' | 'high' {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile || cores <= 4) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export { PLANET_IDS };

boot();
