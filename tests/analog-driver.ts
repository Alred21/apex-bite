import type { DriverInput, SessionSnapshot } from '../src/simulation/types';

interface DriverVariation {
  lateralOffsetMeters?: number;
  steeringAdjustment?: number;
}

/** Test-only controller, independent of production Reference Lap driving helpers. */
export function analogReferenceCommand(
  snapshot: SessionSnapshot,
  speedScale: number,
  { lateralOffsetMeters = 0, steeringAdjustment = 0 }: DriverVariation = {},
): DriverInput {
  const points = snapshot.racingLine.points, n = points.length, length = snapshot.circuit.totalLengthMeters;
  const lookahead = 0.85 + snapshot.kart.speedMps * 0.11;
  const fractionalIndex = (snapshot.kart.lapDistanceMeters + lookahead) % length / length * n;
  const i = Math.floor(fractionalIndex), j = (i + 1) % n, ratio = fractionalIndex - i;
  const heading = points[i].headingRad;
  const x = points[i].position.x + (points[j].position.x - points[i].position.x) * ratio - Math.sin(heading) * lateralOffsetMeters - snapshot.kart.position.x;
  const z = points[i].position.z + (points[j].position.z - points[i].position.z) * ratio + Math.cos(heading) * lateralOffsetMeters - snapshot.kart.position.z;
  const headingError = Math.atan2(z, x) - snapshot.kart.headingRad;
  const alpha = Math.atan2(Math.sin(headingError), Math.cos(headingError));
  const steer = Math.max(-1, Math.min(1, Math.atan2(2 * 1.06 * Math.sin(alpha), Math.hypot(x, z)) / 0.46 + steeringAdjustment));
  let targetSpeed = 12.5;
  for (let distance = 0; distance <= snapshot.kart.speedMps ** 2 / 6.4 + 3; distance += 0.65) {
    const point = points[Math.floor((snapshot.kart.lapDistanceMeters + distance) % length / length * n) % n];
    targetSpeed = Math.min(targetSpeed, Math.sqrt((point.targetSpeedMps * speedScale) ** 2 + 6 * Math.max(0, distance - 0.8)));
  }
  const error = targetSpeed - snapshot.kart.speedMps;
  return {
    steer,
    throttle: error > -0.08 ? Math.min(1, Math.max(0, 0.37 + error * 1.7)) : 0,
    brake: error < -0.2 ? Math.min(1, (-error - 0.1) * 0.8) : 0,
  };
}
