import { BARRIER_HALF_THICKNESS_METERS } from '../simulation/barrier-geometry';
import type { CircuitData, CircuitSample, SessionSnapshot, Vector2D } from '../simulation/types';
import type { GraphicsQuality } from './graphics';

export const GANTRY_BEAM_CLEARANCE_Y = 3.55;
export const GANTRY_LIGHT_TREE_BOTTOM_Y = 3.38;
export const GANTRY_SCOREBOARD_BOTTOM_Y = 3.42;

export const HALL_PADDING_WEST_METERS = 12.0;
export const HALL_PADDING_EAST_METERS = 10.0;
export const HALL_PADDING_NORTH_METERS = 12.0;
export const HALL_PADDING_SOUTH_METERS = 10.0;
export const HALL_CEILING_HEIGHT_METERS = 8.4;

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  ceilingY: number;
}

export interface PositionedFootprint {
  id: string;
  x: number;
  z: number;
  yawRad: number;
  halfWidth: number; // along local +X
  halfDepth: number; // along local +Z
}

export interface GantryPlacement {
  center: Vector2D;
  yawRad: number;
  spanMeters: number;
  beamBottomY: number;
  lightTreeBottomY: number;
  scoreboardBottomY: number;
  leftColumn: PositionedFootprint;
  rightColumn: PositionedFootprint;
}

export interface PitBayPlacement {
  apronCenter: Vector2D;
  yawRad: number;
  lengthMeters: number;
  widthMeters: number;
  apronCorners: Vector2D[];
  gatePosts: PositionedFootprint[];
  chargingStanchions: PositionedFootprint[];
  parkedKarts: PositionedFootprint[];
}

export interface MezzaninePlacement {
  deckCenter: Vector2D;
  widthMeters: number;
  depthMeters: number;
  deckY: number;
  railingHeightY: number;
  columns: PositionedFootprint[];
}

export interface MarshalPanelPlacement {
  turnNumber: 1 | 3 | 8 | 10;
  x: number;
  z: number;
  yawRad: number;
  footprint: PositionedFootprint;
}

export interface TireStackPlacement {
  turnNumber: 1 | 4 | 8 | 11;
  x: number;
  z: number;
  yawRad: number;
  radius: number;
}

export interface DrainGratePlacement {
  x: number;
  z: number;
  yawRad: number;
  halfWidth: number;
  halfDepth: number;
}

export interface WallBannerPlacement {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
  subtitle: string;
}

export interface HvacRunPlacement {
  x: number;
  y: number;
  zStart: number;
  zEnd: number;
  radius: number;
}

export interface ArenaLayout {
  bounds: ArenaBounds;
  gantry: GantryPlacement;
  pitBay: PitBayPlacement;
  mezzanine: MezzaninePlacement;
  marshalPanels: MarshalPanelPlacement[];
  tireStacks: TireStackPlacement[];
  drainGrates: DrainGratePlacement[];
  trussZs: number[];
  hvacRuns: HvacRunPlacement[];
  highBayLamps: Array<{ x: number; y: number; z: number }>;
  banners: WallBannerPlacement[];
}

export interface StartLightPodSpec {
  colorHex: number;
  emissiveHex: number;
  intensity: number;
}

export interface StartLightsVisualState {
  mode: 'Prep' | 'Green' | 'DirtyAmber' | 'Finished';
  pods: StartLightPodSpec[];
}

export type MarshalSignalState = 'GreenSteady' | 'YellowFlash' | 'RedPulse';

export interface ScoreboardDisplayData {
  statusLabel: string;
  lapLine: string;
  currentTime: string;
  lastTime: string;
  pbTime: string;
  refTime: string;
  isClean: boolean;
}

export interface VenueQualityVisibility {
  showGantry: boolean;
  showMarshalPanels: boolean;
  showParkedKarts: boolean;
  showHvacDucts: boolean;
  showTireStacks: boolean;
  showMezzanineDetails: boolean;
  showDrainGrates: boolean;
}

