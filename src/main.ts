import { createKartAudio } from './audio/kart-audio';
import { createCircuitRenderer } from './render/scene';
import {
  createSimulationSession,
  FIXED_TIMESTEP_SECONDS,
} from './simulation/session';
import { GamepadInputState } from './simulation/types';
import { createHudView } from './ui/hud';
import { bindDriverControls } from './ui/driver-controls';

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

  const session = createSimulationSession({
    // Access localStorage inside the session's guarded adapter calls: some browsers
    // throw even when obtaining the property (for example, blocked storage).
    storage: typeof window !== 'undefined' ? {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    } : undefined,
  });
  const audio = createKartAudio();
  let controls: ReturnType<typeof bindDriverControls>;
  let gamepadNeedsNeutral = false;
  const releaseInputs = (): void => {
    session.releaseDriverInputs();
    gamepadNeedsNeutral = true;
  };
  const reset = (): void => { controls?.release(); session.reset(); audio.reset(); };
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
    controls?.release();
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
    onSetCameraSettings: (settings) => {
      session.setCameraSettings(settings);
    },
    onSetKeyboardAssistance: (settings) => session.setKeyboardAssistance(settings),
    onToggleRacingLine: () => {
      session.toggleRacingLine();
    },
    onCycleGhostMode: () => {
      session.cycleGhostMode();
    },
    onToggleMode: togglePracticeMode,
    onSelectTimeTrialLapLimit: (lapLimit) => {
      controls?.release();
      session.setTimeTrialLapLimit(lapLimit);
      audio.reset();
    },
    onSelectDrillTarget: (targetId) => {
      controls?.release();
      session.selectDrillTarget(targetId);
      audio.reset();
    },
    onReset: reset,
    onExportData: () => session.exportTrainingDataJson(),
    onImportData: (json) => {
      session.importTrainingDataJson(json);
    },
  });

  controls = bindDriverControls((shortcut) => {
    if (shortcut === 'camera') session.toggleCamera();
    else if (shortcut === 'line') session.toggleRacingLine();
    else if (shortcut === 'ghost') session.cycleGhostMode();
    else if (shortcut === 'mode') togglePracticeMode();
    else if (shortcut === 'reset') reset();
  }, releaseInputs);

  let lastTimeMs = performance.now();
  let accumulatorSeconds = 0;

  function frame(nowMs: number): void {
    const frameSeconds = Math.min(0.1, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;
    accumulatorSeconds += frameSeconds;

    let gamepad = pollGamepad();
    const paused = controls.isPaused();
    const keys = controls.readKeys();
    // Returning from pause/reset requires a neutral gamepad, just as held keys
    // require a fresh press. Otherwise a trigger held over a dialog drives away.
    if (gamepadNeedsNeutral) {
      const neutral = !gamepad || (Math.abs(gamepad.steer ?? 0) <= (gamepad.deadzone ?? 0.06) &&
        (gamepad.throttle ?? 0) <= 0.05 && (gamepad.brake ?? 0) <= 0.05);
      if (neutral && !paused) gamepadNeedsNeutral = false;
      gamepad = undefined;
    }
    while (accumulatorSeconds >= FIXED_TIMESTEP_SECONDS) {
      if (!paused) session.step(FIXED_TIMESTEP_SECONDS, { keys, gamepad });
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
