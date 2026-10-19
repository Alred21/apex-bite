import type { SimulationSession } from '../src/simulation/session';

/** An ordinary analog test driver observing only public Session snapshots. */
export function driveReference(session: SimulationSession, maxSteps: number, speedScale = 1, stopOnLapNumber?: number) {
  let snap = session.getSnapshot();
  for (let tick = 0; tick < maxSteps; tick++) {
    const points = snap.racingLine.points, n = points.length, length = snap.circuit.totalLengthMeters;
    const lookahead = 0.85 + snap.kart.speedMps * 0.11;
    const fractionalIndex = (snap.kart.lapDistanceMeters + lookahead) % length / length * n;
    const i = Math.floor(fractionalIndex), j = (i + 1) % n, ratio = fractionalIndex - i;
    const x = points[i].position.x + (points[j].position.x - points[i].position.x) * ratio - snap.kart.position.x;
    const z = points[i].position.z + (points[j].position.z - points[i].position.z) * ratio - snap.kart.position.z;
    let alpha = Math.atan2(z, x) - snap.kart.headingRad;
    while (alpha > Math.PI) alpha -= Math.PI * 2;
    while (alpha < -Math.PI) alpha += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, Math.atan2(2 * 1.06 * Math.sin(alpha), Math.hypot(x, z)) / 0.46));
    let targetSpeed = 12.5;
    for (let distance = 0; distance <= snap.kart.speedMps ** 2 / 6.4 + 3; distance += 0.65) {
      const point = points[Math.floor((snap.kart.lapDistanceMeters + distance) % length / length * n) % n];
      targetSpeed = Math.min(targetSpeed, Math.sqrt((point.targetSpeedMps * speedScale) ** 2 + 6 * Math.max(0, distance - 0.8)));
    }
    const error = targetSpeed - snap.kart.speedMps;
    snap = session.step(1 / 120, {
      steer,
      throttle: error > -0.08 ? Math.min(1, Math.max(0, 0.37 + error * 1.7)) : 0,
      brake: error < -0.2 ? Math.min(1, (-error - 0.1) * 0.8) : 0,
    });
    if (stopOnLapNumber !== undefined && snap.lap.lapNumber >= stopOnLapNumber) break;
    if (snap.timeTrial.status === 'Finished') break;
  }
  return snap;
}
