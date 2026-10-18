import {
  CURRENT_TRAINING_REVISION,
  parseTrainingData,
  sameRevision,
  summarizeTrainingRecords,
  TrainingRecords,
  TrainingRevision,
  PersistedTrainingData,
} from './training-data';
import { buildK1TorontoCircuit, wrapAngleRad } from './circuit';
import { evaluateLiveRacingLine } from './racing-line';
import {
  CameraMode,
  CameraState,
  CircuitData,
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
  TimeTrialState,
  Vector2D,
} from './types';

import {
  FIXED_TIMESTEP_SECONDS,
  MAX_KART_SPEED_MPS,
  FLYING_START_SPEED_KPH,
  FLYING_START_SPEED_MPS,
  FLYING_START_DISTANCE_METERS,
  WHEELBASE_METERS,
} from './kart-parameters';
import { stepKartOnCircuit } from './kart-world';
export {
  FIXED_TIMESTEP_SECONDS, MAX_KART_SPEED_KPH, MAX_KART_SPEED_MPS,
  FLYING_START_SPEED_KPH, FLYING_START_SPEED_MPS, FLYING_START_DISTANCE_METERS,
} from './kart-parameters';

const STORAGE_KEY = 'apex-bite:training-data:v2';
const LEGACY_STORAGE_KEY = 'apex-bite:training-data:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type { PersistedTrainingData } from './training-data';

export interface SimulationSessionOptions {
  storage?: StorageLike;
  trainingRevision?: TrainingRevision;
}

export interface SimulationSession {
  step(dtSeconds?: number, input?: DriverInput): SessionSnapshot;
  toggleCamera(): SessionSnapshot;
  toggleRacingLine(): SessionSnapshot;
  cycleGhostMode(): SessionSnapshot;
  setPracticeMode(mode: PracticeMode): SessionSnapshot;
  setTimeTrialLapLimit(lapLimit: number | null): SessionSnapshot;
  selectDrillTarget(targetId: DrillTargetId): SessionSnapshot;
  reset(): SessionSnapshot;
  exportTrainingDataJson(): string;
  importTrainingDataJson(json: string): SessionSnapshot;
  getSnapshot(): SessionSnapshot;
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

function interpolateGhostPose(
  aPos: Vector2D,
  bPos: Vector2D,
  aHeading: number,
  bHeading: number,
  aSpeedKph: number,
  bSpeedKph: number,
  ratio: number,
): GhostPose {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    position: {
      x: aPos.x + (bPos.x - aPos.x) * clamped,
      z: aPos.z + (bPos.z - aPos.z) * clamped,
    },
    headingRad: aHeading + wrapAngleRad(bHeading - aHeading) * clamped,
    speedKph: aSpeedKph + (bSpeedKph - aSpeedKph) * clamped,
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
  return interpolateGhostPose(
    a.position,
    b.position,
    a.headingRad,
    b.headingRad,
    a.targetSpeedKph,
    b.targetSpeedKph,
    (t - a.benchmarkTimeSeconds) / span,
  );
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
  return interpolateGhostPose(
    a.position,
    b.position,
    a.headingRad,
    b.headingRad,
    a.speedKph,
    b.speedKph,
    (t - a.lapSeconds) / span,
  );
}

function samplePersonalBestSecondsAtDistance(
  frames: GhostSampleFrame[],
  distanceMeters: number,
): number | null {
  if (frames.length < 2) return null;
  let idx = 0;
  while (idx < frames.length - 2 && frames[idx + 1].distanceMeters <= distanceMeters) {
    idx++;
  }
  const a = frames[idx];
  const b = frames[Math.min(frames.length - 1, idx + 1)];
  const span = Math.max(1e-6, b.distanceMeters - a.distanceMeters);
  const ratio = Math.max(0, Math.min(1, (distanceMeters - a.distanceMeters) / span));
  return a.lapSeconds + (b.lapSeconds - a.lapSeconds) * ratio;
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
  const trainingRevision = { ...(options.trainingRevision ?? CURRENT_TRAINING_REVISION) };
  let legacyRecords: TrainingRecords[] = [];
  let persistence: 'memory' | 'saved' | 'error' = storage ? 'saved' : 'memory';
  let persistenceMessage: string | null = null;

  let tick = 0;
  let elapsedSeconds = 0;
  let accumulatedStepSeconds = 0;
  let mode: PracticeMode = 'Time Trial';
  let cameraMode: CameraMode = 'Chase Cam';
  let racingLineVisible = true;
  let ghostMode: GhostMode = 'Track Record';

  // Progressive keyboard input shaper state
  let keyboardBrakeHoldSeconds = 0;
  let keyboardSteerHoldSeconds = 0;
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

  let timeTrial: TimeTrialState = {
    lapLimit: 12,
    status: 'Flying Start',
    completedLaps: [],
    totalSeconds: 0,
    bestCleanLapSeconds: null,
  };

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
    velocity: { x: Math.cos(initialHeading) * FLYING_START_SPEED_MPS, z: Math.sin(initialHeading) * FLYING_START_SPEED_MPS },
    yawRateRadPerSecond: 0,
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
    unwrappedDistanceMeters: startSample.distanceMeters,
    lapProgress: startSample.progress,
    currentTurn: resolveTurnAtDistance(startSample.distanceMeters, circuit.turns),
    currentSector: startSample.sector,
  };

