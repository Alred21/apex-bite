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

function pollGamepad(): GamepadInputState | undefined {
  if (typeof navigator.getGamepads !== 'function') return undefined;
  const pads = navigator.getGamepads();
  const pad = pads.find((p): p is Gamepad => p !== null && p.connected);
  if (!pad) return undefined;

  const rawSteer = pad.axes[0] ?? 0;
  const steer = Math.abs(rawSteer) > 0.06 ? rawSteer : 0;
  const throttle = pad.buttons[7]?.value ?? 0;
  const brake = pad.buttons[6]?.value ?? 0;
  return { throttle, brake, steer };
}

function bootstrap(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
  const hudRoot = document.querySelector<HTMLElement>('#hud-root');
  if (!canvas || !hudRoot) return;

  bindKeyboardListeners();
  const session = createSimulationSession();
  const renderer = createCircuitRenderer(canvas, session.getSnapshot());
  const hud = createHudView(hudRoot, {
    onToggleCamera: () => {
      session.toggleCamera();
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyC' || e.code === 'KeyV') {
      session.toggleCamera();
    }
  });

  let lastTimeMs = performance.now();
  let accumulatorSeconds = 0;

  function frame(nowMs: number): void {
    const frameSeconds = Math.min(0.1, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;
    accumulatorSeconds += frameSeconds;

    const gamepad = pollGamepad();
    while (accumulatorSeconds >= FIXED_TIMESTEP_SECONDS) {
      session.step(FIXED_TIMESTEP_SECONDS, { keys, gamepad });
      accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
    }

    const snapshot = session.getSnapshot();
    renderer.render(snapshot);
    hud.update(snapshot);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

bootstrap();