function localOffsetToWorld(
  origin: Vector2D,
  tangent: Vector2D,
  normal: Vector2D,
  along: number,
  across: number,
): Vector2D {
  return {
    x: origin.x + tangent.x * along + normal.x * across,
    z: origin.z + tangent.z * along + normal.z * across,
  };
}

function findTurnApexSample(circuit: CircuitData, turnNumber: number): {
  sample: CircuitSample;
  outerSign: 1 | -1;
} {
  const turn = circuit.turns.find((t) => t.number === turnNumber);
  if (!turn) {
    throw new Error(`Missing turn ${turnNumber} in circuit metadata`);
  }
  const sample =
    circuit.samples.find((s) => s.distanceMeters >= turn.apexDistanceMeters) ?? circuit.samples[0];
  // Right-hand turn has inside on +normal, outside on -normal; Left-hand turn has outside on +normal.
  const outerSign: 1 | -1 = turn.direction === 'Right' ? -1 : 1;
  return { sample, outerSign };
}

/**
 * Computes minimum signed distance (in meters) from point `(x, z)` (with optional radius)
 * to the outer face of the nearest Circuit Barrier envelope across all 490 sample segments.
 */
export function computeMinCorridorAndBarrierClearance(
  circuit: CircuitData,
  x: number,
  z: number,
  radius = 0,
): number {
  const samples = circuit.samples;
  const n = samples.length;
  let minClearance = Infinity;

  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const dx = b.center.x - a.center.x;
    const dz = b.center.z - a.center.z;
    const lenSq = dx * dx + dz * dz;
    const t =
      lenSq > 1e-12
        ? Math.max(0, Math.min(1, ((x - a.center.x) * dx + (z - a.center.z) * dz) / lenSq))
        : 0;
    const cx = a.center.x + dx * t;
    const cz = a.center.z + dz * t;
    const halfWidth = (a.widthMeters + (b.widthMeters - a.widthMeters) * t) * 0.5;
    const clearance = Math.hypot(x - cx, z - cz) - (halfWidth + BARRIER_HALF_THICKNESS_METERS) - radius;
    if (clearance < minClearance) {
      minClearance = clearance;
    }
  }

  return minClearance;
}

/**
 * Evaluates worst-case clearance of an oriented rectangular footprint against all 490 Circuit segments.
 * Uses Three.js `rotation.y = yawRad` convention where local `+X` maps to `(cos(-yaw), sin(-yaw))`.
 */
export function computeOrientedBoxMinClearance(
  circuit: CircuitData,
  box: PositionedFootprint,
): number {
  const heading = -box.yawRad;
  const tx = Math.cos(heading);
  const tz = Math.sin(heading);
  const nx = -tz;
  const nz = tx;

  let minClearance = Infinity;
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      const px = box.x + tx * (sx * box.halfWidth) + nx * (sz * box.halfDepth);
      const pz = box.z + tz * (sx * box.halfWidth) + nz * (sz * box.halfDepth);
      const clearance = computeMinCorridorAndBarrierClearance(circuit, px, pz, 0);
      if (clearance < minClearance) {
        minClearance = clearance;
      }
    }
  }
  return minClearance;
}

/**
 * Deterministically computes all indoor arena architecture & prop placements from `circuit`.
 */
