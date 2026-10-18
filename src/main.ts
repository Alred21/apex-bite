import { createKartAudio } from './audio/kart-audio';
import { createCircuitRenderer } from './render/scene';
import {
  createSimulationSession,
  FIXED_TIMESTEP_SECONDS,
} from './simulation/session';
import { GamepadInputState, KeyboardInputState } from './simulation/types';
import { createHudView } from './ui/hud';

const keys: KeyboardInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  space: false,
};

function bindKeyboardListeners(): void {
  const handleKey = (e: KeyboardEvent, isDown: boolean): void => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.up = isDown;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.down = isDown;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = isDown;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = isDown;
        break;
      case 'Space':
        keys.space = isDown;
        break;
    }
  };

  window.addEventListener('keydown', (e) => handleKey(e, true));
  window.addEventListener('keyup', (e) => handleKey(e, false));
}

function pollGamepad(deadzone = 0.06): GamepadInputState | undefined {
  if (typeof navigator.getGamepads !== 'function') return undefined;
  const pads = navigator.getGamepads();
  const pad = pads.find((p): p is Gamepad => p !== null && p.connected);
  if (!pad) return undefined;

  const rawSteer = pad.axes[0] ?? 0;
  const steer = Math.abs(rawSteer) > deadzone ? rawSteer : 0;
  const throttle = pad.buttons[7]?.value ?? 0;
  const brake = pad.buttons[6]?.value ?? 0;
  return { throttle, brake, steer, deadzone };
}

function bootstrap(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
  const hudRoot = document.querySelector<HTMLElement>('#hud-root');
  if (!canvas || !hudRoot) return;

  bindKeyboardListeners();
  const session = createSimulationSession({
    // Access localStorage inside the session's guarded adapter calls: some browsers
    // throw even when obtaining the property (for example, blocked storage).
    storage: typeof window !== 'undefined' ? {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    } : undefined,
  });
  const audio = createKartAudio();
  const reset = (): void => { session.reset(); audio.reset(); };
  window.addEventListener('blur', () => audio.setActive(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.setActive(false);
  });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) audio.setActive(false);
    else audio.dispose();
  });
  const togglePracticeMode = (): void => {
    const next =
      session.getSnapshot().mode === 'Time Trial' ? 'Corner Drill' : 'Time Trial';
    session.setPracticeMode(next);
    audio.reset();
  };
  const renderer = createCircuitRenderer(canvas, session.getSnapshot());
  const hud = createHudView(hudRoot, {
    getAudioState: () => audio.getState(),
    onToggleAudio: () => { void audio.toggle(); },
    onAudioVolume: (volume) => audio.setVolume(volume),
    initialGraphicsQuality: renderer.getGraphicsQuality(),
    onSelectGraphicsQuality: (quality) => renderer.setGraphicsQuality(quality),
    onToggleCamera: () => {
      session.toggleCamera();
    },
    onToggleRacingLine: () => {
      session.toggleRacingLine();
    },
    onCycleGhostMode: () => {
      session.cycleGhostMode();
    },
    onToggleMode: togglePracticeMode,
    onSelectTimeTrialLapLimit: (lapLimit) => {
      session.setTimeTrialLapLimit(lapLimit);
    },
    onSelectDrillTarget: (targetId) => {
      session.selectDrillTarget(targetId);
      audio.reset();
    },
    onReset: reset,
    onExportData: () => session.exportTrainingDataJson(),
    onImportData: (json) => {
      session.importTrainingDataJson(json);
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyC' || e.code === 'KeyV') {
      session.toggleCamera();
    } else if (e.code === 'KeyL') {
      session.toggleRacingLine();
    } else if (e.code === 'KeyG') {
      session.cycleGhostMode();
    } else if (e.code === 'KeyM') {
      togglePracticeMode();
    } else if (e.code === 'KeyR') {
      reset();
    }
  });

  let lastTimeMs = performance.now();
  let accumulatorSeconds = 0;

  function frame(nowMs: number): void {
    const frameSeconds = Math.min(0.1, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;
    accumulatorSeconds += frameSeconds;

    const gamepad = pollGamepad();
    const dataDialogOpen = document.querySelector<HTMLDialogElement>('#hud-data-dialog')?.open;
    if (dataDialogOpen) {
      for (const key of Object.keys(keys) as (keyof KeyboardInputState)[]) keys[key] = false;
    }
    while (accumulatorSeconds >= FIXED_TIMESTEP_SECONDS) {
      if (!dataDialogOpen) session.step(FIXED_TIMESTEP_SECONDS, { keys, gamepad });
      accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
    }

    const snapshot = session.getSnapshot();
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    audio.update(snapshot, document.hasFocus() && !document.hidden && !dialogOpen);
    renderer.render(snapshot);
    hud.update(snapshot);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

bootstrap();
