import { createSimulationSession } from '../../src/simulation/session';
import { createCircuitRenderer } from '../../src/render/scene';

const session = createSimulationSession({ referenceReplay: true });
const replay = session.getReferenceReplay();
const output = document.querySelector<HTMLPreElement>('#result')!;
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#preview')!, session.getSnapshot());
renderer.render(session.getSnapshot());
document.querySelector<HTMLButtonElement>('#run')!.addEventListener('click', () => {
  session.reset();
  let maxGhostErrorMeters = 0;
  for (let tick = 0; tick < 1600; tick++) {
    const snapshot = session.step(1 / 120, replay.commands[tick]);
    const ghost = snapshot.ghost.trackRecordPose!;
    maxGhostErrorMeters = Math.max(maxGhostErrorMeters, Math.hypot(snapshot.kart.position.x - ghost.position.x, snapshot.kart.position.z - ghost.position.z));
  }
  const snapshot = session.getSnapshot();
  renderer.render(snapshot);
  output.textContent = `${maxGhostErrorMeters < 1e-6 && snapshot.kart.barrierContactCount === 0 ? 'PASS' : 'FAIL'}\n${JSON.stringify({ lapSeconds: replay.lapSeconds, realWorldBenchmarkSeconds: snapshot.racingLine.reference.realWorldBenchmarkSeconds, maxGhostErrorMeters, barrierContacts: snapshot.kart.barrierContactCount, timeDeltaSeconds: snapshot.lap.timeDeltaSeconds, currentTurn: snapshot.kart.currentTurn, referenceClosure: replay.closure }, null, 2)}\nGold Ghost Kart overlaps the player; stable Racing Line follows the observed traversal.`;
});
