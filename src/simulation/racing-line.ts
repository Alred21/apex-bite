import { referenceMetadata } from './reference-metadata';
import { buildReferenceLap } from './reference-lap';
import type { CircuitData, RacingLineCue, RacingLineState } from './types';

/** Display cues over one immutable, physically executed Reference Lap. */
export function evaluateLiveRacingLine(circuit: CircuitData, kartDistanceMeters: number, kartSpeedMps: number, visible: boolean): RacingLineState {
  const reference = buildReferenceLap(circuit);
  return {
    visible, benchmarkLapSeconds: reference.lapSeconds,
    reference: referenceMetadata(circuit, reference),
    points: reference.points.map((point) => {
      const ahead = ((point.distanceMeters - kartDistanceMeters) % circuit.totalLengthMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters;
      const requiredDeceleration = (kartSpeedMps ** 2 - point.targetSpeedMps ** 2) / (2 * Math.max(1.2, ahead));
      const liveCue: RacingLineCue = ahead < 28 && requiredDeceleration > 1.5 ? 'Red' : ahead < 28 && requiredDeceleration > 0.45 ? 'Yellow' : 'Green';
      return { ...point, position: { ...point.position }, liveCue };
    }),
  };
}
