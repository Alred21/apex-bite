import { createSimulationSession } from '../../src/simulation/session';
import { createHudView } from '../../src/ui/hud';
import { bindDriverControls } from '../../src/ui/driver-controls';
import { createCircuitRenderer } from '../../src/render/scene';

// Actual browser adapter, HUD and Kart presentation driven by normal Session inputs.
const session = createSimulationSession({ referenceReplay: true });
const controls = bindDriverControls((shortcut) => {
  if (shortcut === 'reset') { controls.release(); session.reset(); }
}, () => { session.releaseDriverInputs(); });
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, {
  onReset: () => { controls.release(); hud.update(session.reset()); },
});
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot());
const harness = {
  step(ticks: number) {
    for (let tick = 0; tick < ticks; tick++) {
      const keys = controls.readKeys();
      if (!controls.isPaused()) session.step(1 / 120, { keys });
    }
    const snapshot = session.getSnapshot();
    hud.update(snapshot);
    renderer.render(snapshot);
    return { kart: snapshot.kart, lap: snapshot.lap, keys: controls.readKeys() };
  },
  release() { controls.release(); },
};
declare global { interface Window { recoveryHarness: typeof harness; } }
window.recoveryHarness = harness;
harness.step(0);
