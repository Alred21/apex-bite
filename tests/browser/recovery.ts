import { createSimulationSession } from '../../src/simulation/session';
import { createHudView } from '../../src/ui/hud';
import { bindDriverControls } from '../../src/ui/driver-controls';
import { createCircuitRenderer } from '../../src/render/scene';
import { analogReferenceCommand } from '../analog-driver';
import { createKartAudio } from '../../src/audio/kart-audio';
import type { CameraMode, CameraSettings, DrillTargetId, DriverInput, GhostMode } from '../../src/simulation/types';

// Actual browser adapter, HUD and Kart presentation driven by normal Session inputs.
const session = createSimulationSession({ referenceReplay: true });
const replay = session.getReferenceReplay();
// Earn a real current PB for integrated Both Ghost Karts and record-portability review.
for (let tick = 0; tick < 9500 && session.getSnapshot().lap.personalBestSeconds === null; tick++) {
  session.step(1 / 120, analogReferenceCommand(session.getSnapshot(), 0.96));
}
if (session.getSnapshot().lap.personalBestSeconds === null) throw new Error('QA driver did not earn its clean Personal Best.');
session.reset();
session.cycleGhostMode(); session.cycleGhostMode();
let replayIndex = 0;
const reset = () => { controls.release(); session.reset(); replayIndex = 0; };
const controls = bindDriverControls((shortcut) => {
  if (shortcut === 'reset') reset();
  if (shortcut === 'camera') session.toggleCamera();
  if (shortcut === 'line') session.toggleRacingLine();
  if (shortcut === 'ghost') session.cycleGhostMode();
  if (shortcut === 'mode') { controls.release(); session.setPracticeMode(session.getSnapshot().mode === 'Time Trial' ? 'Corner Drill' : 'Time Trial'); }
}, () => { session.releaseDriverInputs(); });
const audio = createKartAudio();
window.addEventListener('pagehide', () => audio.dispose());
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, {
  getAudioState: () => audio.getState(),
  onToggleAudio: () => { void audio.toggle(); },
  onAudioVolume: (volume) => audio.setVolume(volume),
  onReset: reset,
  onToggleMode: () => { controls.release(); session.setPracticeMode(session.getSnapshot().mode === 'Time Trial' ? 'Corner Drill' : 'Time Trial'); },
  onSelectDrillTarget: (target) => { controls.release(); session.selectDrillTarget(target); },
  onToggleCamera: () => { session.toggleCamera(); },
  onCycleGhostMode: () => { session.cycleGhostMode(); },
  onToggleRacingLine: () => { session.toggleRacingLine(); },
  onSetCameraSettings: (settings) => { session.setCameraSettings(settings); },
  onSetKeyboardAssistance: (settings) => { session.setKeyboardAssistance(settings); },
  getDrivingBindings: () => controls.getBindings(),
  onSetDrivingBinding: (action, code) => controls.setBinding(action, code),
  onRestoreDrivingBindings: () => controls.restoreDefaultBindings(),
  onExportData: () => session.exportTrainingDataJson(),
  onImportData: (json) => { session.importTrainingDataJson(json); },
});
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot());
function render() {
  const snapshot = session.getSnapshot();
  audio.update(snapshot, document.hasFocus() && !document.hidden && !document.querySelector('dialog[open]'));
  hud.update(snapshot); renderer.render(snapshot);
  return snapshot;
}
const harness = {
  step(ticks: number, analog: DriverInput = {}) {
    for (let tick = 0; tick < ticks; tick++) {
      const keys = controls.readKeys();
      if (!controls.isPaused()) session.step(1 / 120, { ...analog, keys });
    }
    const snapshot = render();
    return { kart: snapshot.kart, lap: snapshot.lap, ghost: snapshot.ghost, keys: controls.readKeys() };
  },
  diagnostics() { return { ...renderer.getDiagnostics(), audio: audio.getState() }; },
  read() { return { snapshot: session.getSnapshot(), diagnostics: renderer.getDiagnostics(), audio: audio.getState() }; },
  drive(ticks: number, speedScale = 0.9) {
    for (let tick = 0; tick < ticks; tick++) session.step(1 / 120, analogReferenceCommand(session.getSnapshot(), speedScale));
    return render();
  },
  ghost(mode: GhostMode) {
    for (let index = 0; index < 4 && session.getSnapshot().ghost.mode !== mode; index++) session.cycleGhostMode();
    return render();
  },
  reset() { reset(); return render(); },
  release() { controls.release(); },
  view(mode: CameraMode) { if (session.getSnapshot().camera.mode !== mode) session.toggleCamera(); return render(); },
  settings(settings: Partial<CameraSettings>) { session.setCameraSettings(settings); return render(); },
  // QA replay sends the retained public input tape; it never assigns simulation state.
  replay(ticks: number) {
    for (let tick = 0; tick < ticks; tick++) session.step(1 / 120, replay.commands[replayIndex++ % replay.commands.length]);
    return render();
  },
  drill(target: DrillTargetId) {
    const entry = session.selectDrillTarget(target);
    let index = replay.frames.findIndex((frame) => frame.kart.position.x === entry.kart.position.x && frame.kart.position.z === entry.kart.position.z);
    let snapshot = entry;
    while (index >= 0 && index < replay.commands.length && snapshot.drill.lastExecutionCard?.runNumber !== entry.drill.runNumber) snapshot = session.step(1 / 120, replay.commands[index++]);
    return render();
  },
};
declare global { interface Window { recoveryHarness: typeof harness; } }
window.recoveryHarness = harness;
render();