export function computeArenaLayout(circuit: CircuitData): ArenaLayout {
  const xs = circuit.samples.flatMap((s) => [s.leftBarrier.x, s.rightBarrier.x]);
  const zs = circuit.samples.flatMap((s) => [s.leftBarrier.z, s.rightBarrier.z]);
  const minX = Math.min(...xs) - HALL_PADDING_WEST_METERS;
  const maxX = Math.max(...xs) + HALL_PADDING_EAST_METERS;
  const minZ = Math.min(...zs) - HALL_PADDING_NORTH_METERS;
  const maxZ = Math.max(...zs) + HALL_PADDING_SOUTH_METERS;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const bounds: ArenaBounds = {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX,
    centerZ,
    ceilingY: HALL_CEILING_HEIGHT_METERS,
  };

  // 1. Start/Finish Steel Truss Gantry over circuit.samples[0]
  const s0 = circuit.samples[0];
  const s0Heading = Math.atan2(s0.tangent.z, s0.tangent.x);
  const gantryYaw = -s0Heading;
  const columnHalfOffset = s0.widthMeters * 0.5 + BARRIER_HALF_THICKNESS_METERS + 0.65; // ~3.67 m
  const leftColCenter = localOffsetToWorld(s0.center, s0.tangent, s0.normal, 0, -columnHalfOffset);
  const rightColCenter = localOffsetToWorld(s0.center, s0.tangent, s0.normal, 0, columnHalfOffset);

  const gantry: GantryPlacement = {
    center: { ...s0.center },
    yawRad: gantryYaw,
    spanMeters: columnHalfOffset * 2,
    beamBottomY: GANTRY_BEAM_CLEARANCE_Y,
    lightTreeBottomY: GANTRY_LIGHT_TREE_BOTTOM_Y,
    scoreboardBottomY: GANTRY_SCOREBOARD_BOTTOM_Y,
    leftColumn: {
      id: 'Gantry_Column_L',
      x: leftColCenter.x,
      z: leftColCenter.z,
      yawRad: gantryYaw,
      halfWidth: 0.22,
      halfDepth: 0.22,
    },
    rightColumn: {
      id: 'Gantry_Column_R',
      x: rightColCenter.x,
      z: rightColCenter.z,
      yawRad: gantryYaw,
      halfWidth: 0.22,
      halfDepth: 0.22,
    },
  };

  // 2. Trackside Pit & Staging Bay strictly outside the outer Barrier alongside the start/finish straight
  const pitAnchor = circuit.samples[478];
  const pitHeading = Math.atan2(pitAnchor.tangent.z, pitAnchor.tangent.x);
  const pitYaw = -pitHeading;
  const pitInnerOffset = pitAnchor.widthMeters * 0.5 + BARRIER_HALF_THICKNESS_METERS + 1.45;
  const pitWidth = 4.4;
  const pitLength = 9.2;
  const pitAcrossCenter = -(pitInnerOffset + pitWidth * 0.5);
  const apronCenter = localOffsetToWorld(
    pitAnchor.center,
    pitAnchor.tangent,
    pitAnchor.normal,
    0,
    pitAcrossCenter,
  );
  const apronCorners: Vector2D[] = [
    localOffsetToWorld(pitAnchor.center, pitAnchor.tangent, pitAnchor.normal, -pitLength * 0.5, -pitInnerOffset),
    localOffsetToWorld(pitAnchor.center, pitAnchor.tangent, pitAnchor.normal, pitLength * 0.5, -pitInnerOffset),
    localOffsetToWorld(pitAnchor.center, pitAnchor.tangent, pitAnchor.normal, pitLength * 0.5, -(pitInnerOffset + pitWidth)),
    localOffsetToWorld(pitAnchor.center, pitAnchor.tangent, pitAnchor.normal, -pitLength * 0.5, -(pitInnerOffset + pitWidth)),
  ];

  const gatePosts: PositionedFootprint[] = [-pitLength * 0.45, pitLength * 0.45].map((along, idx) => {
    const pos = localOffsetToWorld(
      pitAnchor.center,
      pitAnchor.tangent,
      pitAnchor.normal,
      along,
      -(pitInnerOffset + 0.12),
    );
    return {
      id: `Pit_Gate_Post_${idx}`,
      x: pos.x,
      z: pos.z,
      yawRad: pitYaw,
      halfWidth: 0.10,
      halfDepth: 0.10,
    };
  });

  const chargingStanchions: PositionedFootprint[] = [-2.8, 0.0, 2.8].map((along, idx) => {
    const pos = localOffsetToWorld(
      pitAnchor.center,
      pitAnchor.tangent,
      pitAnchor.normal,
      along,
      -(pitInnerOffset + pitWidth - 0.55),
    );
    return {
      id: `Pit_Charger_${idx}`,
      x: pos.x,
      z: pos.z,
      yawRad: pitYaw,
      halfWidth: 0.24,
      halfDepth: 0.22,
    };
  });

  const parkedKarts: PositionedFootprint[] = [-2.8, 0.0, 2.8].map((along, idx) => {
    const pos = localOffsetToWorld(
      pitAnchor.center,
      pitAnchor.tangent,
      pitAnchor.normal,
      along,
      -(pitInnerOffset + 1.95),
    );
    // Angle parked karts slightly out toward the pit lane exit (~12 deg)
    const kartYaw = pitYaw + 0.20;
    return {
      id: `Pit_Parked_Kart_${idx}`,
      x: pos.x,
      z: pos.z,
      yawRad: kartYaw,
      halfWidth: 0.88,
      halfDepth: 0.45,
    };
  });

  const pitBay: PitBayPlacement = {
    apronCenter,
    yawRad: pitYaw,
    lengthMeters: pitLength,
    widthMeters: pitWidth,
    apronCorners,
    gatePosts,
    chargingStanchions,
    parkedKarts,
  };

  // 3. Raised Spectator Viewing Mezzanine along North wall
  const mezzWidth = 44.0;
  const mezzDepth = 6.2;
  const mezzCenterX = 2.0;
  const mezzFrontZ = minZ + mezzDepth + 0.4; // ~ -48.27 m, > 5.4 m clear of T5
  const mezzCenterZ = (minZ + 0.2 + mezzFrontZ) * 0.5;
  const colXs = [-19, -8.5, 2, 12.5, 23];
  const columns: PositionedFootprint[] = [];
  for (const cx of colXs) {
    columns.push({
      id: `Mezz_Col_Front_${cx}`,
      x: cx,
      z: mezzFrontZ - 0.2,
      yawRad: 0,
      halfWidth: 0.16,
      halfDepth: 0.16,
    });
    columns.push({
      id: `Mezz_Col_Rear_${cx}`,
      x: cx,
      z: minZ + 0.45,
      yawRad: 0,
      halfWidth: 0.16,
      halfDepth: 0.16,
    });
  }
  const mezzanine: MezzaninePlacement = {
    deckCenter: { x: mezzCenterX, z: mezzCenterZ },
    widthMeters: mezzWidth,
    depthMeters: mezzDepth,
    deckY: 3.15,
    railingHeightY: 1.05,
    columns,
  };

  // 4. Live LED Corner Marshal Panels at T1, T3, T8, T10 (>= 0.55 m clear outside outer barrier)
  const marshalTurns: Array<1 | 3 | 8 | 10> = [1, 3, 8, 10];
  const marshalPanels: MarshalPanelPlacement[] = marshalTurns.map((turnNumber) => {
    const { sample, outerSign } = findTurnApexSample(circuit, turnNumber);
    const offset = sample.widthMeters * 0.5 + BARRIER_HALF_THICKNESS_METERS + 0.88;
    const pos = localOffsetToWorld(sample.center, sample.tangent, sample.normal, 0, outerSign * offset);
    const heading = Math.atan2(sample.tangent.z, sample.tangent.x);
    const yawRad = -heading;
    return {
      turnNumber,
      x: pos.x,
      z: pos.z,
      yawRad,
      footprint: {
        id: `Marshal_T${turnNumber}`,
        x: pos.x,
        z: pos.z,
        yawRad,
        halfWidth: 0.22,
        halfDepth: 0.24,
      },
    };
  });

  // 5. Rubber Tire Stacks behind outer corners T1, T4, T8, T11
  const tireTurns: Array<1 | 4 | 8 | 11> = [1, 4, 8, 11];
  const tireStacks: TireStackPlacement[] = [];
  for (const turnNumber of tireTurns) {
    const { sample, outerSign } = findTurnApexSample(circuit, turnNumber);
    const baseIdx = sample.index;
    const n = circuit.samples.length;
    for (const delta of [-4, 0, 4]) {
      const s = circuit.samples[(baseIdx + delta + n) % n];
      const offset = s.widthMeters * 0.5 + BARRIER_HALF_THICKNESS_METERS + 1.05;
      const pos = localOffsetToWorld(s.center, s.tangent, s.normal, 0, outerSign * offset);
      const heading = Math.atan2(s.tangent.z, s.tangent.x);
      tireStacks.push({
        turnNumber,
        x: pos.x,
        z: pos.z,
        yawRad: -heading,
        radius: 0.30,
      });
    }
  }

  // 6. Flush Infield Drainage Grates in open blue concrete pockets
  const drainCandidates: Array<[number, number, number]> = [
    [-12, -24, 0.4],
    [8, -26, 0.0],
    [30, -2, 0.2],
    [18, 8, -0.35],
    [-5, 22, 0.15],
  ];
  const drainGrates: DrainGratePlacement[] = drainCandidates.map(([x, z, yawRad]) => ({
    x,
    z,
    yawRad,
    halfWidth: 0.42,
    halfDepth: 0.26,
  }));

  // 7. Exposed Roof Trusses, Circular HVAC Ducts, High-Bay LEDs, and Illuminated Banners
  const trussZs: number[] = [];
  for (let z = minZ + 4.5; z < maxZ - 2.0; z += 7.5) {
    trussZs.push(z);
  }

  const hvacRuns: HvacRunPlacement[] = [
    { x: centerX - 24, y: 6.75, zStart: minZ + 1.5, zEnd: maxZ - 1.5, radius: 0.36 },
    { x: centerX + 20, y: 6.75, zStart: minZ + 1.5, zEnd: maxZ - 1.5, radius: 0.36 },
  ];

  const highBayLamps: Array<{ x: number; y: number; z: number }> = [];
  for (const z of trussZs) {
    for (let x = minX + 7.5; x < maxX - 4.0; x += 13.0) {
      highBayLamps.push({ x, y: 7.45, z });
    }
  }

  const banners: WallBannerPlacement[] = [
    {
      id: 'Banner_North',
      x: centerX,
      y: 5.75,
      z: minZ + 0.24,
      rotY: 0,
      width: 11.5,
      height: 2.3,
      subtitle: 'ELECTRIC KART TRAINING · TORONTO CIRCUIT',
    },
    {
      id: 'Banner_West',
      x: minX + 0.24,
      y: 4.5,
      z: 2.0,
      rotY: Math.PI / 2,
      width: 10.0,
      height: 2.2,
      subtitle: 'OTL SUPERLEGGERO · ZERO EMISSIONS',
    },
    {
      id: 'Banner_East',
      x: maxX - 0.24,
      y: 4.5,
      z: -4.0,
      rotY: -Math.PI / 2,
      width: 10.0,
      height: 2.2,
      subtitle: 'K1 TORONTO · 11-TURN INDOOR ARENA',
    },
  ];

  return {
    bounds,
    gantry,
    pitBay,
    mezzanine,
    marshalPanels,
    tireStacks,
    drainGrates,
    trussZs,
    hvacRuns,
    highBayLamps,
    banners,
  };
}

