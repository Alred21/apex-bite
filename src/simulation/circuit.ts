export { wrapAngleRad } from './planar-math';
import {
  CircuitData,
  CircuitSample,
  SectorNumber,
  TurnDirection,
  TurnMetadata,
  TurnNumber,
  Vector2D,
} from './types';

interface ControlWaypoint {
  x: number;
  z: number;
  width: number;
  turnAnchor?: TurnNumber;
}

/**
 * Control waypoints traced from the K1 Speed Toronto 11-turn clockwise circuit layout.
 * Coordinates are in unscaled meters (initially normalized to 245m before correcting the unsurveyed corridor geometry).
 * Top-down plane: +x is East (right), +z is South (down), -z is North (up).
 */
const RAW_WAYPOINTS: ControlWaypoint[] = [
  // Start / Finish line on bottom-left straight heading up-left
  { x: -34.0, z: 10.0, width: 5.8 },
  // Approach to Turn 1
  { x: -40.0, z: 1.0, width: 5.8 },
  // Turn 1: 90° Right-hander
  { x: -39.5, z: -6.5, width: 5.7, turnAnchor: 1 },
  // Straight 1 -> 2 heading up-right
  { x: -27.0, z: -12.0, width: 5.6 },
  { x: -13.0, z: -17.5, width: 5.5 },
  // Turn 2: Sweeping Right-hander into first diagonal chute
  { x: -3.5, z: -17.0, width: 5.3, turnAnchor: 2 },
  // Chute 2 -> 3 heading down-right
  { x: 4.5, z: -9.0, width: 5.1 },
  { x: 12.5, z: -1.0, width: 4.95 },
  // Turn 3: Tight 180° Left-hand hairpin around interior barrier tip
  { x: 17.5, z: 1.5, width: 4.85, turnAnchor: 3 },
  { x: 19.5, z: -3.5, width: 4.9 },
  // Chute 3 -> 4 heading up-left into upper loop
  { x: 10.0, z: -13.0, width: 5.2 },
  { x: -1.0, z: -24.0, width: 5.3 },
  // Turn 4: 90° Right-hander at top-left of upper loop
  { x: -6.5, z: -32.0, width: 5.3, turnAnchor: 4 },
  { x: 0.0, z: -37.5, width: 5.5 },
  // Turn 5: North Right-hand corner at the top of the circuit
  { x: 10.0, z: -38.5, width: 5.5, turnAnchor: 5 },
  // Approach to Turn 6
  { x: 18.0, z: -32.0, width: 5.2 },
  // Turn 6: Right-hand kink in upper-right esses
  { x: 22.5, z: -25.0, width: 4.95, turnAnchor: 6 },
  // Turn 7: Left-hand exit of the upper-right esses
  { x: 25.0, z: -16.5, width: 5.0, turnAnchor: 7 },
  { x: 35.0, z: -12.5, width: 5.6 },
  // Turn 8: Wide 180° Far-Right Sweeper
  { x: 45.5, z: -7.5, width: 5.95, turnAnchor: 8 },
  { x: 44.0, z: 1.5, width: 5.9 },
  // Back straight 8 -> 9 heading down-left
  { x: 29.0, z: 8.5, width: 5.7 },
  { x: 15.0, z: 15.0, width: 5.5 },
  // Turn 9: Right-hand corner at bottom-center heading up-left into lower infield
  { x: 4.5, z: 16.5, width: 5.3, turnAnchor: 9 },
  { x: -5.0, z: 8.5, width: 5.1 },
  { x: -14.5, z: 0.5, width: 4.95 },
  // Turn 10: Tight 180° Left-hand hairpin in lower infield
  { x: -22.5, z: -2.5, width: 4.85, turnAnchor: 10 },
  { x: -26.0, z: 3.0, width: 4.95 },
  // Chute 10 -> 11 heading down-right toward bottom carousel
  { x: -18.5, z: 13.5, width: 5.3 },
  { x: -12.0, z: 22.5, width: 5.6 },
  // Turn 11: Final 180° Right-hand Carousel at bottom-left
  { x: -16.5, z: 30.0, width: 5.9, turnAnchor: 11 },
  { x: -26.5, z: 24.5, width: 5.85 },
];

const TARGET_CIRCUIT_LENGTH_METERS = 245.0;
const TRACK_RECORD_SECONDS = 24.499;
const SAMPLE_COUNT = 490; // ~0.5m per sample

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function evaluateClosedSpline(waypoints: ControlWaypoint[], u: number): {
  x: number;
  z: number;
  width: number;
} {
  const n = waypoints.length;
  const scaled = ((u % 1) + 1) % 1 * n;
  const i1 = Math.floor(scaled) % n;
  const t = scaled - Math.floor(scaled);
  const i0 = (i1 - 1 + n) % n;
  const i2 = (i1 + 1) % n;
  const i3 = (i1 + 2) % n;

  return {
    x: catmullRom(waypoints[i0].x, waypoints[i1].x, waypoints[i2].x, waypoints[i3].x, t),
    z: catmullRom(waypoints[i0].z, waypoints[i1].z, waypoints[i2].z, waypoints[i3].z, t),
    width: catmullRom(
      waypoints[i0].width,
      waypoints[i1].width,
      waypoints[i2].width,
      waypoints[i3].width,
      t,
    ),
  };
}

