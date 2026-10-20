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

/** A small authored family, with independent entry, clipping station and exit.
 * Stations stay in Circuit coordinates; execution decides feasibility and time.
 */
export interface TurnPlacement {
  apexShiftMeters: number;
  entryWidthUse: number;
  apexWidthUse: number;
  exitWidthUse: number;
}

export function placeTurn(circuit: CircuitData, source: Vector2D[], turnNumber: number, placement: TurnPlacement): Vector2D[] {
  const turn = circuit.turns[turnNumber - 1];
  const inside = turn.direction === 'Right' ? 1 : -1;
  const start = turn.entryDistanceMeters - 12, finish = turn.exitDistanceMeters + 13;
  const sourceOffset = (distance: number) => {
    const index = Math.max(0, Math.min(source.length - 1, Math.round(distance / circuit.totalLengthMeters * source.length)));
    const sample = circuit.samples[index], point = source[index];
    return (point.x - sample.center.x) * sample.normal.x + (point.z - sample.center.z) * sample.normal.z;
  };
  const available = turn.typicalWidthMeters * 0.5 - 0.95;
  const nodes = [
    [start, sourceOffset(start)],
    [turn.entryDistanceMeters - 3, -inside * available * placement.entryWidthUse],
    [turn.apexDistanceMeters + placement.apexShiftMeters, inside * available * placement.apexWidthUse],
    [turn.exitDistanceMeters + 4, -inside * available * placement.exitWidthUse],
    [finish, sourceOffset(finish)],
  ];
  return source.map((point, index) => {
    const sample = circuit.samples[index], distance = sample.distanceMeters;
    if (distance <= start || distance >= finish) return { ...point };
    const segment = nodes.findIndex((node, i) => i < nodes.length - 1 && distance >= node[0] && distance <= nodes[i + 1][0]);
    if (segment < 0) return { ...point };
    const [a, b] = [nodes[segment], nodes[segment + 1]];
    const t = (distance - a[0]) / (b[0] - a[0]);
    const blend = t * t * t * (10 + t * (-15 + 6 * t));
    const offset = a[1] + (b[1] - a[1]) * blend;
    return { x: sample.center.x + sample.normal.x * offset, z: sample.center.z + sample.normal.z * offset };
  });
}
