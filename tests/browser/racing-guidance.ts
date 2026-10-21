import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../../src/simulation/session';
import { createCircuitRenderer } from '../../src/render/scene';
import { analogReferenceCommand } from '../analog-driver';
import type { CameraMode, RacingLineDisplayMode } from '../../src/simulation/types';

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
      session.step(FIXED_TIMESTEP_SECONDS, name === 'fast' ? { throttle: 1 } : { brake: 0.3 });
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
  scenario,
  view(mode: CameraMode) { if (session.getSnapshot().camera.mode !== mode) session.toggleCamera(); },
  mode(mode: RacingLineDisplayMode) { for (let i = 0; i < 3 && session.getSnapshot().racingLine.displayMode !== mode; i++) session.toggleRacingLine(); },
  read() { return { snapshot: session.getSnapshot(), diagnostics: renderer.getDiagnostics() }; },
} });
