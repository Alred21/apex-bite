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
    const index = ((Math.round(distance / circuit.totalLengthMeters * source.length) % source.length) + source.length) % source.length;
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
    const sample = circuit.samples[index];
    const relative = ((sample.distanceMeters - turn.apexDistanceMeters + circuit.totalLengthMeters * 1.5) % circuit.totalLengthMeters) - circuit.totalLengthMeters * 0.5;
    const distance = turn.apexDistanceMeters + relative;
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

export interface CircuitPlacement { entryWidthUse: number; apexWidthUse: number; apexShiftMeters: number; }

/** Adjacent Turns share one setup station: it is simultaneously an exit and
 * the next entry, so a linked sequence cannot request incompatible positions.
 * Periodic monotone Hermite interpolation avoids overshooting the corridor. */
export function placeCircuit(circuit: CircuitData, controls: CircuitPlacement[]): Vector2D[] {
  const length = circuit.totalLengthMeters, count = circuit.turns.length;
  const nodes = circuit.turns.flatMap((turn, index) => {
    const previous = circuit.turns[(index - 1 + count) % count], next = circuit.turns[(index + 1) % count];
    const before = previous.apexDistanceMeters - (index === 0 ? length : 0);
    const after = next.apexDistanceMeters + (index === count - 1 ? length : 0);
    const setup = (before + turn.apexDistanceMeters) * 0.5;
    // 0.65m reserves Kart half-width + Barrier half-thickness + 8cm before
    // the definitive swept-envelope validation, rather than a 0.95m hard cap.
    const limit = turn.typicalWidthMeters * 0.5 - 0.65, inside = turn.direction === 'Right' ? 1 : -1;
    return [
      { station: (setup + length) % length, offset: -inside * limit * controls[index].entryWidthUse },
      { station: turn.apexDistanceMeters + Math.min(controls[index].apexShiftMeters, (after - turn.apexDistanceMeters) * 0.32), offset: inside * limit * controls[index].apexWidthUse },
    ];
  }).sort((a, b) => a.station - b.station);
  const slope = (a: number, b: number, before: number, after: number) => a * b <= 0 ? 0 : (before + after) / (before / a + after / b);
  return circuit.samples.map((sample) => {
    let index = nodes.findIndex((node, index) => sample.distanceMeters >= node.station && (index === nodes.length - 1 || sample.distanceMeters < nodes[index + 1].station));
    let station = sample.distanceMeters;
    if (index < 0) { index = nodes.length - 1; station += length; }
    const a = nodes[index], b = nodes[(index + 1) % nodes.length];
    const previous = nodes[(index - 1 + nodes.length) % nodes.length], next = nodes[(index + 2) % nodes.length];
    const end = b.station + (index === nodes.length - 1 ? length : 0);
    const start = a.station - ((a.station - previous.station + length) % length);
    const finish = end + ((next.station - b.station + length) % length);
    const span = end - a.station, delta = (b.offset - a.offset) / span;
    const firstSlope = slope((a.offset - previous.offset) / (a.station - start), delta, a.station - start, span);
    const finalSlope = slope(delta, (next.offset - b.offset) / (finish - end), span, finish - end);
    const t = (station - a.station) / span, t2 = t * t, t3 = t2 * t;
    const offset = (2 * t3 - 3 * t2 + 1) * a.offset + (t3 - 2 * t2 + t) * span * firstSlope + (-2 * t3 + 3 * t2) * b.offset + (t3 - t2) * span * finalSlope;
    return { x: sample.center.x + sample.normal.x * offset, z: sample.center.z + sample.normal.z * offset };
  });
}

/** Bounded geometric smoothing of a chosen placement. This lowers local
 * curvature variation; only executed whole-lap time decides if it is useful. */
export function relaxPlacement(circuit: CircuitData, source: Vector2D[], passes: number, maxChangeMeters: number): Vector2D[] {
  const count = source.length;
  const energy = (a: Vector2D, b: Vector2D, c: Vector2D) => {
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
    const ab = Math.hypot(ax, az), bc = Math.hypot(bx, bz);
    const curvature = 2 * (ax * bz - az * bx) / Math.max(1e-9, ab * bc * Math.hypot(c.x - a.x, c.z - a.z));
    return curvature * curvature * (ab + bc) * 0.5;
  };
  let positions = source.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass++) positions = positions.map((point, index) => {
    const sample = circuit.samples[index];
    const a = positions[(index - 2 + count) % count], b = positions[(index - 1 + count) % count];
    const c = positions[(index + 1) % count], d = positions[(index + 2) % count];
    const localEnergy = (delta: number) => {
      const moved = { x: point.x + sample.normal.x * delta, z: point.z + sample.normal.z * delta };
      return energy(a, b, moved) + energy(b, moved, c) + energy(moved, c, d);
    };
    const gradient = (localEnergy(0.01) - localEnergy(-0.01)) / 0.02;
    const offset = (point.x - sample.center.x) * sample.normal.x + (point.z - sample.center.z) * sample.normal.z;
    const origin = (source[index].x - sample.center.x) * sample.normal.x + (source[index].z - sample.center.z) * sample.normal.z;
    const limit = sample.widthMeters * 0.5 - 0.65;
    const low = Math.max(-limit, origin - maxChangeMeters), high = Math.min(limit, origin + maxChangeMeters);
    const next = Math.max(low, Math.min(high, offset - Math.max(-0.01, Math.min(0.01, gradient * 0.005))));
    return { x: sample.center.x + sample.normal.x * next, z: sample.center.z + sample.normal.z * next };
  });
  return positions;
}
