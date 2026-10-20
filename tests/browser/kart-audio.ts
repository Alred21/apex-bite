import { createKartAudio } from '../../src/audio/kart-audio';
import { createSimulationSession } from '../../src/simulation/session';

const audio = createKartAudio();
const session = createSimulationSession();
const result = document.querySelector<HTMLElement>('#result')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const rows: Array<Record<string, string | number>> = [];
const disposeButton = document.querySelector<HTMLButtonElement>('#dispose')!;
function record(name: string): void {
  const state = audio.getState();
  rows.push({ name, status: state.status, volume: state.volume, outputRms: Number(state.outputLevel.toFixed(6)), contacts: session.getSnapshot().kart.barrierContactCount });
  result.textContent = JSON.stringify(rows, null, 2);
}
function settle(milliseconds = 160): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
window.addEventListener('blur', () => { audio.setActive(false); record('Actual window blur'); });
window.addEventListener('focus', () => { audio.setActive(true); record('Actual window focus'); });
document.addEventListener('visibilitychange', () => {
  audio.setActive(!document.hidden); record(document.hidden ? 'Actual hidden page' : 'Actual visible page');
});
window.addEventListener('pagehide', () => audio.dispose());
button.addEventListener('click', async () => {
  button.disabled = true;
  record('Before gesture activation');
  await audio.toggle();
  audio.setVolume(0.35);
  // Run ordinary inputs through the actual session; no internal state injection.
  for (let i = 0; i < 30; i++) session.step(1 / 120, { throttle: 1, steer: 0 });
  audio.update(session.getSnapshot(), true);
  await settle(); record('Activated electric motor');
  audio.setVolume(0.1); await settle(); record('Volume 10 percent');
  audio.setVolume(0.5); await settle(); record('Volume 50 percent');
  await audio.toggle(); await settle(); record('Muted');
  await audio.toggle(); await settle(); record('Unmuted');
  audio.setActive(false); await settle(); record('Paused');
  audio.setActive(true); await settle(); record('Resumed');
  // Reverse uses speed magnitude and Brake/Reverse motor load, with no negative pitch.
  session.reset();
  for (let i = 0; i < 900 && session.getSnapshot().kart.speedMps > 0; i++) session.step(1 / 120, { brake: 1 });
  session.step(1 / 120, { brake: 0 });
  for (let i = 0; i < 180; i++) session.step(1 / 120, { brake: 1 });
  audio.update(session.getSnapshot(), true);
  await settle(); record('Reverse recovery electric motor');
  for (let i = 0; i < 25; i++) {
    session.reset(); audio.reset(); audio.update(session.getSnapshot(), true);
  }
  await settle(); record('After 25 resets');
  // Drive into a Barrier, then repeatedly observe the same contact snapshot.
  for (let i = 0; i < 200 && session.getSnapshot().kart.barrierContactCount === 0; i++) {
    session.step(1 / 120, { throttle: 1, steer: -1 });
    audio.update(session.getSnapshot(), true);
  }
  record('Barrier contact reached');
  for (let i = 0; i < 50; i++) audio.update(session.getSnapshot(), true);
  await settle(300); record('Same contact observed 50 times');
  record('Ready for actual focus check');
  disposeButton.disabled = false;
  button.textContent = 'Checks complete — test focus or dispose';
});
disposeButton.addEventListener('click', async () => {
  audio.dispose(); audio.dispose(); await settle(); record('Disposed twice safely');
  disposeButton.disabled = true;
});
