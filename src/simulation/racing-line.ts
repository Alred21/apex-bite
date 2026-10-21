import { referenceMetadata } from './reference-metadata';
import { pathMetric } from './path-distance';
import { buildReferenceLap } from './reference-lap';
import { wrapAngleRad } from './planar-math';
import { FIXED_TIMESTEP_SECONDS, MAX_TIRE_ACCEL_MPS2 } from './kart-parameters';
import type { CircuitData, KartState, RacingLineCue, RacingLineDisplayMode, RacingLineState } from './types';

const displayGeometry = new WeakMap<CircuitData, {
  reference: ReturnType<typeof buildReferenceLap>;
  corners: boolean[];
  positions: KartState['position'][];
  metric: ReturnType<typeof pathMetric>;
}>();

/** Display cues over one immutable, physically executed Reference Lap. */
export function evaluateLiveRacingLine(circuit: CircuitData, kart: KartState, displayMode: RacingLineDisplayMode): RacingLineState {
  const reference = buildReferenceLap(circuit);
  let geometry = displayGeometry.get(circuit);
  if (!geometry || geometry.reference !== reference) {
    const positions = reference.points.map(point => point.position);
    geometry = {
      reference, positions, metric: pathMetric(circuit.totalLengthMeters, positions),
      corners: reference.points.map(point => circuit.turns.some(turn => {
        const start = turn.entryDistanceMeters - 8;
        const span = (turn.exitDistanceMeters - turn.entryDistanceMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters + 11;
        return (point.distanceMeters - start + circuit.totalLengthMeters) % circuit.totalLengthMeters <= span;
      })),
    };
    displayGeometry.set(circuit, geometry);
  }
  const count = reference.points.length;
  const fractional = kart.lapProgress * count;
  const currentIndex = Math.floor(fractional) % count;
  const current = reference.points[currentIndex];
  const next = reference.points[(currentIndex + 1) % count];
  const ratio = fractional - Math.floor(fractional);
  const lineX = current.position.x + (next.position.x - current.position.x) * ratio;
  const lineZ = current.position.z + (next.position.z - current.position.z) * ratio;
  const heading = current.headingRad + wrapAngleRad(next.headingRad - current.headingRad) * ratio;
  const positionError = Math.hypot(kart.position.x - lineX, kart.position.z - lineZ);
  const headingError = Math.abs(wrapAngleRad(kart.headingRad - heading));
  const reversing = kart.driveDirection === 'Reverse' || kart.speedMps < -0.05;
  const recovering = reversing || positionError > 0.8 || headingError > 0.35 || kart.barrierContact || kart.slipRatio > 0.5;
  const speed = Math.max(0, kart.speedMps);
  // Reference lookup stays in Circuit stations. Braking distances instead follow
  // the executed path: a wider Turn or a Late Apex changes actual travel length.
  const remainingGrip = Math.sqrt(Math.max(0.1, MAX_TIRE_ACCEL_MPS2 ** 2 - kart.lateralAccelMps2 ** 2));
  const deceleration = Math.max(0.8, Math.min(MAX_TIRE_ACCEL_MPS2 * 0.43, remainingGrip) * 0.65);
  const reactionDistance = speed * 0.28 + 0.8;
  const horizon = Math.min(geometry.metric.lengthMeters * 0.45, Math.max(18, speed ** 2 / (2 * deceleration) + reactionDistance + 6));
  const ahead: Array<{ index: number; allowedSquared: number }> = [];
  let allowedSquared = (current.targetSpeedMps + (next.targetSpeedMps - current.targetSpeedMps) * ratio) ** 2;
  let limitingPoint = current;
  for (let offset = 1; offset < count; offset++) {
    const index = (currentIndex + offset) % count;
    const distance = geometry.metric.distance(kart.lapDistanceMeters, reference.points[index].distanceMeters);
    if (distance > horizon) break;
    const point = reference.points[index];
    const arrivalBudget = point.targetSpeedMps ** 2 + 2 * deceleration * Math.max(0, distance - reactionDistance);
    ahead.push({ index, allowedSquared: arrivalBudget });
    if (arrivalBudget < allowedSquared) {
      allowedSquared = arrivalBudget;
      limitingPoint = point;
    }
  }
  // A section includes its own speed demand and the next constraints. A single
  // backwards pass propagates advance braking warning up to the approach;
  // recovery's low HUD target does not paint a false speed warning onto the line.
  const pointCues = new Map<number, RacingLineCue>();
  let futureBudget = Infinity;
  for (let index = ahead.length - 1; index >= 0; index--) {
    const section = ahead[index];
    futureBudget = Math.min(futureBudget, section.allowedSquared);
    const allowed = Math.sqrt(futureBudget);
    const cue: RacingLineCue = reversing ? 'Yellow' : speed > allowed + 0.45 ? 'Red'
      : recovering || speed >= allowed - 0.5 ? 'Yellow' : 'Green';
    pointCues.set(section.index, cue);
  }
  let allowedSpeed = Math.sqrt(allowedSquared);
  if (recovering) allowedSpeed = Math.min(allowedSpeed, 2.2);
  if (reversing) allowedSpeed = 0;
  const plannedCommand = reference.commands[Math.min(reference.commands.length - 1,
    Math.floor(current.benchmarkTimeSeconds / FIXED_TIMESTEP_SECONDS))];
  const plannedAcceleration = plannedCommand.throttle > 0.15 && plannedCommand.brake < 0.04;
  const cue: RacingLineCue = reversing ? 'Yellow' : speed > allowedSpeed + 0.45 ? 'Red'
    : recovering ? 'Yellow'
    : speed < allowedSpeed - 0.5 || (plannedAcceleration && speed < allowedSpeed + 0.1) ? 'Green' : 'Yellow';
  const upcomingTurn = circuit.turns.find(turn => limitingPoint.distanceMeters >= turn.entryDistanceMeters - 3 && limitingPoint.distanceMeters <= turn.exitDistanceMeters + 3);
  const turnLabel = upcomingTurn ? `Turn ${upcomingTurn.number}` : 'the Turns';
  return {
    visible: displayMode !== 'Off', displayMode, benchmarkLapSeconds: reference.lapSeconds,
    guidance: {
      cue, action: cue === 'Red' ? 'Brake' : cue === 'Yellow' ? 'Coast' : 'Accelerate',
      reason: reversing ? 'Reverse recovery · release brake, then accelerate to move forward'
        : recovering ? 'Recover alignment before accelerating'
        : cue === 'Red' ? `Slow for ${turnLabel} ahead` : cue === 'Yellow' ? `Prepare for ${turnLabel} ahead` : 'Room to build speed progressively',
      targetSpeedKph: allowedSpeed * 3.6,
    },
    reference: referenceMetadata(circuit, reference),
    points: reference.points.map((point, index) => ({
      ...point, position: { ...point.position }, liveCue: reversing ? 'Yellow' : pointCues.get(index) ?? 'Green',
      displayed: displayMode === 'Full' || (displayMode === 'Corners Only' && geometry.corners[index]),
    })),
  };
}