/**
 * Maps Time Trial status & clean-lap state to the 5-pod gantry start-light tree.
 */
export function deriveStartLightsState(
  snapshot: SessionSnapshot,
  dirtyCueActive: boolean,
): StartLightsVisualState {
  const { status } = snapshot.timeTrial;
  const t = snapshot.elapsedSeconds;

  if (status === 'Flying Start') {
    const pulse = 0.65 + 0.35 * Math.sin(t * 5.0);
    // Amber outer / red inner prep pods while rolling through Flying Start
    const pods: StartLightPodSpec[] = [0, 1, 2, 3, 4].map((idx) => {
      const isAmber = idx === 0 || idx === 4;
      return isAmber
        ? { colorHex: 0xd97706, emissiveHex: 0xf59e0b, intensity: 1.4 * pulse }
        : { colorHex: 0xb91c1c, emissiveHex: 0xef4444, intensity: 1.8 * pulse };
    });
    return { mode: 'Prep', pods };
  }

  if (dirtyCueActive) {
    const flash = Math.sin(t * 12.0) > 0 ? 2.4 : 0.45;
    return {
      mode: 'DirtyAmber',
      pods: Array.from({ length: 5 }, () => ({
        colorHex: 0xd97706,
        emissiveHex: 0xf59e0b,
        intensity: flash,
      })),
    };
  }

  if (status === 'Finished') {
    return {
      mode: 'Finished',
      pods: Array.from({ length: 5 }, () => ({
        colorHex: 0xcbd5e1,
        emissiveHex: 0xe2e8f0,
        intensity: 1.1,
      })),
    };
  }

  // Active Driving: crisp motorsport green
  return {
    mode: 'Green',
    pods: Array.from({ length: 5 }, () => ({
      colorHex: 0x16a34a,
      emissiveHex: 0x22c55e,
      intensity: 2.2,
    })),
  };
}

