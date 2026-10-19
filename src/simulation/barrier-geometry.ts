import type { CircuitData, Vector2D } from './types';

export const BARRIER_HALF_THICKNESS_METERS = 0.12;

export interface BarrierSegment {
  a: Vector2D;
  b: Vector2D;
  center: Vector2D;
  yaw: number;
  length: number;
  red: boolean;
}

/** Shared physical wall chords, including the 4% overlap at wall joins. */
export function buildBarrierSegments(circuit: CircuitData): BarrierSegment[] {
  const segments: BarrierSegment[] = [];
  for (const side of ['leftBarrier', 'rightBarrier'] as const) {
    for (let i = 0; i < circuit.samples.length; i += 2) {
      const start = circuit.samples[i][side];
      const end = circuit.samples[(i + 2) % circuit.samples.length][side];
      const dx = end.x - start.x, dz = end.z - start.z;
      segments.push({
        a: { x: start.x - dx * 0.02, z: start.z - dz * 0.02 },
        b: { x: end.x + dx * 0.02, z: end.z + dz * 0.02 },
        center: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
        yaw: Math.atan2(dx, dz),
        length: Math.max(0.2, Math.hypot(dx, dz)) * 1.04,
        red: Math.floor(i / 4) % 2 === 0,
      });
    }
  }
  return segments;
}
