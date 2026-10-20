import { createSimulationSession } from '../../src/simulation/session';
import { createHudView } from '../../src/ui/hud';
import { bindDriverControls } from '../../src/ui/driver-controls';

// Actual native dialogs, HUD and driver event adapter; no replacement collaborators.
const session = createSimulationSession({ referenceReplay: true });
const controls = bindDriverControls(() => {}, () => { session.releaseDriverInputs(); });
const hud = createHudView(document.querySelector<HTMLElement>('#hud')!, {
  onSetKeyboardAssistance: (settings) => hud.update(session.setKeyboardAssistance(settings)),
  onExportData: () => session.exportTrainingDataJson(),
  onReset: () => hud.update(session.reset()),
});
hud.update(session.getSnapshot());
const output = document.querySelector<HTMLElement>('#result')!;
const click = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector)!;
  element.focus();
  element.click();
};
const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const keys = () => {
  const codes = ['KeyW', 'KeyA', 'KeyD'];
  for (const code of codes) document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  const observed = controls.readKeys();
  for (const code of codes) document.activeElement!.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  return observed;
};
document.querySelector('#run')!.addEventListener('click', async () => {
  const checks: Array<{ scenario: string; passed: boolean; activeElement: string; observed?: unknown }> = [];
  const record = (scenario: string, passed: boolean, observed?: unknown) => checks.push({ scenario, passed, activeElement: document.activeElement?.id || document.activeElement?.tagName || '', observed });
  const resumes = (scenario: string) => {
    const observed = keys();
    record(scenario, observed.up === true && observed.left === true && observed.right === true, observed);
  };
  click('#hud-btn-camera-settings');
  const sensitivity = document.querySelector<HTMLInputElement>('#hud-steering-sensitivity')!;
  sensitivity.value = '120';
  sensitivity.dispatchEvent(new Event('input', { bubbles: true }));
  record('sensitivity applies', session.getSnapshot().keyboardAssistance.steeringSensitivity === 1.2);
  record('settings pauses keys', controls.isPaused() && !keys().up);
  click('#hud-camera-dialog button[type=submit]');
  await settle();
  resumes('Driving & View close resumes W/A/D');
  click('#hud-btn-data');
  document.querySelector<HTMLTextAreaElement>('#hud-data-textarea')!.focus();
  const beforeTyping = document.querySelector<HTMLTextAreaElement>('#hud-data-textarea')!.value;
  record('data typing pauses keys', controls.isPaused() && !keys().up && document.querySelector<HTMLTextAreaElement>('#hud-data-textarea')!.value === beforeTyping);
  click('#hud-data-dialog button[type=submit]');
  await settle();
  resumes('Data close resumes W/A/D');
  click('#hud-btn-camera-settings');
  document.querySelector<HTMLDialogElement>('#hud-camera-dialog')!.requestClose();
  await settle();
  resumes('settings cancel resumes W/A/D');
  session.setTimeTrialLapLimit(1);
  for (const command of session.getReferenceReplay().commands) session.step(1 / 120, command);
  hud.update(session.getSnapshot());
  record('genuine results pauses keys', session.getSnapshot().timeTrial.status === 'Finished' && controls.isPaused() && !keys().up);
  click('#hud-results-close');
  await settle();
  resumes('results View Circuit resumes keys');
  click('#hud-btn-results');
  click('#hud-results-restart');
  await settle();
  resumes('results restart resumes keys');
  record('restart resets results', session.getSnapshot().timeTrial.completedLaps.length === 0);
  output.textContent = JSON.stringify({ passed: checks.every((check) => check.passed), checks }, null, 2);
});
