import { buildK1TorontoCircuit } from './circuit';
import { evaluateLiveRacingLine } from './racing-line';
import {
  CameraMode,
  CameraState,
  CircuitData,
  CircuitSample,
  CoachingInsightCategory,
  CornerExecutionCard,
  DrillState,
  DrillTargetDefinition,
  DrillTargetId,
  DriverInput,
  GhostMode,
  GhostPose,
  GhostSampleFrame,
  GhostState,
  KartState,
  LapSummaryState,
  PracticeMode,
  RacingLinePoint,
  SectorSplitsTuple,
  SessionSnapshot,
  TurnNumber,
} from './types';

export const FIXED_TIMESTEP_SECONDS = 1 / 120;
export const MAX_KART_SPEED_KPH = 45.0;
export const MAX_KART_SPEED_MPS = MAX_KART_SPEED_KPH / 3.6; // 12.5 m/s
export const FLYING_START_SPEED_KPH = 36.0;
export const FLYING_START_SPEED_MPS = FLYING_START_SPEED_KPH / 3.6; // 10.0 m/s
export const FLYING_START_DISTANCE_METERS = 236.0; // Exiting Turn 11 onto the main straight

const PEAK_LAUNCH_ACCEL_MPS2 = 5.2;
const MOTOR_DRAG_DECEL_MPS2 = 1.45;
const MAX_REAR_BRAKE_DECEL_MPS2 = 8.8;
const WHEELBASE_METERS = 1.06;
const MAX_STEER_ANGLE_RAD = 0.46;
const KART_HALF_WIDTH_METERS = 0.45;
const STORAGE_KEY = 'apex-bite:training-data:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PersistedTrainingData {
  version: 1;
  personalBestSeconds: number | null;
  bestSectorSplits: SectorSplitsTuple;
  personalBestGhostFrames: GhostSampleFrame[];
  drillPersonalBests?: Partial<Record<DrillTargetId, number>>;
}

export interface SimulationSessionOptions {
  storage?: StorageLike;
}

export interface SimulationSession {
  step(dtSeconds?: number, input?: DriverInput): SessionSnapshot;
  toggleCamera(): SessionSnapshot;
  toggleRacingLine(): SessionSnapshot;
  cycleGhostMode(): SessionSnapshot;
  setPracticeMode(mode: PracticeMode): SessionSnapshot;
  selectDrillTarget(targetId: DrillTargetId): SessionSnapshot;
  reset(): SessionSnapshot;
  exportTrainingDataJson(): string;
  importTrainingDataJson(json: string): SessionSnapshot;
  getSnapshot(): SessionSnapshot;
}

function findNearestCircuitSample(
  samples: CircuitSample[],
  x: number,
  z: number,
): CircuitSample {
  let best = samples[0];
  let bestDistSq = Infinity;
  for (const s of samples) {
    const dx = x - s.center.x;
    const dz = z - s.center.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = s;
    }
  }
  return best;
}

function resolveTurnAtDistance(
  distanceMeters: number,
  turns: ReturnType<typeof buildK1TorontoCircuit>['turns'],
): TurnNumber | null {
  for (const t of turns) {
    if (distanceMeters >= t.entryDistanceMeters && distanceMeters <= t.exitDistanceMeters) {
      return t.number;
    }
  }
  return null;
}

function computeCameraState(kart: KartState, mode: CameraMode): CameraState {
  const forwardX = Math.cos(kart.headingRad);
  const forwardZ = Math.sin(kart.headingRad);

  if (mode === 'Helmet Cam') {
    return {
      mode,
      position: {
        x: kart.position.x - forwardX * 0.12,
        y: 0.78,
        z: kart.position.z - forwardZ * 0.12,
      },
      lookAt: {
        x: kart.position.x + forwardX * 8.0,
        y: 0.45,
        z: kart.position.z + forwardZ * 8.0,
      },
    };
  }

  return {
    mode: 'Chase Cam',
    position: {
      x: kart.position.x - forwardX * 4.2,
      y: 2.1,
      z: kart.position.z - forwardZ * 4.2,
    },
    lookAt: {
      x: kart.position.x + forwardX * 3.5,
      y: 0.4,
      z: kart.position.z + forwardZ * 3.5,
    },
  };
}

function sampleTrackRecordGhostPose(
  points: RacingLinePoint[],
  benchmarkLapSeconds: number,
  lapSeconds: number,
): GhostPose {
  const t = ((lapSeconds % benchmarkLapSeconds) + benchmarkLapSeconds) % benchmarkLapSeconds;
  const n = points.length;
  let idx = 0;
  while (idx < n - 1 && points[idx + 1].benchmarkTimeSeconds <= t) {
    idx++;
  }
  const a = points[idx];
  const b = points[(idx + 1) % n];
  const bTime = idx + 1 < n ? b.benchmarkTimeSeconds : benchmarkLapSeconds;
  const span = Math.max(1e-6, bTime - a.benchmarkTimeSeconds);
  const ratio = Math.max(0, Math.min(1, (t - a.benchmarkTimeSeconds) / span));

  let dH = b.headingRad - a.headingRad;
  while (dH > Math.PI) dH -= 2 * Math.PI;
  while (dH < -Math.PI) dH += 2 * Math.PI;

  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * ratio,
      z: a.position.z + (b.position.z - a.position.z) * ratio,
    },
    headingRad: a.headingRad + dH * ratio,
    speedKph: a.targetSpeedKph + (b.targetSpeedKph - a.targetSpeedKph) * ratio,
  };
}