/**
 * Derives corner marshal LED signal state from live kart telemetry.
 */
export function deriveMarshalSignalState(snapshot: SessionSnapshot): MarshalSignalState {
  if (snapshot.kart.driveDirection === 'Reverse') {
    return 'RedPulse';
  }
  if (snapshot.kart.barrierContact || snapshot.kart.barrierImpactSpeedMps > 0.5) {
    return 'YellowFlash';
  }
  return 'GreenSteady';
}

function formatSecondsOrDash(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--.--';
  return seconds.toFixed(2);
}

/**
 * Formats Time Trial and Lap telemetry for the overhead digital timing scoreboard.
 * Outputs deterministic strings so canvas redraws only occur when text values change.
 */
export function formatScoreboardData(snapshot: SessionSnapshot): ScoreboardDisplayData {
  const { lap, timeTrial, racingLine } = snapshot;
  const lapText = String(Math.max(1, lap.lapNumber)).padStart(2, '0');
  const limitText = timeTrial.lapLimit === null ? 'INF' : String(timeTrial.lapLimit).padStart(2, '0');
  const statusLabel =
    timeTrial.status === 'Flying Start'
      ? 'FLYING START'
      : timeTrial.status === 'Finished'
        ? 'SESSION COMPLETE'
        : lap.isClean
          ? 'GREEN · CLEAN'
          : 'CAUTION · DIRTY';

  return {
    statusLabel,
    lapLine: `LAP ${lapText}/${limitText}`,
    currentTime: formatSecondsOrDash(lap.currentLapSeconds),
    lastTime: formatSecondsOrDash(lap.lastLapSeconds),
    pbTime: formatSecondsOrDash(lap.personalBestSeconds),
    refTime: formatSecondsOrDash(racingLine.benchmarkLapSeconds),
    isClean: lap.isClean,
  };
}

/**
 * Maps graphics quality tier to decorative arena prop visibility.
 */
export function getVenueQualityVisibility(quality: GraphicsQuality): VenueQualityVisibility {
  const showDecor = quality !== 'Performance';
  return {
    showGantry: true,
    showMarshalPanels: true,
    showParkedKarts: showDecor,
    showHvacDucts: showDecor,
    showTireStacks: showDecor,
    showMezzanineDetails: showDecor,
    showDrainGrates: showDecor,
  };
}
