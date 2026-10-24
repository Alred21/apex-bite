import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../../src/simulation/session';
import { createCircuitRenderer } from '../../src/render/scene';
import { analogReferenceCommand } from '../analog-driver';
import type { CameraMode, DriverInput, GhostMode, RacingLineDisplayMode } from '../../src/simulation/types';

const session = createSimulationSession({ referenceReplay: true });
const reference = session.getReferenceReplay();
session.setTimeTrialLapLimit(null);
session.setCameraSettings({ motionStrength: 0 });
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot());
renderer.setGraphicsQuality('Balanced');
const state = document.querySelector<HTMLOutputElement>('#state')!;
const guidance = document.querySelector<HTMLOutputElement>('#guidance')!;
const counts = document.querySelector<HTMLOutputElement>('#counts')!;
let playing = false, commandIndex = 0, accumulator = 0, last = performance.now();
function scenario(name: string): void {
  session.reset(); playing = false; commandIndex = 0; accumulator = 0;
  if (name === 'fast' || name === 'slow') {
    for (let tick = 0; tick < 300 && session.getSnapshot().kart.lapDistanceMeters < 6; tick++) {
      session.step(FIXED_TIMESTEP_SECONDS, name === 'fast' ? { throttle: 1 } : { brake: 0.4 });
    }
  } else if (name === 'recover') {
    for (let tick = 0; tick < 120; tick++) session.step(FIXED_TIMESTEP_SECONDS, { brake: 0.5, steer: -0.7 });
  } else if (name === 'stopped') {
    for (let tick = 0; tick < 300; tick++) session.step(FIXED_TIMESTEP_SECONDS, analogReferenceCommand(session.getSnapshot(), 0.2));
    for (let tick = 0; tick < 300; tick++) session.step(FIXED_TIMESTEP_SECONDS, { ...analogReferenceCommand(session.getSnapshot(), 0), brake: 1, throttle: 0 });
  } else if (name === 'reverse') {
    for (let tick = 0; tick < 360; tick++) session.step(FIXED_TIMESTEP_SECONDS, { brake: 1 });
    if (name === 'reverse') {
      session.step(FIXED_TIMESTEP_SECONDS, {});
      for (let tick = 0; tick < 120; tick++) session.step(FIXED_TIMESTEP_SECONDS, { brake: 1 });
    }
  }
}
for (const name of ['fast', 'slow', 'recover', 'reverse', 'stopped']) document.querySelector(`#${name}`)!.addEventListener('click', () => scenario(name));
document.querySelector('#camera')!.addEventListener('click', () => session.toggleCamera());
document.querySelector('#mode')!.addEventListener('click', () => session.toggleRacingLine());
document.querySelector('#play')!.addEventListener('click', () => { scenario('reference'); playing = true; });
document.querySelector('#pause')!.addEventListener('click', () => { playing = !playing; });
function ghostMode(mode: GhostMode): void {
  for (let index = 0; index < 4 && session.getSnapshot().ghost.mode !== mode; index++) session.cycleGhostMode();
}
let personalBestTape: DriverInput[] | null = null;
function prepareGhostPersonalBest(): void {
  if (personalBestTape) return;
  const source = createSimulationSession({ referenceReplay: true });
  const tape: DriverInput[] = [];
  for (let tick = 0; tick < 9500 && source.getSnapshot().lap.personalBestSeconds === null; tick++) {
    const command = analogReferenceCommand(source.getSnapshot(), 0.9);
    tape.push(command); source.step(FIXED_TIMESTEP_SECONDS, command);
  }
  if (source.getSnapshot().lap.personalBestSeconds === null) throw new Error('Ghost review driver did not earn a Clean Lap.');
  session.importTrainingDataJson(source.exportTrainingDataJson()); personalBestTape = tape;
}
function ghostScenario(name: string): void {
  if (name === 'personal-best' || name === 'both') prepareGhostPersonalBest();
  scenario('reference');
  const ticks = name === 'personal-best' || name === 'both' ? 1200 : 240;
  for (let tick = 0; tick < ticks; tick++) session.step(FIXED_TIMESTEP_SECONDS,
    name === 'personal-best' || name === 'both' ? personalBestTape![tick] : reference.commands[tick]);
  if (name === 'partial' || name === 'separated' || name === 'side') {
    const extraTicks = name === 'separated' ? 240 : 35;
    for (let tick = 0; tick < extraTicks; tick++) session.step(FIXED_TIMESTEP_SECONDS, { brake: 1, steer: name === 'side' ? -0.8 : 0 });
  }
  if (name === 'reverse') {
    scenario('reference');
    const slowest = reference.frames.reduce((best, frame, index) => frame.kart.speedMps < reference.frames[best].kart.speedMps ? index : best, 0);
    for (let tick = 0; tick < slowest; tick++) session.step(FIXED_TIMESTEP_SECONDS, reference.commands[tick]);
    for (let tick = 0; tick < 600 && session.getSnapshot().kart.speedMps > 0; tick++) session.step(FIXED_TIMESTEP_SECONDS, { brake: 0.45 });
    // A faster reference can leave the overlap region while the player stops.
    // Hold still until it naturally laps and approaches, then engage reverse.
    ghostMode('Reference Lap');
    for (let tick = 0; tick < reference.commands.length; tick++) {
      const { kart, ghost } = session.getSnapshot(), pose = ghost.trackRecordPose;
      if (pose && Math.hypot(pose.position.x - kart.position.x, pose.position.z - kart.position.z) < 1.5) break;
      session.step(FIXED_TIMESTEP_SECONDS, { brake: 1 });
    }
    session.step(FIXED_TIMESTEP_SECONDS, {});
    session.step(FIXED_TIMESTEP_SECONDS, { brake: 1 });
  }
  ghostMode(name === 'personal-best' ? 'Personal Best' : name === 'both' ? 'Both' : 'Reference Lap');
}

