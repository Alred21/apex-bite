/** CLI review only: binary keys from public snapshots. No game auto-driving feature. */
import { createSimulationSession } from '../src/simulation/session';
import type { DrillTargetId, DriverInput, SessionSnapshot } from '../src/simulation/types';

function keyboardCommand(snapshot: SessionSnapshot): DriverInput {
  const { kart, racingLine, circuit } = snapshot;
  const points = racingLine.points, count = points.length, length = circuit.totalLengthMeters;
  const lookahead = 0.9 + kart.speedMps * 0.15;
  const index = (kart.lapDistanceMeters + lookahead) % length / length * count;
  const i = Math.floor(index), j = (i + 1) % count, ratio = index - i;
  const dx = points[i].position.x + (points[j].position.x - points[i].position.x) * ratio - kart.position.x;
  const dz = points[i].position.z + (points[j].position.z - points[i].position.z) * ratio - kart.position.z;
  let alpha = Math.atan2(dz, dx) - kart.headingRad;
  while (alpha > Math.PI) alpha -= Math.PI * 2;
  while (alpha < -Math.PI) alpha += Math.PI * 2;
  const desiredAngle = Math.atan2(2 * 1.06 * Math.sin(alpha), Math.hypot(dx, dz));
  let targetSpeed = 12.5;
  for (let distance = 0; distance <= kart.speedMps ** 2 / 5.5 + 3; distance += 0.5) {
    const point = points[Math.floor((kart.lapDistanceMeters + distance) % length / length * count) % count];
    targetSpeed = Math.min(targetSpeed, Math.sqrt((point.targetSpeedMps * 0.8) ** 2 + 5.5 * Math.max(0, distance - 0.9)));
  }
  const error = targetSpeed - kart.speedMps;
  return { keys: {
    up: error > 0.05, down: error < -0.35,
    right: desiredAngle > 0 && kart.steerAngleRad < desiredAngle + 0.003,
    left: desiredAngle < 0 && kart.steerAngleRad > desiredAngle - 0.003,
  } };
}

type Scenario = 'Controlled' | 'Brief wrong-direction correction' | 'Full throttle without braking';
function reviewDrill(id: DrillTargetId, scenario: Scenario) {
  const session = createSimulationSession();
  session.setPracticeMode('Corner Drill');
  session.selectDrillTarget(id);
  let snapshot = session.getSnapshot(), command = keyboardCommand(snapshot);
  let ticks = 0, peakContacts = 0, peakSpeedKph = 0, steeringChanges = 0;
  const firstDirection = snapshot.circuit.turns[snapshot.drill.target.turns[0] - 1].direction;
  for (; ticks < 12000 && !snapshot.drill.lastExecutionCard; ticks++) {
    // 100 ms decisions are retained through twelve actual 120 Hz player ticks.
    if (ticks % 12 === 0) {
      const previous = command.keys;
      command = keyboardCommand(snapshot);
      if (scenario === 'Full throttle without braking') command.keys = { ...command.keys, up: true, down: false };
      if (scenario === 'Brief wrong-direction correction' && ticks === 36) {
        command.keys = { ...command.keys, left: firstDirection === 'Right', right: firstDirection === 'Left' };
      }
      if (previous?.left !== command.keys?.left || previous?.right !== command.keys?.right) steeringChanges++;
    }
    snapshot = session.step(1 / 120, command);
    peakSpeedKph = Math.max(peakSpeedKph, snapshot.kart.speedKph);
    peakContacts = Math.max(peakContacts, snapshot.kart.barrierContactCount);
    if (scenario === 'Full throttle without braking' && snapshot.kart.barrierContact) break;
  }
  const card = snapshot.drill.lastExecutionCard;
  return {
    target: id, scenario, completed: Boolean(card), clean: card?.isClean ?? false,
    seconds: card?.segmentTimeSeconds ?? null, contacts: peakContacts, peakSpeedKph,
    steeringChanges, simulatedSeconds: snapshot.elapsedSeconds,
  };
}

const session = createSimulationSession();
const scenarios: Scenario[] = ['Controlled', 'Brief wrong-direction correction', 'Full throttle without braking'];
const report = scenarios.flatMap((scenario) => session.getSnapshot().drill.availableTargets.map((target) => reviewDrill(target.id, scenario)));
const fullLap = createSimulationSession();
fullLap.setTimeTrialLapLimit(1);
let lapSnapshot = fullLap.getSnapshot(), lapCommand = keyboardCommand(lapSnapshot);
for (let tick = 0; tick < 15000 && lapSnapshot.timeTrial.status !== 'Finished'; tick++) {
  if (tick % 12 === 0) lapCommand = keyboardCommand(lapSnapshot);
  lapSnapshot = fullLap.step(1 / 120, lapCommand);
}
console.log(JSON.stringify({
  method: 'CLI binary-key review at 100ms decision intervals through the public player Session; no hidden game auto-driving and no analog steering/pedals.',
  controlledSpeedScale: 0.8,
  caveat: 'Automated driving exercises inputs and clearance; this is not a human usability study or surveyed Circuit geometry.',
  circuitMeters: session.getSnapshot().circuit.totalLengthMeters,
  maximumSpeedKph: 45,
  revision: session.getSnapshot().trainingData.revision,
  referenceLapSeconds: session.getSnapshot().racingLine.benchmarkLapSeconds,
  fullLap: { status: lapSnapshot.timeTrial.status, laps: lapSnapshot.timeTrial.completedLaps, contacts: lapSnapshot.kart.barrierContactCount },
  report,
}, null, 2));
