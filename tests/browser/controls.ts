import { createSimulationSession } from '../../src/simulation/session';
import { createHudView } from '../../src/ui/hud';
import { bindDriverControls } from '../../src/ui/driver-controls';
import type { DriverInput } from '../../src/simulation/types';

const session = createSimulationSession({ referenceReplay: true });
const controls = bindDriverControls((shortcut) => {
  if (shortcut === 'reset') session.reset();
  if (shortcut === 'mode') session.setPracticeMode(session.getSnapshot().mode === 'Time Trial' ? 'Corner Drill' : 'Time Trial');
}, () => { session.releaseDriverInputs(); });
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, {
  getDrivingBindings: () => controls.getBindings(),
  onSetDrivingBinding: (action, code) => controls.setBinding(action, code),
  onRestoreDrivingBindings: () => controls.restoreDefaultBindings(),
  onReset: () => { controls.release(); session.reset(); },
  onExportData: () => session.exportTrainingDataJson(),
});
const harness = {
  step(ticks: number, analog: DriverInput = {}) {
    for (let tick = 0; tick < ticks; tick++) {
      if (!controls.isPaused()) session.step(1 / 120, { ...analog, keys: controls.readKeys() });
    }
    const snapshot = session.getSnapshot();
    hud.update(snapshot);
    return { kart: snapshot.kart, mode: snapshot.mode };
  },
};
declare global { interface Window { controlsHarness: typeof harness; } }
window.controlsHarness = harness;
harness.step(0);