const TURN_DEFINITIONS: Array<{
  number: TurnNumber;
  name: string;
  direction: TurnDirection;
  sector: SectorNumber;
}> = [
  { number: 1, name: 'Turn 1 (Grid 90 Right)', direction: 'Right', sector: 1 },
  { number: 2, name: 'Turn 2 (Infield Entry Right)', direction: 'Right', sector: 1 },
  { number: 3, name: 'Turn 3 (Center Hairpin Left)', direction: 'Left', sector: 1 },
  { number: 4, name: 'Turn 4 (North-West Right)', direction: 'Right', sector: 2 },
  { number: 5, name: 'Turn 5 (North Crown Right)', direction: 'Right', sector: 2 },
  { number: 6, name: 'Turn 6 (Esses Entry Right)', direction: 'Right', sector: 2 },
  { number: 7, name: 'Turn 7 (Esses Exit Left)', direction: 'Left', sector: 2 },
  { number: 8, name: 'Turn 8 (East Sweeper Right)', direction: 'Right', sector: 2 },
  { number: 9, name: 'Turn 9 (South Infield Right)', direction: 'Right', sector: 3 },
  { number: 10, name: 'Turn 10 (West Hairpin Left)', direction: 'Left', sector: 3 },
  { number: 11, name: 'Turn 11 (Carousel Right)', direction: 'Right', sector: 3 },
];

let cachedCircuit: CircuitData | null = null;