function samplePersonalBestGhostPose(
  frames: GhostSampleFrame[],
  lapSeconds: number,
): GhostPose | null {
  if (frames.length === 0) return null;
  const total = frames[frames.length - 1].lapSeconds;
  if (total <= 0.1) return null;
  const t = ((lapSeconds % total) + total) % total;

  let idx = 0;
  while (idx < frames.length - 2 && frames[idx + 1].lapSeconds <= t) {
    idx++;
  }
  const a = frames[idx];
  const b = frames[Math.min(frames.length - 1, idx + 1)];
  const span = Math.max(1e-6, b.lapSeconds - a.lapSeconds);
  const ratio = Math.max(0, Math.min(1, (t - a.lapSeconds) / span));

  let dH = b.headingRad - a.headingRad;
  while (dH > Math.PI) dH -= 2 * Math.PI;
  while (dH < -Math.PI) dH += 2 * Math.PI;

  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * ratio,
      z: a.position.z + (b.position.z - a.position.z) * ratio,
    },
    headingRad: a.headingRad + dH * ratio,
    speedKph: a.speedKph + (b.speedKph - a.speedKph) * ratio,
  };
}

function buildDrillTargetCatalog(
  circuit: CircuitData,
  racingLinePoints: RacingLinePoint[],
): DrillTargetDefinition[] {
  const n = racingLinePoints.length;
  const pointAtDistance = (dist: number): RacingLinePoint => {
    const clamped = Math.max(0, Math.min(circuit.totalLengthMeters - 0.01, dist));
    const idx = Math.min(n - 1, Math.max(0, Math.round((clamped / circuit.totalLengthMeters) * n)));
    return racingLinePoints[idx];
  };

  const specs: Array<{
    id: DrillTargetId;
    label: string;
    kind: 'Turn' | 'Corner Complex';
    turns: TurnNumber[];
  }> = [
    ...circuit.turns.map((t) => ({
      id: `T${t.number}` as DrillTargetId,
      label: t.name,
      kind: 'Turn' as const,
      turns: [t.number],
    })),
    {
      id: 'T1-T3',
      label: 'Complex T1–T3 (Opening Chute & Center Hairpin)',
      kind: 'Corner Complex',
      turns: [1, 2, 3],
    },
    {
      id: 'T2-T3',
      label: 'Complex T2–T3 (Infield Entry into Hairpin)',
      kind: 'Corner Complex',
      turns: [2, 3],
    },
    {
      id: 'T4-T5',
      label: 'Complex T4–T5 (North Loop Double-Right)',
      kind: 'Corner Complex',
      turns: [4, 5],
    },
    {
      id: 'T6-T7-T8',
      label: 'Complex T6–T7–T8 (Esses into East Sweeper)',
      kind: 'Corner Complex',
      turns: [6, 7, 8],
    },
    {
      id: 'T9-T10-T11',
      label: 'Complex T9–T10–T11 (West Hairpin & Final Carousel)',
      kind: 'Corner Complex',
      turns: [9, 10, 11],
    },
  ];

  return specs.map((spec) => {
    const firstTurn = circuit.turns[spec.turns[0] - 1];
    const lastTurn = circuit.turns[spec.turns[spec.turns.length - 1] - 1];
    const flyingEntryDistanceMeters = Math.max(2.0, firstTurn.entryDistanceMeters - 7.0);
    const exitDistanceMeters = Math.min(
      circuit.totalLengthMeters - 2.0,
      lastTurn.exitDistanceMeters + 4.0,
    );

    const entryPt = pointAtDistance(flyingEntryDistanceMeters);
    const firstTurnEntryPt = pointAtDistance(firstTurn.entryDistanceMeters);
    const exitPt = pointAtDistance(exitDistanceMeters);

    let minApexSpeedKph = Infinity;
    for (const pt of racingLinePoints) {
      if (
        pt.distanceMeters >= firstTurn.entryDistanceMeters &&
        pt.distanceMeters <= lastTurn.exitDistanceMeters
      ) {
        if (pt.targetSpeedKph < minApexSpeedKph) {
          minApexSpeedKph = pt.targetSpeedKph;
        }
      }
    }
    if (!Number.isFinite(minApexSpeedKph)) {
      minApexSpeedKph = firstTurnEntryPt.targetSpeedKph;
    }

    const benchmarkTimeSeconds = Math.max(
      0.5,
      exitPt.benchmarkTimeSeconds - entryPt.benchmarkTimeSeconds,
    );

    return {
      id: spec.id,
      label: spec.label,
      kind: spec.kind,
      turns: spec.turns,
      flyingEntryDistanceMeters,
      exitDistanceMeters,
      benchmarkTimeSeconds,
      targetEntrySpeedKph: firstTurnEntryPt.targetSpeedKph,
      targetMinApexSpeedKph: minApexSpeedKph,
      targetExitSpeedKph: exitPt.targetSpeedKph,
    };
  });
}

