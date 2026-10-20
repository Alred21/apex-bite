import { referenceMetadata } from './reference-metadata';
import { buildReferenceLap } from './reference-lap';
import { wrapAngleRad } from './planar-math';
import { FIXED_TIMESTEP_SECONDS, MAX_TIRE_ACCEL_MPS2 } from './kart-parameters';
import type { CircuitData, KartState, RacingLineCue, RacingLineDisplayMode, RacingLineState } from './types';

const cornerMasks = new WeakMap<CircuitData, boolean[]>();

/** Display cues over one immutable, physically executed Reference Lap. */
export function evaluateLiveRacingLine(circuit: CircuitData, kart: KartState, displayMode: RacingLineDisplayMode): RacingLineState {
  const reference = buildReferenceLap(circuit);
  let cornerMask = cornerMasks.get(circuit);
  if (!cornerMask) {
    cornerMask = reference.points.map((point) => circuit.turns.some((turn) => {
      const start = turn.entryDistanceMeters - 8;
      const span = (turn.exitDistanceMeters - turn.entryDistanceMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters + 11;
      const offset = (point.distanceMeters - start + circuit.totalLengthMeters) % circuit.totalLengthMeters;
      return offset <= span;
    }));
    cornerMasks.set(circuit, cornerMask);
  }
  const count = reference.points.length;
  const fractional = kart.lapProgress * count;
  const current = reference.points[Math.floor(fractional) % count];
  const next = reference.points[(Math.floor(fractional) + 1) % count];
  const ratio = fractional - Math.floor(fractional);
  const lineX = current.position.x + (next.position.x - current.position.x) * ratio;
  const lineZ = current.position.z + (next.position.z - current.position.z) * ratio;
  const heading = current.headingRad + wrapAngleRad(next.headingRad - current.headingRad) * ratio;
  const positionError = Math.hypot(kart.position.x - lineX, kart.position.z - lineZ);
  const headingError = Math.abs(wrapAngleRad(kart.headingRad - heading));
  const recovering = positionError > 0.8 || headingError > 0.35 || kart.barrierContact || kart.slipRatio > 0.5;
  const poseAllowance = Math.max(0.65, 1 - positionError * 0.16 - headingError * 0.45);
  // Rear-only braking and cornering share grip. Reserve time to react and use a
  // conservative fraction of available braking rather than waiting at an apex.
  const remainingGrip = Math.sqrt(Math.max(0.1, MAX_TIRE_ACCEL_MPS2 ** 2 - kart.lateralAccelMps2 ** 2));
  const deceleration = Math.max(0.8, Math.min(MAX_TIRE_ACCEL_MPS2 * 0.43, remainingGrip) * 0.65);
  const reactionDistance = kart.speedMps * 0.28 + 0.8;
  const horizon = Math.min(circuit.totalLengthMeters * 0.45, Math.max(18, kart.speedMps ** 2 / (2 * deceleration) + reactionDistance + 6));
  let allowedSpeed = current.targetSpeedMps * poseAllowance;
  let limitingPoint = current;
  let limitingDistance = 0;
  for (const point of reference.points) {
    const distance = (point.distanceMeters - kart.lapDistanceMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters;
    if (distance > horizon) continue;
    const achievable = Math.sqrt((point.targetSpeedMps * poseAllowance) ** 2 + 2 * deceleration * Math.max(0, distance - reactionDistance));
    if (achievable < allowedSpeed) {
      allowedSpeed = achievable;
      limitingPoint = point;
      limitingDistance = distance;
    }
  }
  if (recovering) allowedSpeed = Math.min(allowedSpeed, 2.2);
  const plannedCommand = reference.commands[Math.min(reference.commands.length - 1,
    Math.floor(current.benchmarkTimeSeconds / FIXED_TIMESTEP_SECONDS))];
  // At the achieved local speed, the retained pedal command distinguishes an
  // accelerating straight from coasting. Pose and future braking still gate it.
  const plannedAcceleration = plannedCommand.throttle > 0.15 && plannedCommand.brake < 0.04;
  const cue: RacingLineCue = kart.speedMps > allowedSpeed + 0.45 ? 'Red'
    : recovering ? 'Yellow'
    : kart.speedMps < allowedSpeed - 0.5 || (plannedAcceleration && kart.speedMps < allowedSpeed + 0.1) ? 'Green' : 'Yellow';
  const upcomingTurn = circuit.turns.find((turn) => limitingPoint.distanceMeters >= turn.entryDistanceMeters - 3 && limitingPoint.distanceMeters <= turn.exitDistanceMeters + 3);
  const turnLabel = upcomingTurn ? `Turn ${upcomingTurn.number}` : 'the Turns';
  return {
    visible: displayMode !== 'Off', displayMode, benchmarkLapSeconds: reference.lapSeconds,
    guidance: {
      cue, action: cue === 'Red' ? 'Brake' : cue === 'Yellow' ? 'Coast' : 'Accelerate',
      reason: recovering ? 'Recover alignment before accelerating' : cue === 'Red' ? `Slow for ${turnLabel} ahead` : cue === 'Yellow' ? `Prepare for ${turnLabel} ahead` : 'Room to build speed progressively',
      targetSpeedKph: allowedSpeed * 3.6,
    },
    reference: referenceMetadata(circuit, reference),
    points: reference.points.map((point, index) => {
      const ahead = ((point.distanceMeters - kart.lapDistanceMeters) % circuit.totalLengthMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters;
      const requiredDeceleration = (kart.speedMps ** 2 - (point.targetSpeedMps * poseAllowance) ** 2) / (2 * Math.max(0.5, ahead - reactionDistance));
      const liveCue: RacingLineCue = ahead <= Math.max(7, limitingDistance + 1) || (recovering && ahead < horizon) ? cue
        : ahead < horizon && requiredDeceleration > deceleration * 0.8 ? 'Red'
        : ahead < horizon && requiredDeceleration > deceleration * 0.25 ? 'Yellow' : 'Green';
      const displayed = displayMode === 'Full' || (displayMode === 'Corners Only' && cornerMask![index]);
      return { ...point, position: { ...point.position }, liveCue, displayed };
    }),
  };
}