  function spawnAtTimeTrialFlyingStart(): void {
    timeTrial = { ...timeTrial, status: 'Flying Start', completedLaps: [], totalSeconds: 0, bestCleanLapSeconds: null };
    lap.lastLapSeconds = null;
    lap.lastSectorSplits = [null, null, null];
    keyboardBrakeHoldSeconds = 0;
    keyboardSteerHoldSeconds = 0;
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
    velocity: { x: Math.cos(initialHeading) * FLYING_START_SPEED_MPS, z: Math.sin(initialHeading) * FLYING_START_SPEED_MPS },
    yawRateRadPerSecond: 0,
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
    unwrappedDistanceMeters: startSample.distanceMeters,
      lapProgress: startSample.progress,
      currentTurn: resolveTurnAtDistance(startSample.distanceMeters, circuit.turns),
      currentSector: startSample.sector,
    };
  }

  function spawnAtDrillFlyingEntry(): void {
    keyboardBrakeHoldSeconds = 0;
    keyboardSteerHoldSeconds = 0;
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
      velocity: { x: Math.cos(entryLinePt.headingRad) * entryLinePt.targetSpeedMps, z: Math.sin(entryLinePt.headingRad) * entryLinePt.targetSpeedMps },
      yawRateRadPerSecond: 0,
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
      unwrappedDistanceMeters: sample.distanceMeters,
      lapProgress: sample.progress,
      currentTurn: resolveTurnAtDistance(sample.distanceMeters, circuit.turns),
      currentSector: sample.sector,
    };
  }

  function loadFromStorage(): void {
    if (!storage) return;
    try {
      const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      applyImportedData(raw);
    } catch {
      persistence = 'error';
      persistenceMessage = 'Saved training data could not be loaded. The original storage has been retained.';
    }
  }

  function saveToStorage(): void {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, exportTrainingDataJson());
      persistence = 'saved';
      persistenceMessage = null;
    } catch {
      persistence = 'error';
      persistenceMessage = 'Storage could not save your records. Export JSON to keep this session’s new records.';
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
    const deltaToPersonalBestSeconds =
      prevBest !== null
        ? segmentTimeSeconds - prevBest
        : drillIsClean
          ? 0
          : null;

    let personalBestSeconds = prevBest;
    if (drillIsClean && (prevBest === null || segmentTimeSeconds < prevBest)) {
      personalBestSeconds = segmentTimeSeconds;
      drillPersonalBests[activeDrillTarget.id] = segmentTimeSeconds;
      saveToStorage();
    }

    const deltaToBenchmarkSeconds =
      segmentTimeSeconds - activeDrillTarget.benchmarkTimeSeconds;

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
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0 || dtSeconds > 1) {
      throw new RangeError('Simulation interval must be finite and between zero and one second.');
    }
    if (mode === 'Time Trial' && timeTrial.status === 'Finished') return getSnapshot();
    accumulatedStepSeconds += dtSeconds;
    while (accumulatedStepSeconds >= FIXED_TIMESTEP_SECONDS - 1e-12) {
      fixedStep(FIXED_TIMESTEP_SECONDS, input);
      accumulatedStepSeconds = Math.max(0, accumulatedStepSeconds - FIXED_TIMESTEP_SECONDS);
      if (mode === 'Time Trial' && timeTrial.status === 'Finished') {
        accumulatedStepSeconds = 0;
        break;
      }
    }
    return getSnapshot();
  }

  function fixedStep(dtSeconds: number, input: DriverInput): SessionSnapshot {
    if (mode === 'Time Trial' && timeTrial.status === 'Finished') return getSnapshot();
    const finiteInput = (value: number | undefined): number => Number.isFinite(value) ? value! : 0;
    const keyThrottle = input.keys?.up ? 1 : 0;
    const gpThrottle = finiteInput(input.gamepad?.throttle);
    const throttle = Math.max(
      0,
      Math.min(1, Math.max(finiteInput(input.throttle), keyThrottle, gpThrottle)),
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

    const gpBrake = finiteInput(input.gamepad?.brake);
    const brake = fullBrake
      ? 1.0
      : Math.max(0, Math.min(1, Math.max(finiteInput(input.brake), shapedKeyBrake, gpBrake)));

    // Slip-aware progressive steering for keyboard (with tight-hairpin hold release) vs direct analog input
    const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
    const keySteerTarget = (input.keys?.right ? 1 : 0) - (input.keys?.left ? 1 : 0);
    const gpDeadzone = input.gamepad?.deadzone ?? 0.06;
    const rawGpSteer = finiteInput(input.gamepad?.steer);
    const gpSteer = Math.abs(rawGpSteer) > gpDeadzone ? rawGpSteer : 0;
    const hasDirectSteer = input.steer !== undefined || Math.abs(gpSteer) > 0;

    if (hasDirectSteer) {
      keyboardSteerHoldSeconds = 0;
      const direct = input.steer !== undefined ? finiteInput(input.steer) : gpSteer;
      smoothedSteer = Math.max(-1, Math.min(1, direct));
    } else if (keySteerTarget !== 0) {
      keyboardSteerHoldSeconds += dtSeconds;
      const hairpinRelease =
        keyboardSteerHoldSeconds > 0.32
          ? Math.min(1, (keyboardSteerHoldSeconds - 0.32) / 0.25)
          : 0;
      const baseSlipLimit = 1.0 - 0.34 * speedRatio;
      const slipAwareLimit = baseSlipLimit + (1.0 - baseSlipLimit) * hairpinRelease;
      const target = keySteerTarget * slipAwareLimit;
      const rate = 3.8 * dtSeconds;
      if (smoothedSteer < target) {
        smoothedSteer = Math.min(target, smoothedSteer + rate);
      } else {
        smoothedSteer = Math.max(target, smoothedSteer - rate);
      }
    } else {
      keyboardSteerHoldSeconds = 0;
      const returnRate = 6.5 * dtSeconds;
      if (Math.abs(smoothedSteer) <= returnRate) {
        smoothedSteer = 0;
      } else {
        smoothedSteer -= Math.sign(smoothedSteer) * returnRate;
      }
    }

    const prevSector = kart.currentSector;
    const previousDistance = kart.lapDistanceMeters;
    kart = stepKartOnCircuit(circuit, kart, { throttle, brake, steer: smoothedSteer }, dtSeconds);
    const nextPosition = kart.position;
    const nextHeading = kart.headingRad;
    const nextSpeedKph = kart.speedKph;
    const nextSector = kart.currentSector;
    const { axleScrub, isTrailBraking, barrierContact } = kart;
    const nearest = { distanceMeters: kart.lapDistanceMeters, progress: kart.lapProgress };
    if (barrierContact) {
      lap.isClean = false;
      drillIsClean = false;
    }
    tick += 1;
    elapsedSeconds += dtSeconds;

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

      const fwdX = Math.cos(nextHeading);
      const fwdZ = Math.sin(nextHeading);
      const rightX = -fwdZ;
      const rightZ = fwdX;
      for (const tn of activeDrillTarget.turns) {
        const turnMeta = circuit.turns[tn - 1];
        const insideSign = turnMeta.direction === 'Right' ? 1 : -1;
        const insideFrontTire = {
          x:
            nextPosition.x +
            fwdX * (WHEELBASE_METERS * 0.5) +
            rightX * insideSign * 0.42,
          z:
            nextPosition.z +
            fwdZ * (WHEELBASE_METERS * 0.5) +
            rightZ * insideSign * 0.42,
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

    if (lap.lapNumber >= 1) lap.currentLapSeconds += dtSeconds;

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
    if (previousDistance > circuit.totalLengthMeters * 0.8 && nearest.distanceMeters < circuit.totalLengthMeters * 0.2) {
      if (lap.lapNumber >= 1) {
        const finishedLapSeconds = lap.currentLapSeconds;
        const s1 = lap.currentSectorSplits[0] ?? finishedLapSeconds * 0.32;
        const s2 = lap.currentSectorSplits[1] ?? finishedLapSeconds * 0.38;
        const s3 = Math.max(0.1, finishedLapSeconds - s1 - s2);
        lap.currentSectorSplits[2] = s3;
        lap.lastSectorSplits = [s1, s2, s3];
        lap.lastLapSeconds = finishedLapSeconds;
        timeTrial.completedLaps.push({
          lapNumber: lap.lapNumber,
          seconds: finishedLapSeconds,
          isClean: lap.isClean,
          sectorSplits: [s1, s2, s3],
        });
        timeTrial.totalSeconds += finishedLapSeconds;
        if (lap.isClean && (timeTrial.bestCleanLapSeconds === null || finishedLapSeconds < timeTrial.bestCleanLapSeconds)) {
          timeTrial.bestCleanLapSeconds = finishedLapSeconds;
        }

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

      if (timeTrial.lapLimit !== null && timeTrial.completedLaps.length >= timeTrial.lapLimit) {
        timeTrial.status = 'Finished';
        return getSnapshot();
      }
      timeTrial.status = 'Driving';
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
    accumulatedStepSeconds = 0;
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

  function setTimeTrialLapLimit(lapLimit: number | null): SessionSnapshot {
    if (lapLimit !== null && (!Number.isInteger(lapLimit) || lapLimit < 1 || lapLimit > 99)) {
      throw new RangeError('Choose 1–99 timed laps or unlimited practice.');
    }
    if (timeTrial.lapLimit !== lapLimit) {
      accumulatedStepSeconds = 0;
      timeTrial.lapLimit = lapLimit;
      if (mode === 'Time Trial') spawnAtTimeTrialFlyingStart();
    }
    return getSnapshot();
  }

  function selectDrillTarget(targetId: DrillTargetId): SessionSnapshot {
    accumulatedStepSeconds = 0;
    const found = drillCatalog.find((d) => d.id === targetId);
    if (found) {
      activeDrillTarget = found;
    }
    mode = 'Corner Drill';
    spawnAtDrillFlyingEntry();
    return getSnapshot();
  }

  function reset(): SessionSnapshot {
    accumulatedStepSeconds = 0;
    if (mode === 'Corner Drill') {
      spawnAtDrillFlyingEntry();
    } else {
      spawnAtTimeTrialFlyingStart();
    }
    return getSnapshot();
  }

  function currentTrainingRecords(): TrainingRecords {
    return {
      revision: { ...trainingRevision },
      personalBestSeconds: lap.personalBestSeconds,
      bestSectorSplits: [...lap.bestSectorSplits] as SectorSplitsTuple,
      personalBestGhostFrames,
      drillPersonalBests: { ...drillPersonalBests },
    };
  }

  function exportTrainingDataJson(): string {
    const payload: PersistedTrainingData = {
      version: 2,
      records: [currentTrainingRecords(), ...legacyRecords],
    };
    return JSON.stringify(payload, null, 2);
  }

  function mergedTrainingRecords(incoming: TrainingRecords[]): TrainingRecords[] {
    const existing = [currentTrainingRecords(), ...legacyRecords];
    return [
      ...incoming,
      ...existing.filter((record) => !incoming.some((item) => sameRevision(item.revision, record.revision))),
    ];
  }

  function applyTrainingRecords(records: TrainingRecords[]): void {
    const current = records.find((record) => sameRevision(record.revision, trainingRevision));
    legacyRecords = records.filter((record) => !sameRevision(record.revision, trainingRevision));
    if (current) {
      lap.personalBestSeconds = current.personalBestSeconds;
      lap.bestSectorSplits = current.bestSectorSplits;
      personalBestGhostFrames = current.personalBestGhostFrames;
      drillPersonalBests = current.drillPersonalBests;
    }
  }

  function applyImportedData(json: string): void {
    applyTrainingRecords(mergedTrainingRecords(parseTrainingData(json)));
  }

  function importTrainingDataJson(json: string): SessionSnapshot {
    // Parse and validate every record before committing anything to storage or live comparisons.
    const candidate = mergedTrainingRecords(parseTrainingData(json));
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, records: candidate }));
      } catch {
        persistence = 'error';
        persistenceMessage = 'Storage rejected the import. No records were changed.';
        throw new Error(persistenceMessage);
      }
    }
    applyTrainingRecords(candidate);
    persistence = storage ? 'saved' : 'memory';
    persistenceMessage = null;
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
    const pbAtDist =
      ghostMode === 'Personal Best'
        ? samplePersonalBestSecondsAtDistance(
            personalBestGhostFrames,
            kart.lapDistanceMeters,
          )
        : null;
    const refBenchmarkSeconds =
      pbAtDist ?? racingLine.points[ptIdx].benchmarkTimeSeconds;
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
        velocity: { ...kart.velocity },
      },
      camera: computeCameraState(kart, cameraMode),
      lap: {
        ...lap,
        currentSectorSplits: [...lap.currentSectorSplits] as SectorSplitsTuple,
        lastSectorSplits: [...lap.lastSectorSplits] as SectorSplitsTuple,
        bestSectorSplits: [...lap.bestSectorSplits] as SectorSplitsTuple,
      },
      timeTrial: {
        ...timeTrial,
        completedLaps: timeTrial.completedLaps.map((completed) => ({
          ...completed,
          sectorSplits: [...completed.sectorSplits] as SectorSplitsTuple,
        })),
      },
      racingLine,
      ghost,
      drill,
      trainingData: {
        revision: { ...trainingRevision },
        current: summarizeTrainingRecords(currentTrainingRecords()),
        legacy: legacyRecords.map(summarizeTrainingRecords),
        persistence,
        message: persistenceMessage,
      },
    };
  }

  return {
    step,
    toggleCamera,
    toggleRacingLine,
    cycleGhostMode,
    setPracticeMode,
    setTimeTrialLapLimit,
    selectDrillTarget,
    reset,
    exportTrainingDataJson,
    importTrainingDataJson,
    getSnapshot,
  };
}