export function createSimulationSession(
  options: SimulationSessionOptions = {},
): SimulationSession {
  const circuit = buildK1TorontoCircuit();
  const baseProfile = evaluateLiveRacingLine(circuit, 0, FLYING_START_SPEED_MPS, true);
  const drillCatalog = buildDrillTargetCatalog(circuit, baseProfile.points);

  const nSamples = circuit.samples.length;
  const flyingStartIdx =
    Math.round((FLYING_START_DISTANCE_METERS / circuit.totalLengthMeters) * nSamples) %
    nSamples;
  const startSample = circuit.samples[flyingStartIdx];
  const initialHeading = Math.atan2(startSample.tangent.z, startSample.tangent.x);

  const storage: StorageLike | undefined = options.storage;

  let tick = 0;
  let elapsedSeconds = 0;
  let mode: PracticeMode = 'Time Trial';
  let cameraMode: CameraMode = 'Chase Cam';
  let racingLineVisible = true;
  let ghostMode: GhostMode = 'Track Record';

  // Progressive keyboard input shaper state
  let keyboardBrakeHoldSeconds = 0;
  let smoothedSteer = 0;

  let personalBestGhostFrames: GhostSampleFrame[] = [];
  let activeLapGhostFrames: GhostSampleFrame[] = [];
  let sectorEntryLapSeconds = 0;

  // Corner Drill state
  let activeDrillTarget: DrillTargetDefinition =
    drillCatalog.find((d) => d.id === 'T3') ?? drillCatalog[0];
  let drillRunNumber = 1;
  let drillCurrentSegmentSeconds = 0;
  let drillIsClean = true;
  let drillPersonalBests: Partial<Record<DrillTargetId, number>> = {};
  let lastExecutionCard: CornerExecutionCard | null = null;

  // Per-pass telemetry accumulators for Corner Drill
  let drillEntrySpeedKph: number | null = null;
  let drillMinApexSpeedKph = Infinity;
  let drillPeakAxleScrub = 0;
  let drillSawTrailBraking = false;
  let drillApexMinDistMeters = new Map<TurnNumber, number>();

  let lap: LapSummaryState = {
    isClean: true,
    currentLapSeconds: 0,
    lapNumber: 0, // 0 = rolling Flying Start approach exiting Turn 11; 1+ = timed hot laps
    lastLapSeconds: null,
    personalBestSeconds: null,
    timeDeltaSeconds: 0,
    currentSectorSplits: [null, null, null],
    lastSectorSplits: [null, null, null],
    bestSectorSplits: [null, null, null],
  };

  let kart: KartState = {
    position: { ...startSample.center },
    headingRad: initialHeading,
    speedMps: FLYING_START_SPEED_MPS,
    speedKph: FLYING_START_SPEED_KPH,
    forwardAccelMps2: 0,
    lateralAccelMps2: 0,
    steerAngleRad: 0,
    steeringWheelAngleRad: 0,
    throttleInput: 1,
    brakeInput: 0,
    isTrailBraking: false,
    axleScrub: 0,
    slipRatio: 0,
    barrierContact: false,
    barrierContactCount: 0,
    lapDistanceMeters: startSample.distanceMeters,
    lapProgress: startSample.progress,
    currentTurn: resolveTurnAtDistance(startSample.distanceMeters, circuit.turns),
    currentSector: startSample.sector,
  };

  function spawnAtTimeTrialFlyingStart(): void {
    keyboardBrakeHoldSeconds = 0;
    smoothedSteer = 0;
    sectorEntryLapSeconds = 0;
    activeLapGhostFrames = [];
    lap.isClean = true;
    lap.currentLapSeconds = 0;
    lap.lapNumber = 0;
    lap.currentSectorSplits = [null, null, null];

    kart = {
      position: { ...startSample.center },
      headingRad: initialHeading,
      speedMps: FLYING_START_SPEED_MPS,
      speedKph: FLYING_START_SPEED_KPH,
      forwardAccelMps2: 0,
      lateralAccelMps2: 0,
      steerAngleRad: 0,
      steeringWheelAngleRad: 0,
      throttleInput: 1,
      brakeInput: 0,
      isTrailBraking: false,
      axleScrub: 0,
      slipRatio: 0,
      barrierContact: false,
      barrierContactCount: kart.barrierContactCount,
      lapDistanceMeters: startSample.distanceMeters,
      lapProgress: startSample.progress,
      currentTurn: resolveTurnAtDistance(startSample.distanceMeters, circuit.turns),
      currentSector: startSample.sector,
    };
  }

  function spawnAtDrillFlyingEntry(): void {
    keyboardBrakeHoldSeconds = 0;
    smoothedSteer = 0;
    drillCurrentSegmentSeconds = 0;
    drillIsClean = true;
    drillEntrySpeedKph = null;
    drillMinApexSpeedKph = Infinity;
    drillPeakAxleScrub = 0;
    drillSawTrailBraking = false;
    drillApexMinDistMeters = new Map<TurnNumber, number>();
    for (const tn of activeDrillTarget.turns) {
      drillApexMinDistMeters.set(tn, Infinity);
    }

    const ptIdx =
      Math.round(
        (activeDrillTarget.flyingEntryDistanceMeters / circuit.totalLengthMeters) *
          baseProfile.points.length,
      ) % baseProfile.points.length;
    const entryLinePt = baseProfile.points[ptIdx];
    const sample = circuit.samples[ptIdx];

    kart = {
      position: { ...entryLinePt.position },
      headingRad: entryLinePt.headingRad,
      speedMps: entryLinePt.targetSpeedMps,
      speedKph: entryLinePt.targetSpeedKph,
      forwardAccelMps2: 0,
      lateralAccelMps2: 0,
      steerAngleRad: 0,
      steeringWheelAngleRad: 0,
      throttleInput: 1,
      brakeInput: 0,
      isTrailBraking: false,
      axleScrub: 0,
      slipRatio: 0,
      barrierContact: false,
      barrierContactCount: kart.barrierContactCount,
      lapDistanceMeters: sample.distanceMeters,
      lapProgress: sample.progress,
      currentTurn: resolveTurnAtDistance(sample.distanceMeters, circuit.turns),
      currentSector: sample.sector,
    };
  }

  function loadFromStorage(): void {
    if (!storage) return;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return;
      applyImportedData(raw);
    } catch {
      // Ignore malformed storage data
    }
  }

  function saveToStorage(): void {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, exportTrainingDataJson());
    } catch {
      // Ignore quota errors
    }
  }

  loadFromStorage();

  function finalizeCornerDrillPass(exitSpeedKph: number): void {
    const segmentTimeSeconds = Math.max(0.05, drillCurrentSegmentSeconds);
    const firstTurn = circuit.turns[activeDrillTarget.turns[0] - 1];
    const entrySpeedKph =
      drillEntrySpeedKph ?? activeDrillTarget.targetEntrySpeedKph;
    const minApexSpeedKph = Number.isFinite(drillMinApexSpeedKph)
      ? drillMinApexSpeedKph
      : Math.min(entrySpeedKph, exitSpeedKph);

    let totalApexDistMeters = 0;
    for (const tn of activeDrillTarget.turns) {
      const d = drillApexMinDistMeters.get(tn) ?? 1.2;
      totalApexDistMeters += Number.isFinite(d) ? d : 1.2;
    }
    const avgApexDistMeters = totalApexDistMeters / activeDrillTarget.turns.length;
    const apexProximityCm = Math.max(0, Math.round(avgApexDistMeters * 100 * 10) / 10);

    const prevBest = drillPersonalBests[activeDrillTarget.id] ?? null;
    let personalBestSeconds = prevBest;
    if (drillIsClean && (prevBest === null || segmentTimeSeconds < prevBest)) {
      personalBestSeconds = segmentTimeSeconds;
      drillPersonalBests[activeDrillTarget.id] = segmentTimeSeconds;
      saveToStorage();
    }

    const deltaToBenchmarkSeconds =
      segmentTimeSeconds - activeDrillTarget.benchmarkTimeSeconds;
    const deltaToPersonalBestSeconds =
      personalBestSeconds !== null ? segmentTimeSeconds - personalBestSeconds : null;

    let coachingCategory: CoachingInsightCategory;
    let coachingInsight: string;

    if (!drillIsClean) {
      coachingCategory = 'Barrier Contact';
      coachingInsight = `Barrier Contact: Scrubbed against the indoor Barrier in ${firstTurn.name} — widen your turn-in arc to keep the pass Clean.`;
    } else if (minApexSpeedKph < activeDrillTarget.targetMinApexSpeedKph - 2.8) {
      coachingCategory = 'Over-Slowed Entry';
      coachingInsight = `Over-Slowed Entry: Minimum apex speed (${minApexSpeedKph.toFixed(1)} km/h) dropped ${(activeDrillTarget.targetMinApexSpeedKph - minApexSpeedKph).toFixed(1)} km/h below target (${activeDrillTarget.targetMinApexSpeedKph.toFixed(1)} km/h) — release the rear brake earlier to carry rolling momentum.`;
    } else if (apexProximityCm > 50) {
      if (
        !drillSawTrailBraking &&
        drillPeakAxleScrub > 0.38 &&
        entrySpeedKph <= activeDrillTarget.targetEntrySpeedKph + 0.5
      ) {
        coachingCategory = 'Excessive Axle Scrub';
        coachingInsight = `Excessive Axle Scrub: Solid rear axle bound up (${Math.round(drillPeakAxleScrub * 100)}% scrub) without Trail Braking, pushing the Kart ${Math.round(apexProximityCm)} cm wide of the apex.`;
      } else {
        coachingCategory = 'Late Braking Overshoot';
        coachingInsight = `Late Braking Overshoot: Carried ${entrySpeedKph.toFixed(1)} km/h into entry and missed the inside apex by ${Math.round(apexProximityCm)} cm — initiate Trail Braking earlier before turn-in.`;
      }
    } else if (
      drillPeakAxleScrub > 0.44 &&
      !drillSawTrailBraking &&
      exitSpeedKph < activeDrillTarget.targetExitSpeedKph - 2.0
    ) {
      coachingCategory = 'Excessive Axle Scrub';
      coachingInsight = `Excessive Axle Scrub: High solid-axle binding bogged exit speed down to ${exitSpeedKph.toFixed(1)} km/h — blend light Trail Braking (20–70%) on turn-in to unload the inside rear tire.`;
    } else {
      coachingCategory = 'Optimal Pass';
      coachingInsight = `Optimal Pass: Clipped the inside apex within ${Math.round(apexProximityCm)} cm with balanced rotation and a ${exitSpeedKph.toFixed(1)} km/h exit.`;
    }

    lastExecutionCard = {
      targetId: activeDrillTarget.id,
      targetLabel: activeDrillTarget.label,
      runNumber: drillRunNumber,
      isClean: drillIsClean,
      segmentTimeSeconds,
      benchmarkTimeSeconds: activeDrillTarget.benchmarkTimeSeconds,
      deltaToBenchmarkSeconds,
      personalBestSeconds,
      deltaToPersonalBestSeconds,
      entrySpeedKph,
      minApexSpeedKph,
      exitSpeedKph,
      targetEntrySpeedKph: activeDrillTarget.targetEntrySpeedKph,
      targetMinApexSpeedKph: activeDrillTarget.targetMinApexSpeedKph,
      targetExitSpeedKph: activeDrillTarget.targetExitSpeedKph,
      apexProximityCm,
      coachingCategory,
      coachingInsight,
    };

    drillRunNumber += 1;
    spawnAtDrillFlyingEntry();
  }

  function step(dtSeconds = FIXED_TIMESTEP_SECONDS, input: DriverInput = {}): SessionSnapshot {
    const keyThrottle = input.keys?.up ? 1 : 0;
    const gpThrottle = input.gamepad?.throttle ?? 0;
    const throttle = Math.max(
      0,
      Math.min(1, Math.max(input.throttle ?? 0, keyThrottle, gpThrottle)),
    );

    // Two-stage progressive brake curve on keyboard S / ArrowDown vs Spacebar full lock
    const fullBrake = Boolean(input.fullBrake || input.keys?.space);
    let shapedKeyBrake = 0;
    if (input.keys?.down) {
      keyboardBrakeHoldSeconds += dtSeconds;
      if (keyboardBrakeHoldSeconds <= 0.25) {
        shapedKeyBrake = 0.38 + (keyboardBrakeHoldSeconds / 0.25) * 0.16;
      } else {
        const extra = Math.min(1, (keyboardBrakeHoldSeconds - 0.25) / 0.3);
        shapedKeyBrake = 0.54 + extra * 0.46;
      }
    } else {
      keyboardBrakeHoldSeconds = 0;
    }

    const gpBrake = input.gamepad?.brake ?? 0;
    const brake = fullBrake
      ? 1.0
      : Math.max(0, Math.min(1, Math.max(input.brake ?? 0, shapedKeyBrake, gpBrake)));

    // Slip-aware progressive steering for keyboard vs direct analog input
    const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
    const keySteerTarget = (input.keys?.right ? 1 : 0) - (input.keys?.left ? 1 : 0);
    const hasDirectSteer =
      input.steer !== undefined || Math.abs(input.gamepad?.steer ?? 0) > 0.01;

    if (hasDirectSteer) {
      const direct =
        input.steer !== undefined ? input.steer : (input.gamepad?.steer ?? 0);
      smoothedSteer = Math.max(-1, Math.min(1, direct));
    } else if (keySteerTarget !== 0) {
      const slipAwareLimit = 1.0 - 0.34 * speedRatio;
      const target = keySteerTarget * slipAwareLimit;
      const rate = 3.8 * dtSeconds;
      if (smoothedSteer < target) {
        smoothedSteer = Math.min(target, smoothedSteer + rate);
      } else {
        smoothedSteer = Math.max(target, smoothedSteer - rate);
      }
    } else {
      const returnRate = 6.5 * dtSeconds;
      if (Math.abs(smoothedSteer) <= returnRate) {
        smoothedSteer = 0;
      } else {
        smoothedSteer -= Math.sign(smoothedSteer) * returnRate;
      }
    }

    const steerAngleRad = smoothedSteer * MAX_STEER_ANGLE_RAD;
    const absSteerNorm = Math.abs(steerAngleRad) / MAX_STEER_ANGLE_RAD;

    const isTrailBraking =
      kart.speedMps > 2.0 &&
      absSteerNorm > 0.08 &&
      brake >= 0.2 &&
      brake <= 0.72;

    const forwardPitchUnload = isTrailBraking
      ? 0.58
      : brake > 0.72
        ? 0.32
        : throttle > 0.5
          ? -0.12
          : 0.0;

    const rawAxleScrub =
      speedRatio *
      absSteerNorm *
      1.15 *
      Math.max(0.18, 0.92 - forwardPitchUnload);
    const axleScrub = Math.max(0, Math.min(1, rawAxleScrub));

    // Direct-drive electric motor torque curve tapering into hard 45.0 km/h electronic governor
    const torqueFactor = Math.max(0.88, 1 - 0.12 * Math.pow(speedRatio, 1.8));
    const driveAccel = throttle * PEAK_LAUNCH_ACCEL_MPS2 * torqueFactor;

    const coastDrag =
      kart.speedMps > 0.001
        ? (1 - throttle) * MOTOR_DRAG_DECEL_MPS2 + 0.22 * speedRatio * speedRatio
        : 0;
    const scrubDrag = kart.speedMps > 0.5 ? axleScrub * 2.2 : 0;

    const effectiveBrakeDecelFactor = isTrailBraking ? 0.55 : 1.0;
    const brakeDecel =
      kart.speedMps > 0.001
        ? brake * MAX_REAR_BRAKE_DECEL_MPS2 * effectiveBrakeDecelFactor
        : 0;
    const rawAccel = driveAccel - coastDrag - scrubDrag - brakeDecel;

    const prevSpeed = kart.speedMps;
    let nextSpeedMps = Math.max(
      0,
      Math.min(MAX_KART_SPEED_MPS, prevSpeed + rawAccel * dtSeconds),
    );

    const understeerPenalty = 1 - 0.36 * axleScrub;
    const trailRotationBoost =
      isTrailBraking ? 1.28 : brake > 0.85 && absSteerNorm > 0.2 ? 1.35 : 1.0;
    const yawRate =
      nextSpeedMps > 0.05
        ? (nextSpeedMps / WHEELBASE_METERS) *
          Math.tan(steerAngleRad) *
          understeerPenalty *
          trailRotationBoost
        : 0;
    let nextHeading = kart.headingRad + yawRate * dtSeconds;
    const lateralAccelMps2 = nextSpeedMps * yawRate;

    const nextPosition = {
      x: kart.position.x + Math.cos(nextHeading) * nextSpeedMps * dtSeconds,
      z: kart.position.z + Math.sin(nextHeading) * nextSpeedMps * dtSeconds,
    };

    const prevDistance = kart.lapDistanceMeters;
    const prevSector = kart.currentSector;
    const nearest = findNearestCircuitSample(
      circuit.samples,
      nextPosition.x,
      nextPosition.z,
    );

    // Continuous indoor Barrier collision & tangential wall friction
    const relX = nextPosition.x - nearest.center.x;
    const relZ = nextPosition.z - nearest.center.z;
    const lateralOffset = relX * nearest.normal.x + relZ * nearest.normal.z;
    const maxLateral = nearest.widthMeters * 0.5 - KART_HALF_WIDTH_METERS;

    let barrierContact = false;
    let barrierContactCount = kart.barrierContactCount;

    if (Math.abs(lateralOffset) > maxLateral) {
      barrierContact = true;
      const isInitialImpact = !kart.barrierContact;
      if (isInitialImpact) {
        barrierContactCount += 1;
      }
      lap.isClean = false;
      drillIsClean = false;

      const clampedLat = Math.sign(lateralOffset) * (maxLateral - 0.015);
      const alongTang = relX * nearest.tangent.x + relZ * nearest.tangent.z;
      nextPosition.x =
        nearest.center.x +
        nearest.tangent.x * alongTang +
        nearest.normal.x * clampedLat;
      nextPosition.z =
        nearest.center.z +
        nearest.tangent.z * alongTang +
        nearest.normal.z * clampedLat;

      const trackHeading = Math.atan2(nearest.tangent.z, nearest.tangent.x);
      let angleDiff = nextHeading - trackHeading;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const sinImpact = Math.abs(Math.sin(angleDiff));

      if (isInitialImpact) {
        const impactLoss = Math.min(0.55, Math.max(0.06, sinImpact * 0.65));
        nextSpeedMps *= 1 - impactLoss;
      }

      const wallFrictionDecel = (2.6 + sinImpact * 6.0) * dtSeconds;
      nextSpeedMps = Math.max(0, nextSpeedMps - wallFrictionDecel);
      nextHeading = trackHeading + angleDiff * 0.2;
    }

    const actualForwardAccel = (nextSpeedMps - prevSpeed) / Math.max(1e-6, dtSeconds);
    const slipRatio = Math.min(
      1,
      Math.max(
        axleScrub,
        Math.abs(lateralAccelMps2) / 14.0 +
          (brake > 0.8 && absSteerNorm > 0.2 ? 0.35 : 0),
      ),
    );

    tick += 1;
    elapsedSeconds += dtSeconds;
    const nextSpeedKph = nextSpeedMps * 3.6;
    const nextSector = nearest.sector;

    kart = {
      position: nextPosition,
      headingRad: nextHeading,
      speedMps: nextSpeedMps,
      speedKph: nextSpeedKph,
      forwardAccelMps2: actualForwardAccel,
      lateralAccelMps2,
      steerAngleRad,
      steeringWheelAngleRad: steerAngleRad * 2.2,
      throttleInput: throttle,
      brakeInput: brake,
      isTrailBraking,
      axleScrub,
      slipRatio,
      barrierContact,
      barrierContactCount,
      lapDistanceMeters: nearest.distanceMeters,
      lapProgress: nearest.progress,
      currentTurn: resolveTurnAtDistance(nearest.distanceMeters, circuit.turns),
      currentSector: nextSector,
    };

    if (mode === 'Corner Drill') {
      drillCurrentSegmentSeconds += dtSeconds;
      const firstTurn = circuit.turns[activeDrillTarget.turns[0] - 1];
      const lastTurn =
        circuit.turns[activeDrillTarget.turns[activeDrillTarget.turns.length - 1] - 1];

      if (
        drillEntrySpeedKph === null &&
        nearest.distanceMeters >= firstTurn.entryDistanceMeters
      ) {
        drillEntrySpeedKph = nextSpeedKph;
      }

      if (
        nearest.distanceMeters >= firstTurn.entryDistanceMeters &&
        nearest.distanceMeters <= lastTurn.exitDistanceMeters
      ) {
        if (nextSpeedKph < drillMinApexSpeedKph) {
          drillMinApexSpeedKph = nextSpeedKph;
        }
        if (axleScrub > drillPeakAxleScrub) {
          drillPeakAxleScrub = axleScrub;
        }
        if (isTrailBraking) {
          drillSawTrailBraking = true;
        }
      }

      for (const tn of activeDrillTarget.turns) {
        const turnMeta = circuit.turns[tn - 1];
        const insideSign = turnMeta.direction === 'Right' ? 1 : -1;
        const insideFrontTire = {
          x: nextPosition.x + nearest.normal.x * insideSign * 0.13,
          z: nextPosition.z + nearest.normal.z * insideSign * 0.13,
        };
        const distToApex = Math.hypot(
          insideFrontTire.x - turnMeta.apexPoint.x,
          insideFrontTire.z - turnMeta.apexPoint.z,
        );
        const prevMin = drillApexMinDistMeters.get(tn) ?? Infinity;
        if (distToApex < prevMin) {
          drillApexMinDistMeters.set(tn, distToApex);
        }
      }

      if (nearest.distanceMeters >= activeDrillTarget.exitDistanceMeters) {
        finalizeCornerDrillPass(nextSpeedKph);
      }

      return getSnapshot();
    }

    lap.currentLapSeconds += dtSeconds;

    // Record Ghost sample every 3 ticks (~40 Hz) during timed laps
    if (lap.lapNumber >= 1 && tick % 3 === 0) {
      activeLapGhostFrames.push({
        lapSeconds: lap.currentLapSeconds,
        distanceMeters: nearest.distanceMeters,
        position: { ...nextPosition },
        headingRad: nextHeading,
        speedKph: nextSpeedKph,
      });
    }

    // Sector boundary transitions during timed laps
    if (lap.lapNumber >= 1 && nextSector !== prevSector) {
      if (prevSector === 1 && nextSector === 2) {
        const s1Time = lap.currentLapSeconds - sectorEntryLapSeconds;
        lap.currentSectorSplits[0] = s1Time;
        if (
          lap.isClean &&
          (lap.bestSectorSplits[0] === null || s1Time < lap.bestSectorSplits[0])
        ) {
          lap.bestSectorSplits[0] = s1Time;
        }
        sectorEntryLapSeconds = lap.currentLapSeconds;
      } else if (prevSector === 2 && nextSector === 3) {
        const s2Time = lap.currentLapSeconds - sectorEntryLapSeconds;
        lap.currentSectorSplits[1] = s2Time;
        if (
          lap.isClean &&
          (lap.bestSectorSplits[1] === null || s2Time < lap.bestSectorSplits[1])
        ) {
          lap.bestSectorSplits[1] = s2Time;
        }
        sectorEntryLapSeconds = lap.currentLapSeconds;
      }
    }

    // Start / Finish line crossing (wrapping from end of circuit > 200m to start < 40m)
    if (prevDistance > 200 && nearest.distanceMeters < 40) {
      if (lap.lapNumber >= 1) {
        const finishedLapSeconds = lap.currentLapSeconds;
        const s1 = lap.currentSectorSplits[0] ?? finishedLapSeconds * 0.32;
        const s2 = lap.currentSectorSplits[1] ?? finishedLapSeconds * 0.38;
        const s3 = Math.max(0.1, finishedLapSeconds - s1 - s2);
        lap.currentSectorSplits[2] = s3;
        lap.lastSectorSplits = [s1, s2, s3];
        lap.lastLapSeconds = finishedLapSeconds;

        if (lap.isClean) {
          if (lap.bestSectorSplits[2] === null || s3 < lap.bestSectorSplits[2]) {
            lap.bestSectorSplits[2] = s3;
          }
          if (
            lap.personalBestSeconds === null ||
            finishedLapSeconds < lap.personalBestSeconds
          ) {
            lap.personalBestSeconds = finishedLapSeconds;
            personalBestGhostFrames = [
              ...activeLapGhostFrames,
              {
                lapSeconds: finishedLapSeconds,
                distanceMeters: circuit.totalLengthMeters,
                position: { ...nextPosition },
                headingRad: nextHeading,
                speedKph: nextSpeedKph,
              },
            ];
          }
          saveToStorage();
        }
      }

      lap.lapNumber += 1;
      lap.currentLapSeconds = 0;
      lap.isClean = !barrierContact;
      lap.currentSectorSplits = [null, null, null];
      sectorEntryLapSeconds = 0;
      activeLapGhostFrames = [
        {
          lapSeconds: 0,
          distanceMeters: nearest.distanceMeters,
          position: { ...nextPosition },
          headingRad: nextHeading,
          speedKph: nextSpeedKph,
        },
      ];
    }

    return getSnapshot();
  }

  function toggleCamera(): SessionSnapshot {
    cameraMode = cameraMode === 'Chase Cam' ? 'Helmet Cam' : 'Chase Cam';
    return getSnapshot();
  }

  function toggleRacingLine(): SessionSnapshot {
    racingLineVisible = !racingLineVisible;
    return getSnapshot();
  }

  function cycleGhostMode(): SessionSnapshot {
    const order: GhostMode[] = ['Track Record', 'Personal Best', 'Both', 'Off'];
    const nextIdx = (order.indexOf(ghostMode) + 1) % order.length;
    ghostMode = order[nextIdx];
    return getSnapshot();
  }

  function setPracticeMode(nextMode: PracticeMode): SessionSnapshot {
    if (mode === nextMode) {
      return getSnapshot();
    }
    mode = nextMode;
    if (mode === 'Corner Drill') {
      spawnAtDrillFlyingEntry();
    } else {
      spawnAtTimeTrialFlyingStart();
    }
    return getSnapshot();
  }

  function selectDrillTarget(targetId: DrillTargetId): SessionSnapshot {
    const found = drillCatalog.find((d) => d.id === targetId);
    if (found) {
      activeDrillTarget = found;
    }
    mode = 'Corner Drill';
    spawnAtDrillFlyingEntry();
    return getSnapshot();
  }

  function reset(): SessionSnapshot {
    if (mode === 'Corner Drill') {
      spawnAtDrillFlyingEntry();
    } else {
      spawnAtTimeTrialFlyingStart();
    }
    return getSnapshot();
  }

  function exportTrainingDataJson(): string {
    const payload: PersistedTrainingData = {
      version: 1,
      personalBestSeconds: lap.personalBestSeconds,
      bestSectorSplits: [...lap.bestSectorSplits] as SectorSplitsTuple,
      personalBestGhostFrames,
      drillPersonalBests: { ...drillPersonalBests },
    };
    return JSON.stringify(payload, null, 2);
  }

  function applyImportedData(json: string): void {
    const parsed = JSON.parse(json) as Partial<PersistedTrainingData>;
    if (typeof parsed.personalBestSeconds === 'number' || parsed.personalBestSeconds === null) {
      lap.personalBestSeconds = parsed.personalBestSeconds ?? null;
    }
    if (Array.isArray(parsed.bestSectorSplits) && parsed.bestSectorSplits.length === 3) {
      lap.bestSectorSplits = [
        parsed.bestSectorSplits[0] ?? null,
        parsed.bestSectorSplits[1] ?? null,
        parsed.bestSectorSplits[2] ?? null,
      ];
    }
    if (Array.isArray(parsed.personalBestGhostFrames)) {
      personalBestGhostFrames = parsed.personalBestGhostFrames;
    }
    if (parsed.drillPersonalBests && typeof parsed.drillPersonalBests === 'object') {
      drillPersonalBests = { ...parsed.drillPersonalBests };
    }
  }

  function importTrainingDataJson(json: string): SessionSnapshot {
    applyImportedData(json);
    saveToStorage();
    return getSnapshot();
  }

  function getSnapshot(): SessionSnapshot {
    const racingLine = evaluateLiveRacingLine(
      circuit,
      kart.lapDistanceMeters,
      kart.speedMps,
      racingLineVisible,
    );

    const ptIdx =
      Math.floor(kart.lapProgress * racingLine.points.length) %
      racingLine.points.length;
    const refBenchmarkSeconds = racingLine.points[ptIdx].benchmarkTimeSeconds;
    const liveDelta =
      lap.lapNumber >= 1 ? lap.currentLapSeconds - refBenchmarkSeconds : 0;
    lap.timeDeltaSeconds = liveDelta;

    const showTrackRecord =
      ghostMode === 'Track Record' || ghostMode === 'Both';
    const showPersonalBest =
      ghostMode === 'Personal Best' || ghostMode === 'Both';

    const ghost: GhostState = {
      mode: ghostMode,
      trackRecordPose: showTrackRecord
        ? sampleTrackRecordGhostPose(
            racingLine.points,
            racingLine.benchmarkLapSeconds,
            lap.lapNumber >= 1 ? lap.currentLapSeconds : elapsedSeconds,
          )
        : null,
      personalBestPose: showPersonalBest
        ? samplePersonalBestGhostPose(
            personalBestGhostFrames,
            lap.lapNumber >= 1 ? lap.currentLapSeconds : elapsedSeconds,
          )
        : null,
    };

    const drill: DrillState = {
      target: activeDrillTarget,
      availableTargets: drillCatalog,
      runNumber: drillRunNumber,
      currentSegmentSeconds: drillCurrentSegmentSeconds,
      isClean: drillIsClean,
      personalBests: { ...drillPersonalBests },
      lastExecutionCard: lastExecutionCard ? { ...lastExecutionCard } : null,
    };

    return {
      tick,
      elapsedSeconds,
      mode,
      circuit,
      kart: {
        ...kart,
        position: { ...kart.position },
      },
      camera: computeCameraState(kart, cameraMode),
      lap: {
        ...lap,
        currentSectorSplits: [...lap.currentSectorSplits] as SectorSplitsTuple,
        lastSectorSplits: [...lap.lastSectorSplits] as SectorSplitsTuple,
        bestSectorSplits: [...lap.bestSectorSplits] as SectorSplitsTuple,
      },
      racingLine,
      ghost,
      drill,
    };
  }

  return {
    step,
    toggleCamera,
    toggleRacingLine,
    cycleGhostMode,
    setPracticeMode,
    selectDrillTarget,
    reset,
    exportTrainingDataJson,
    importTrainingDataJson,
    getSnapshot,
  };
}

