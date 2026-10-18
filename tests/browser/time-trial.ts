// Test-only harness: the visible driver sends ordinary inputs through the public
// SimulationSession API, then renders actual production HUD/results and scene.
// It never changes internal state or bypasses lap crossings.
import { createSimulationSession } from '../../src/simulation/session';
import { createHudView } from '../../src/ui/hud';
import { createCircuitRenderer } from '../../src/render/scene';

const session = createSimulationSession();
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot());
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, {
  onSelectTimeTrialLapLimit: (limit) => { session.setTimeTrialLapLimit(limit); render(); },
  onReset: () => { session.reset(); render(); },
  onToggleMode: () => { session.setPracticeMode(session.getSnapshot().mode === 'Time Trial' ? 'Corner Drill' : 'Time Trial'); render(); },
  onSelectDrillTarget: (target) => { session.selectDrillTarget(target); render(); },
  onToggleCamera: () => { session.toggleCamera(); render(); },
});
function render(): void {
  const snapshot = session.getSnapshot();
  renderer.render(snapshot);
  hud.update(snapshot);
}
render();
document.querySelector('#run')!.addEventListener('click', () => {
  let snapshot = session.getSnapshot();
  // A conservative public-input controller; not a player assist or Reference Lap.
  for (let i = 0; i < 65000 && snapshot.timeTrial.status !== 'Finished'; i++) {
    const points = snapshot.racingLine.points;
    const n = points.length;
    const index = Math.floor(snapshot.kart.lapProgress * n) % n;
    const look = points[(index + 2) % n];
    const center = snapshot.circuit.samples[(index + 2) % n].center;
    const heading = Math.atan2(look.position.z * 0.75 + center.z * 0.25 - snapshot.kart.position.z, look.position.x * 0.75 + center.x * 0.25 - snapshot.kart.position.x);
    const error = Math.atan2(Math.sin(heading - snapshot.kart.headingRad), Math.cos(heading - snapshot.kart.headingRad));
    const target = Math.min(points[index].targetSpeedMps, look.targetSpeedMps, points[(index + 8) % n].targetSpeedMps) * 0.96;
    const speedError = target - snapshot.kart.speedMps;
    snapshot = session.step(1 / 120, {
      steer: Math.max(-1, Math.min(1, error * 3.2)),
      throttle: speedError > -0.1 ? 1 : 0,
      brake: speedError < -0.25 ? Math.min(0.85, -speedError * 0.55) : 0,
    });
  }
  render();
});
