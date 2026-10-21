import type { Vector2D } from './types';

export interface PathMetric {
  lengthMeters: number;
  distance(fromStationMeters: number, toStationMeters: number): number;
  stationAhead(fromStationMeters: number, pathMeters: number): number;
}
const metrics = new WeakMap<Vector2D[], PathMetric>();

/** The path's physical arc length and Circuit stations are different measures.
 * Lookahead uses arc length; shared timing/progress coordinates remain stations. */
export function pathMetric(circuitLength: number, positions: Vector2D[]): PathMetric {
  const existing = metrics.get(positions);
  if (existing) return existing;
  const count = positions.length, arc = [0];
  for (let index = 0; index < count; index++) {
    const a = positions[index], b = positions[(index + 1) % count];
    arc.push(arc[index] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const lengthMeters = arc[count];
  const at = (station: number) => {
    const fractional = (((station % circuitLength) + circuitLength) % circuitLength) / circuitLength * count;
    const index = Math.floor(fractional), ratio = fractional - index;
    return arc[index] + (arc[index + 1] - arc[index]) * ratio;
  };
  const result: PathMetric = {
    lengthMeters,
    distance(from, to) { return (at(to) - at(from) + lengthMeters) % lengthMeters; },
    stationAhead(from, meters) {
      const target = ((at(from) + meters) % lengthMeters + lengthMeters) % lengthMeters;
      let low = 0, high = count - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (arc[middle] <= target) low = middle; else high = middle - 1;
      }
      const ratio = (target - arc[low]) / Math.max(1e-9, arc[low + 1] - arc[low]);
      return (low + ratio) / count * circuitLength;
    },
  };
  metrics.set(positions, result);
  return result;
}