function capturePixels(): ImageData {
  renderer.render(session.getSnapshot());
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
  const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
  const context = copy.getContext('2d')!; context.drawImage(canvas, 0, 0);
  return context.getImageData(0, 0, copy.width, copy.height);
}
function frame(now: number): void {
  const elapsed = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) {
    accumulator += elapsed;
    while (accumulator >= FIXED_TIMESTEP_SECONDS) {
      session.step(FIXED_TIMESTEP_SECONDS, reference.commands[commandIndex++ % reference.commands.length]);
      accumulator -= FIXED_TIMESTEP_SECONDS;
    }
  }
  const snapshot = session.getSnapshot(); renderer.render(snapshot);
  state.textContent = `${snapshot.camera.mode} · ${snapshot.racingLine.displayMode} · ${snapshot.kart.speedKph.toFixed(1)} km/h ${snapshot.kart.driveDirection} · station ${snapshot.kart.lapDistanceMeters.toFixed(3)} m`;
  guidance.textContent = `${snapshot.racingLine.guidance.action}: ${snapshot.racingLine.guidance.reason}`;
  const nearby = snapshot.racingLine.points.filter(point => (point.distanceMeters - snapshot.kart.lapDistanceMeters + snapshot.circuit.totalLengthMeters) % snapshot.circuit.totalLengthMeters < 20);
  counts.textContent = `Next 20 m: ${nearby.filter(point => point.liveCue === 'Red').length} Red / ${nearby.filter(point => point.liveCue === 'Yellow').length} Yellow / ${nearby.filter(point => point.liveCue === 'Green').length} Green · ${renderer.getDiagnostics().calls} render calls`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// QA-only controls act through the approved public Session and production renderer.
Object.assign(window, { guidanceReview: {
  scenario, ghostScenario, ghostMode, capturePixels,
  ghostStep(ticks: number, command: DriverInput = { brake: 1 }) {
    for (let tick = 0; tick < ticks; tick++) session.step(FIXED_TIMESTEP_SECONDS, command);
  },
  portableRecords() { return session.exportTrainingDataJson(); },
  importRecords(json: string) { session.importTrainingDataJson(json); },
  view(mode: CameraMode) { if (session.getSnapshot().camera.mode !== mode) session.toggleCamera(); },
  mode(mode: RacingLineDisplayMode) { for (let i = 0; i < 3 && session.getSnapshot().racingLine.displayMode !== mode; i++) session.toggleRacingLine(); },
  read() { return { snapshot: session.getSnapshot(), diagnostics: renderer.getDiagnostics() }; },
} });
