import type { SimulationSession } from '../src/simulation/session';
import { FIXED_TIMESTEP_SECONDS } from '../src/simulation/session';

/** Ordinary analog driver; variations are visible inputs, never injected Kart state. */
export function driveDrillVariant(session: SimulationSession, speedScale: number, turn2Offset = 0, steeringOscillation = 0) {
  let snapshot = session.getSnapshot();
  const runNumber = snapshot.drill.runNumber;
  for (let tick = 0; tick < 8000; tick++) {
    const points = snapshot.racingLine.points, n = points.length, length = snapshot.circuit.totalLengthMeters;
    const lookahead = 0.85 + snapshot.kart.speedMps * 0.11;
    const fractionalIndex = (snapshot.kart.lapDistanceMeters + lookahead) % length / length * n;
    const i = Math.floor(fractionalIndex), j = (i + 1) % n, ratio = fractionalIndex - i;
    const distanceToTurn2 = snapshot.kart.lapDistanceMeters - snapshot.circuit.turns[1].apexDistanceMeters;
    const offset = turn2Offset * Math.exp(-((distanceToTurn2 / 6) ** 2));
    const heading = points[i].headingRad;
    const x = points[i].position.x + (points[j].position.x - points[i].position.x) * ratio - Math.sin(heading) * offset - snapshot.kart.position.x;
    const z = points[i].position.z + (points[j].position.z - points[i].position.z) * ratio + Math.cos(heading) * offset - snapshot.kart.position.z;
    const alpha = Math.atan2(Math.sin(Math.atan2(z, x) - snapshot.kart.headingRad), Math.cos(Math.atan2(z, x) - snapshot.kart.headingRad));
    const steer = Math.max(-1, Math.min(1, Math.atan2(2 * 1.06 * Math.sin(alpha), Math.hypot(x, z)) / 0.46 + steeringOscillation * Math.sin(tick * Math.PI / 12)));
    let targetSpeed = 12.5;
    for (let distance = 0; distance <= snapshot.kart.speedMps ** 2 / 6.4 + 3; distance += 0.65) {
      const point = points[Math.floor((snapshot.kart.lapDistanceMeters + distance) % length / length * n) % n];
      targetSpeed = Math.min(targetSpeed, Math.sqrt((point.targetSpeedMps * speedScale) ** 2 + 6 * Math.max(0, distance - 0.8)));
    }
    const error = targetSpeed - snapshot.kart.speedMps;
    snapshot = session.step(FIXED_TIMESTEP_SECONDS, {
      steer, throttle: error > -0.08 ? Math.min(1, Math.max(0, 0.37 + error * 1.7)) : 0,
      brake: error < -0.2 ? Math.min(1, (-error - 0.1) * 0.8) : 0,
    });
    if (snapshot.drill.lastExecutionCard?.runNumber === runNumber) return snapshot.drill.lastExecutionCard;
  }
  throw new Error('Driver did not complete the Corner Drill.');
}
