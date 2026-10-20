import type { CircuitData, Vector2D } from './types';

/** Retained only as a comparison proposal; no old timing/grip calibration survives. */
export function buildPriorLineProposal(circuit: CircuitData): Vector2D[] {
  const samples = circuit.samples;
  const n = samples.length;
  const totalLen = circuit.totalLengthMeters;

  // 1. Construct outside-inside-outside lateral offset array across the variable-width corridor
  const rawOffsets = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    // Default slight outside bias opposite to upcoming curvature
    let offset = -Math.sign(s.curvature) * Math.min(1.1, Math.abs(s.curvature) * 6.5);

    // Pull strongly to each Turn's ideal apex point, and swing outside on entry & exit
    for (const turn of circuit.turns) {
      let dDist = s.distanceMeters - turn.apexDistanceMeters;
      if (dDist > totalLen * 0.5) dDist -= totalLen;
      if (dDist < -totalLen * 0.5) dDist += totalLen;

      const insideSign = turn.direction === 'Right' ? 1 : -1;
      const insideMax = s.widthMeters * 0.5 - 0.68;
      const outsideMax = -(s.widthMeters * 0.5 - 0.78) * insideSign;

      if (Math.abs(dDist) < 11.0) {
        // Cosine bell curve peaking at the Turn apex
        const u = dDist / 11.0; // -1..+1
        if (Math.abs(u) <= 0.55) {
          const apexBlend = Math.cos((u / 0.55) * (Math.PI * 0.5));
          offset = offset * (1 - apexBlend) + insideSign * insideMax * apexBlend;
        } else {
          const outBlend = Math.sin(((Math.abs(u) - 0.55) / 0.45) * Math.PI);
          offset = offset * (1 - 0.65 * outBlend) + outsideMax * (0.65 * outBlend);
        }
      }
    }

    const limit = s.widthMeters * 0.5 - 0.52;
    rawOffsets[i] = Math.max(-limit, Math.min(limit, offset));
  }

  // Smooth offsets while keeping apexes tight
  const smoothedOffsets = new Float64Array(n);
  for (let pass = 0; pass < 3; pass++) {
    const src = pass === 0 ? rawOffsets : smoothedOffsets.slice();
    for (let i = 0; i < n; i++) {
      const prev2 = src[(i - 2 + n) % n];
      const prev1 = src[(i - 1 + n) % n];
      const cur = src[i];
      const next1 = src[(i + 1) % n];
      const next2 = src[(i + 2) % n];
      smoothedOffsets[i] = 0.1 * prev2 + 0.22 * prev1 + 0.36 * cur + 0.22 * next1 + 0.1 * next2;
    }
    // Re-pin exact Turn apexes so Apex Proximity is exact
    for (const turn of circuit.turns) {
      const apexIdx =
        Math.round((turn.apexDistanceMeters / totalLen) * n) % n;
      const sApex = samples[apexIdx];
      const insideSign = turn.direction === 'Right' ? 1 : -1;
      smoothedOffsets[apexIdx] = insideSign * (sApex.widthMeters * 0.5 - 0.68);
    }
  }

  const positions: Vector2D[] = samples.map((s, i) => ({
    x: s.center.x + s.normal.x * smoothedOffsets[i],
    z: s.center.z + s.normal.z * smoothedOffsets[i],
  }));

  return positions;
}