export function buildK1TorontoCircuit(): CircuitData {
  if (cachedCircuit) {
    return cachedCircuit;
  }

  // 1. Supersample spline to measure raw length and build arc-length parameterization
  const fineSteps = 2400;
  const finePts: Array<{ u: number; x: number; z: number; width: number; arc: number }> = [];
  let accumArc = 0;
  let prev = evaluateClosedSpline(RAW_WAYPOINTS, 0);
  finePts.push({ u: 0, x: prev.x, z: prev.z, width: prev.width, arc: 0 });

  for (let i = 1; i <= fineSteps; i++) {
    const u = i / fineSteps;
    const cur = evaluateClosedSpline(RAW_WAYPOINTS, u);
    accumArc += Math.hypot(cur.x - prev.x, cur.z - prev.z);
    finePts.push({ u, x: cur.x, z: cur.z, width: cur.width, arc: accumArc });
    prev = cur;
  }

  const rawTotalLength = accumArc;
  const scale = TARGET_CIRCUIT_LENGTH_METERS / rawTotalLength;

  // 2. Resample uniformly by arc length into SAMPLE_COUNT samples
  const rawSamples: Array<{
    distanceMeters: number;
    progress: number;
    center: Vector2D;
    widthMeters: number;
  }> = [];

  let fineIdx = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const progress = i / SAMPLE_COUNT;
    const targetRawArc = progress * rawTotalLength;
    while (fineIdx < finePts.length - 2 && finePts[fineIdx + 1].arc < targetRawArc) {
      fineIdx++;
    }
    const a = finePts[fineIdx];
    const b = finePts[fineIdx + 1];
    const span = Math.max(1e-9, b.arc - a.arc);
    const ratio = (targetRawArc - a.arc) / span;
    const x = (a.x + (b.x - a.x) * ratio) * scale;
    const z = (a.z + (b.z - a.z) * ratio) * scale;
    const widthMeters = Math.min(6.0, Math.max(4.8, a.width + (b.width - a.width) * ratio));

    rawSamples.push({
      distanceMeters: progress * TARGET_CIRCUIT_LENGTH_METERS,
      progress,
      center: { x, z },
      widthMeters,
    });
  }

  // The source diagram is not a survey. Its original normalization folded four
  // physical Barriers. Smooth the traced centerline locally and enlarge geometry
  // alone; widths and the realistic Kart limiter remain unchanged.
  let corrected = rawSamples.map((sample) => ({ ...sample.center }));
  for (let pass = 0; pass < 10; pass++) {
    corrected = corrected.map((point, i) => ({
      x: 0.25 * corrected[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT].x + 0.5 * point.x + 0.25 * corrected[(i + 1) % SAMPLE_COUNT].x,
      z: 0.25 * corrected[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT].z + 0.5 * point.z + 0.25 * corrected[(i + 1) % SAMPLE_COUNT].z,
    }));
  }
  corrected = corrected.map((point) => ({ x: point.x * 1.5, z: point.z * 1.5 }));
  const correctedArcs = [0];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    correctedArcs.push(correctedArcs[i] + Math.hypot(corrected[(i + 1) % SAMPLE_COUNT].x - corrected[i].x, corrected[(i + 1) % SAMPLE_COUNT].z - corrected[i].z));
  }
  const totalLengthMeters = correctedArcs[SAMPLE_COUNT];
  const originalWidths = rawSamples.map((sample) => sample.widthMeters);
  let correctedIndex = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const distance = i / SAMPLE_COUNT * totalLengthMeters;
    while (correctedIndex < SAMPLE_COUNT - 1 && correctedArcs[correctedIndex + 1] < distance) correctedIndex++;
    const ratio = (distance - correctedArcs[correctedIndex]) / (correctedArcs[correctedIndex + 1] - correctedArcs[correctedIndex]);
    const a = corrected[correctedIndex], b = corrected[(correctedIndex + 1) % SAMPLE_COUNT];
    rawSamples[i] = {
      distanceMeters: distance, progress: distance / totalLengthMeters,
      center: { x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio },
      widthMeters: originalWidths[correctedIndex] + (originalWidths[(correctedIndex + 1) % SAMPLE_COUNT] - originalWidths[correctedIndex]) * ratio,
    };
  }

  // 3. Compute tangent, right-hand normal, barriers, and signed curvature
  const samples: CircuitSample[] = rawSamples.map((s, idx) => {
    const prevSample = rawSamples[(idx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const nextSample = rawSamples[(idx + 1) % SAMPLE_COUNT];
    const dx = nextSample.center.x - prevSample.center.x;
    const dz = nextSample.center.z - prevSample.center.z;
    const len = Math.max(1e-9, Math.hypot(dx, dz));
    const tangent: Vector2D = { x: dx / len, z: dz / len };
    // In top-down (x right, z down), rotating tangent 90° clockwise gives right-hand normal: (-dz, dx)
    const normal: Vector2D = { x: -tangent.z, z: tangent.x };

    const ax = s.center.x - prevSample.center.x, az = s.center.z - prevSample.center.z;
    const bx = nextSample.center.x - s.center.x, bz = nextSample.center.z - s.center.z;
    const curvature = 2 * (ax * bz - az * bx) / Math.max(1e-9, Math.hypot(ax, az) * Math.hypot(bx, bz) * len);

    const halfW = s.widthMeters * 0.5;
    const leftBarrier: Vector2D = {
      x: s.center.x - normal.x * halfW,
      z: s.center.z - normal.z * halfW,
    };
    const rightBarrier: Vector2D = {
      x: s.center.x + normal.x * halfW,
      z: s.center.z + normal.z * halfW,
    };

    return {
      index: idx,
      distanceMeters: s.distanceMeters,
      progress: s.progress,
      center: s.center,
      tangent,
      normal,
      widthMeters: s.widthMeters,
      leftBarrier,
      rightBarrier,
      curvature,
      sector: 1, // populated below after turn boundaries
    };
  });

  // 4. Map the 11 official Turns from their waypoint anchors
  const turns: TurnMetadata[] = TURN_DEFINITIONS.map((def) => {
    const wpIdx = RAW_WAYPOINTS.findIndex((wp) => wp.turnAnchor === def.number);
    const uAnchor = wpIdx / RAW_WAYPOINTS.length;
    // Find arc distance corresponding to uAnchor
    const fineMatch =
      finePts.find((p) => p.u >= uAnchor) ?? finePts[finePts.length - 1];
    const originalIndex = (fineMatch.arc / rawTotalLength) * SAMPLE_COUNT;
    const anchorIndex = Math.floor(originalIndex) % SAMPLE_COUNT;
    const apexDist = correctedArcs[anchorIndex] + (originalIndex - Math.floor(originalIndex)) * (correctedArcs[anchorIndex + 1] - correctedArcs[anchorIndex]);
    const sampleIdx =
      Math.round((apexDist / totalLengthMeters) * SAMPLE_COUNT) % SAMPLE_COUNT;
    const apexSample = samples[sampleIdx];
    const insideSign = def.direction === 'Right' ? 1 : -1;
    const insideOffset = apexSample.widthMeters * 0.5 - 0.26; // Inside front tire clipping point (26cm off inside barrier)
    const apexPoint: Vector2D = {
      x: apexSample.center.x + apexSample.normal.x * insideSign * insideOffset,
      z: apexSample.center.z + apexSample.normal.z * insideSign * insideOffset,
    };

    return {
      number: def.number,
      name: def.name,
      direction: def.direction,
      sector: def.sector,
      entryDistanceMeters: Math.max(0, apexDist - 7.5),
      apexDistanceMeters: apexDist,
      exitDistanceMeters: Math.min(totalLengthMeters, apexDist + 7.5),
      apexPoint,
      typicalWidthMeters: apexSample.widthMeters,
    };
  });

  // Sector boundaries: S1 = start..exit of T3, S2 = exit of T3..exit of T8, S3 = exit of T8..finish
  const s1End = turns[2].exitDistanceMeters; // T3 exit
  const s2End = turns[7].exitDistanceMeters; // T8 exit
  for (const sample of samples) {
    if (sample.distanceMeters <= s1End) {
      sample.sector = 1;
    } else if (sample.distanceMeters <= s2End) {
      sample.sector = 2;
    } else {
      sample.sector = 3;
    }
  }

  cachedCircuit = {
    name: 'K1 Speed Toronto',
    totalLengthMeters,
    trackRecordSeconds: TRACK_RECORD_SECONDS,
    samples,
    turns,
  };

  return cachedCircuit;
}
