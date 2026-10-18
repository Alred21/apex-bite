import { wrapAngleRad } from './planar-math';
import {
  CircuitData,
  RacingLineCue,
  RacingLinePoint,
  RacingLineState,
  Vector2D,
} from './types';

const MAX_SPEED_MPS = 45.0 / 3.6; // 12.5 m/s
const TARGET_BENCHMARK_SECONDS = 24.499;

interface CachedBaseline {
  basePoints: Array<{
    index: number;
    distanceMeters: number;
    progress: number;
    position: Vector2D;
    headingRad: number;
    curvature: number;
    targetSpeedMps: number;
    targetSpeedKph: number;
    benchmarkTimeSeconds: number;
    defaultCue: RacingLineCue;
  }>;
  benchmarkLapSeconds: number;
}

let cachedBaseline: CachedBaseline | null = null;

function buildRacingLineBaseline(circuit: CircuitData): CachedBaseline {
  if (cachedBaseline) {
    return cachedBaseline;
  }

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

  // 2. Compute segment lengths, headings, and racing-line curvature
  const segLengths = new Float64Array(n);
  const headings = new Float64Array(n);
  const curvatures = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const cur = positions[i];
    const next = positions[(i + 1) % n];
    segLengths[i] = Math.max(0.05, Math.hypot(next.x - cur.x, next.z - cur.z));

    const prev3 = positions[(i - 3 + n) % n];
    const next3 = positions[(i + 3) % n];
    headings[i] = Math.atan2(next.z - cur.z, next.x - cur.x);

    const h1 = Math.atan2(cur.z - prev3.z, cur.x - prev3.x);
    const h2 = Math.atan2(next3.z - cur.z, next3.x - cur.x);
    const dH = wrapAngleRad(h2 - h1);
    const span = Math.max(0.5, Math.hypot(next3.x - prev3.x, next3.z - prev3.z));
    curvatures[i] = dH / span;
  }

  // 3. Binary-search lateral grip parameter so forward-backward profile integrates to 24.499s
  const solveSpeedProfile = (latGripMps2: number): {
    speeds: Float64Array;
    lapSeconds: number;
  } => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const absK = Math.max(1e-4, Math.abs(curvatures[i]));
      const cornerLimit = Math.sqrt(latGripMps2 / absK);
      v[i] = Math.min(MAX_SPEED_MPS, Math.max(5.2, cornerLimit));
    }

    // Two closed-loop backward (braking) + forward (electric acceleration) passes
    const maxBrakeDecel = 7.4;
    for (let loop = 0; loop < 2; loop++) {
      for (let i = n - 1; i >= 0; i--) {
        const nextIdx = (i + 1) % n;
        const maxEntry = Math.sqrt(v[nextIdx] * v[nextIdx] + 2 * maxBrakeDecel * segLengths[i]);
        if (maxEntry < v[i]) v[i] = maxEntry;
      }
      for (let i = 0; i < n; i++) {
        const nextIdx = (i + 1) % n;
        const speedRatio = v[i] / MAX_SPEED_MPS;
        const accel = 6.2 * Math.max(0.28, 1 - 0.65 * Math.pow(speedRatio, 1.8));
        const maxExit = Math.min(
          MAX_SPEED_MPS,
          Math.sqrt(v[i] * v[i] + 2 * accel * segLengths[i]),
        );
        if (maxExit < v[nextIdx]) v[nextIdx] = maxExit;
      }
    }

    let totalTime = 0;
    for (let i = 0; i < n; i++) {
      const nextIdx = (i + 1) % n;
      const avgV = 0.5 * (v[i] + v[nextIdx]);
      totalTime += segLengths[i] / avgV;
    }

    return { speeds: v, lapSeconds: totalTime };
  };

  let lowGrip = 3.0;
  let highGrip = 36.0;
  let bestProfile = solveSpeedProfile(10.0);
  for (let iter = 0; iter < 24; iter++) {
    const mid = 0.5 * (lowGrip + highGrip);
    bestProfile = solveSpeedProfile(mid);
    if (bestProfile.lapSeconds > TARGET_BENCHMARK_SECONDS) {
      lowGrip = mid;
    } else {
      highGrip = mid;
    }
  }

  // Compute cumulative benchmark timestamp at each sample
  let accumTime = 0;
  const basePoints = samples.map((s, i) => {
    const nextIdx = (i + 1) % n;
    const vCur = bestProfile.speeds[i];
    const vNext = bestProfile.speeds[nextIdx];
    const segDs = segLengths[i];
    const dv = (vNext - vCur) / Math.max(0.05, segDs / vCur);
    const defaultCue: RacingLineCue =
      dv < -1.6 ? 'Red' : vCur < MAX_SPEED_MPS - 0.7 && dv < 0.8 ? 'Yellow' : 'Green';

    const pointTime = accumTime;
    accumTime += segDs / (0.5 * (vCur + vNext));

    return {
      index: i,
      distanceMeters: s.distanceMeters,
      progress: s.progress,
      position: positions[i],
      headingRad: headings[i],
      curvature: curvatures[i],
      targetSpeedMps: vCur,
      targetSpeedKph: vCur * 3.6,
      benchmarkTimeSeconds: pointTime,
      defaultCue,
    };
  });

  cachedBaseline = {
    basePoints,
    benchmarkLapSeconds: accumTime,
  };
  return cachedBaseline;
}

export function evaluateLiveRacingLine(
  circuit: CircuitData,
  kartDistanceMeters: number,
  kartSpeedMps: number,
  visible: boolean,
): RacingLineState {
  const baseline = buildRacingLineBaseline(circuit);
  const totalLen = circuit.totalLengthMeters;

  const points: RacingLinePoint[] = baseline.basePoints.map((bp) => {
    // Forward distance from Kart to this Racing Line point around the closed loop
    const distAhead =
      ((bp.distanceMeters - kartDistanceMeters) % totalLen + totalLen) % totalLen;

    let liveCue: RacingLineCue = bp.defaultCue;

    if (distAhead <= 28.0) {
      if (kartSpeedMps < bp.targetSpeedMps - 0.75) {
        // Kart is already slower than the optimal speed at this point -> Full Throttle!
        liveCue = 'Green';
      } else {
        const speedExcess = kartSpeedMps - bp.targetSpeedMps;
        const effectiveDist = Math.max(1.2, distAhead);
        const requiredDecel =
          speedExcess > 0
            ? (kartSpeedMps * kartSpeedMps - bp.targetSpeedMps * bp.targetSpeedMps) /
              (2 * effectiveDist)
            : 0;

        if (requiredDecel > 1.85) {
          liveCue = 'Red';
        } else if (
          requiredDecel > 0.65 ||
          (bp.targetSpeedMps < MAX_SPEED_MPS - 0.6 && speedExcess > 0.15 && distAhead < 12.0)
        ) {
          liveCue = 'Yellow';
        } else {
          liveCue = 'Green';
        }
      }
    }

    return {
      index: bp.index,
      distanceMeters: bp.distanceMeters,
      progress: bp.progress,
      position: { ...bp.position },
      headingRad: bp.headingRad,
      targetSpeedMps: bp.targetSpeedMps,
      targetSpeedKph: bp.targetSpeedKph,
      benchmarkTimeSeconds: bp.benchmarkTimeSeconds,
      liveCue,
    };
  });

  return {
    visible,
    benchmarkLapSeconds: baseline.benchmarkLapSeconds,
    points,
  };
}
