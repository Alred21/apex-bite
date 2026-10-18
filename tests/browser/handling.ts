import { createSimulationSession } from '../../src/simulation/session';
import { createCircuitRenderer } from '../../src/render/scene';
import type { KeyboardInputState } from '../../src/simulation/types';

const output = document.querySelector<HTMLPreElement>('#result')!;
const session = createSimulationSession();
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#preview')!, session.getSnapshot());
renderer.render(session.getSnapshot());
document.querySelector<HTMLButtonElement>('#run')!.addEventListener('click', () => {
  const results = [];
  for (const target of ['T1', 'T3', 'T8'] as const) {
    let snapshot = session.selectDrillTarget(target);
    let maximumSpeedKph = 0, maximumFreeLateralAccel = 0, maximumImpactHeadingChange = 0;
    let finite = true;
    const turnRight = target !== 'T3';
    for (let tick = 0; tick < 240; tick++) {
      const previousHeading = snapshot.kart.headingRad;
      const keys: Partial<KeyboardInputState> = { up: tick < 40 || tick > 130, down: tick >= 40 && tick < 100, right: turnRight && tick >= 35 && tick < 145, left: !turnRight && tick >= 35 && tick < 145 };
      snapshot = session.step(1 / 120, { keys });
      maximumSpeedKph = Math.max(maximumSpeedKph, snapshot.kart.speedKph);
      if (!snapshot.kart.barrierContact) maximumFreeLateralAccel = Math.max(maximumFreeLateralAccel, Math.abs(snapshot.kart.lateralAccelMps2));
      else maximumImpactHeadingChange = Math.max(maximumImpactHeadingChange, Math.abs(snapshot.kart.headingRad - previousHeading));
      finite &&= [snapshot.kart.position.x, snapshot.kart.position.z, snapshot.kart.headingRad, snapshot.kart.speedMps].every(Number.isFinite);
    }
    results.push({ target, finite, maximumSpeedKph, maximumFreeLateralAccel, maximumImpactHeadingChange, barrierContacts: snapshot.kart.barrierContactCount });
  }
  const passed = results.every((result) => result.finite && result.maximumSpeedKph <= 45.00001 && result.maximumFreeLateralAccel <= 10.50001 && result.maximumImpactHeadingChange < 0.1);
  output.textContent = `${passed ? 'PASS' : 'FAIL'}\n${JSON.stringify(results, null, 2)}\nFull-lap reference validation follows corrected Circuit geometry in ticket #13.`;
  renderer.render(session.getSnapshot());
});
