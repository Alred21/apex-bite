import type { CircuitData, Vector2D } from './types';

import { CORNER_COMPLEXES } from './corner-complexes';

/** One smooth whole-complex displacement, with no per-Turn apex pins. */
export function offsetComplex(circuit: CircuitData, source: Vector2D[], complexIndex: number, amplitude: number, phaseMeters: number): Vector2D[] {
  const complex = CORNER_COMPLEXES[complexIndex];
  const first = circuit.turns[complex.turns[0] - 1], last = circuit.turns[complex.turns[complex.turns.length - 1] - 1];
  const start = Math.max(0, first.entryDistanceMeters - 5), end = Math.min(circuit.totalLengthMeters, last.exitDistanceMeters + 5);
  const halfSpan = (end - start) * 0.5, center = (start + end) * 0.5 + phaseMeters;
  return source.map((point, index) => {
    const sample = circuit.samples[index], relative = (sample.distanceMeters - center) / halfSpan;
    const envelope = Math.abs(relative) >= 1 ? 0 : (1 + Math.cos(relative * Math.PI)) * 0.5;
    const currentOffset = (point.x - sample.center.x) * sample.normal.x + (point.z - sample.center.z) * sample.normal.z;
    const limit = Math.min(0.9, sample.widthMeters * 0.5 - 1.1);
    const nextOffset = Math.max(-limit, Math.min(limit, currentOffset + amplitude * envelope));
    return { x: sample.center.x + sample.normal.x * nextOffset, z: sample.center.z + sample.normal.z * nextOffset };
  });
}
