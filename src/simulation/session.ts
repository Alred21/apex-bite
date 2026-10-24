import { createKeyboardAssistance } from './keyboard-assistance';
import { buildReferenceLap, cloneKartState, referenceStateAtDistance, referenceApexTarget, referenceTimeAtDistance, referencePoseAtTime, type ReferenceReplay } from './reference-lap';
import { insideFrontTirePosition } from './kart-geometry';
import { buildReferenceDrills, drillReferenceRevision, evaluateDrillCoaching } from './corner-drill';
import { createCameraPresentation } from './camera';
import {
  CURRENT_TRAINING_REVISION,
  parseTrainingData,
  sameRevision,
  summarizeTrainingRecords, alignDrillReference, type LegacyDrillPersonalBests,
  TrainingRecords,
  TrainingRevision,
  PersistedTrainingData,
} from './training-data';
import { buildK1TorontoCircuit, wrapAngleRad } from './circuit';
import { evaluateLiveRacingLine } from './racing-line';
import {
  CameraMode,
  CameraSettings,
  CornerExecutionCard,
  DrillState,
  DrillTargetDefinition,
  DrillTargetId,
  DriverInput,
  GhostMode,
  GhostPose,
  GhostSampleFrame,
  GhostState,
  KeyboardAssistanceSettings,
  LapSummaryState,
  PracticeMode,
  RacingLineDisplayMode,
  SectorSplitsTuple,
  SessionSnapshot,
  TurnNumber,
  TimeTrialState,
  Vector2D,
} from './types';

import {
  FIXED_TIMESTEP_SECONDS,
  FLYING_START_APPROACH_METERS,
  MAX_STEER_ANGLE_RAD,
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
  /** Start at the retained Reference Lap's complete initial state for deterministic playback. */
  referenceReplay?: boolean;
}

export interface SimulationSession {
  step(dtSeconds?: number, input?: DriverInput): SessionSnapshot;
  toggleCamera(): SessionSnapshot;
  setCameraSettings(settings: Partial<CameraSettings>): SessionSnapshot;
  setKeyboardAssistance(settings: Partial<KeyboardAssistanceSettings>): SessionSnapshot;
  toggleRacingLine(): SessionSnapshot;
  cycleGhostMode(): SessionSnapshot;
  setPracticeMode(mode: PracticeMode): SessionSnapshot;
  setTimeTrialLapLimit(lapLimit: number | null): SessionSnapshot;
  selectDrillTarget(targetId: DrillTargetId): SessionSnapshot;
  reset(): SessionSnapshot;
  releaseDriverInputs(): SessionSnapshot;
  exportTrainingDataJson(): string;
  importTrainingDataJson(json: string): SessionSnapshot;
  getSnapshot(): SessionSnapshot;
  /** Portable exact 120 Hz analog input tape plus observed poses; callers receive a copy. */
  getReferenceReplay(): ReferenceReplay;
}

function interpolateGhostPose(
  aPos: Vector2D,
  bPos: Vector2D,
  aHeading: number,
  bHeading: number,
  aSpeedKph: number,
  bSpeedKph: number,
  ratio: number,
  aSteer = 0,
  bSteer = 0,
): GhostPose {
  const clamped = Math.max(0, Math.min(1, ratio));
  const steerAngleRad = aSteer + (bSteer - aSteer) * clamped;
  return {
    position: {
      x: aPos.x + (bPos.x - aPos.x) * clamped,
      z: aPos.z + (bPos.z - aPos.z) * clamped,
    },
    headingRad: aHeading + wrapAngleRad(bHeading - aHeading) * clamped,
    speedKph: aSpeedKph + (bSpeedKph - aSpeedKph) * clamped,
    steerAngleRad,
    steeringWheelAngleRad: steerAngleRad * 2.2,
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
  // Historical tapes have no steering channel. Approximate it from the signed
  // path curvature for presentation only; never rewrite the replay trajectory.
  const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
  const distance = Math.hypot(dx, dz);
  const direction = Math.sign(dx * Math.cos(a.headingRad) + dz * Math.sin(a.headingRad));
  const inferredSteer = distance < .01 || direction === 0 ? 0 : Math.max(-MAX_STEER_ANGLE_RAD, Math.min(MAX_STEER_ANGLE_RAD,
    Math.atan(WHEELBASE_METERS * wrapAngleRad(b.headingRad - a.headingRad) / (distance * direction))));
  return interpolateGhostPose(
    a.position,
    b.position,
    a.headingRad,
    b.headingRad,
    a.speedKph,
    b.speedKph,
    (t - a.lapSeconds) / span,
    a.steerAngleRad ?? inferredSteer,
    b.steerAngleRad ?? inferredSteer,
  );
}

function samplePersonalBestSecondsAtDistance(
  frames: GhostSampleFrame[],
  distanceMeters: number,
): number | null {
  if (frames.length < 2) return null;
  // Time playback remains valid after recovery; distance lookup is ambiguous when
  // the tape visits a Circuit station more than once. Do not invent a delta.
  if (frames.some((frame, index) => index > 0 && frame.distanceMeters <= frames[index - 1].distanceMeters)) return null;
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

export function createSimulationSession(
  options: SimulationSessionOptions = {},
): SimulationSession {
  const circuit = buildK1TorontoCircuit();
  const reference = buildReferenceLap(circuit);
  const referenceApexTargets = new Map(circuit.turns.map((turn) => [turn.number, referenceApexTarget(circuit, reference, turn.number)]));
  const flyingStartState = referenceStateAtDistance(reference, circuit.totalLengthMeters - FLYING_START_APPROACH_METERS);
  const referenceDrills = buildReferenceDrills(circuit, reference);
  const drillCatalog = referenceDrills.map((drill) => drill.target);
  const drillReference = drillReferenceRevision(referenceDrills);

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
  const cameraPresentation = createCameraPresentation();
  let racingLineDisplayMode: RacingLineDisplayMode = 'Full';
  let ghostMode: GhostMode = 'Reference Lap';

  const keyboardAssistance = createKeyboardAssistance();

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
  let legacyDrillPersonalBests: LegacyDrillPersonalBests[] = [];
  let lastExecutionCard: CornerExecutionCard | null = null;

  // Per-pass telemetry accumulators for Corner Drill
  let drillEntrySpeedKph: number | null = null;
  let drillMinApexSpeedKph = Infinity;
  let drillPeakAxleScrub = 0;
  let drillExcessScrubSeconds = 0;
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

  let kart = cloneKartState(options.referenceReplay ? reference.initialState : flyingStartState);
  let lapStartProgressMeters = kart.unwrappedDistanceMeters - kart.lapDistanceMeters;
  let furthestProgressMeters = kart.unwrappedDistanceMeters;
  if (options.referenceReplay) {
    lap.lapNumber = 1;
    timeTrial.status = 'Driving';
  }

  function spawnAtTimeTrialFlyingStart(): void {
    timeTrial = { ...timeTrial, status: 'Flying Start', completedLaps: [], totalSeconds: 0, bestCleanLapSeconds: null };
    lap.lastLapSeconds = null;
    lap.lastSectorSplits = [null, null, null];
    keyboardAssistance.reset();
    sectorEntryLapSeconds = 0;
    activeLapGhostFrames = [];
    lap.isClean = true;
    lap.currentLapSeconds = 0;
    lap.lapNumber = 0;
    lap.currentSectorSplits = [null, null, null];

    kart = cloneKartState(options.referenceReplay ? reference.initialState : flyingStartState);
    if (options.referenceReplay) { lap.lapNumber = 1; timeTrial.status = 'Driving'; }
    lapStartProgressMeters = kart.unwrappedDistanceMeters - kart.lapDistanceMeters;
    furthestProgressMeters = kart.unwrappedDistanceMeters;
    cameraPresentation.reset(kart);
  }

  function spawnAtDrillFlyingEntry(): void {
    keyboardAssistance.reset();
    drillCurrentSegmentSeconds = 0;
    drillIsClean = true;
    drillEntrySpeedKph = null;
    drillMinApexSpeedKph = Infinity;
    drillPeakAxleScrub = 0;
    drillExcessScrubSeconds = 0;
    drillApexMinDistMeters = new Map<TurnNumber, number>();
    for (const tn of activeDrillTarget.turns) {
      drillApexMinDistMeters.set(tn, Infinity);
    }

    kart = cloneKartState(referenceDrills.find((drill) => drill.target.id === activeDrillTarget.id)!.initialState);
    furthestProgressMeters = kart.unwrappedDistanceMeters;
    cameraPresentation.reset(kart);
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
    const activeReferenceDrill = referenceDrills.find((drill) => drill.target.id === activeDrillTarget.id)!;
    const entrySpeedKph =
      drillEntrySpeedKph ?? activeDrillTarget.targetEntrySpeedKph;
    const minApexSpeedKph = Number.isFinite(drillMinApexSpeedKph)
      ? drillMinApexSpeedKph
      : Math.min(entrySpeedKph, exitSpeedKph);

    const turnApexProximities = activeDrillTarget.turns.map((turnNumber) => ({
      turnNumber,
      distanceCm: Number.isFinite(drillApexMinDistMeters.get(turnNumber)) ? Math.round(drillApexMinDistMeters.get(turnNumber)! * 1000) / 10 : null,
      referenceTarget: { ...referenceApexTargets.get(turnNumber)! },
    }));
    const apexProximityCm = turnApexProximities.some((turn) => turn.distanceCm === null) ? null : Math.max(...turnApexProximities.map((turn) => turn.distanceCm!));

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

    const coaching = evaluateDrillCoaching({
      target: activeDrillTarget, isClean: drillIsClean, seconds: segmentTimeSeconds,
      minimumSpeedKph: minApexSpeedKph, peakScrub: drillPeakAxleScrub,
      referencePeakScrub: activeReferenceDrill.referencePeakAxleScrub,
      excessScrubSeconds: drillExcessScrubSeconds, turnApexProximities,
    });

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
      turnApexProximities,
      peakAxleScrub: drillPeakAxleScrub,
      referencePeakAxleScrub: activeReferenceDrill.referencePeakAxleScrub,
      excessScrubSeconds: drillExcessScrubSeconds,
      coachingCategory: coaching.category,
      coachingInsight: coaching.insight,
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

  function fixedStep(dtSeconds: number, input: DriverInput): void {
    if (mode === 'Time Trial' && timeTrial.status === 'Finished') return;
    const command = keyboardAssistance.step(input, kart.speedMps, dtSeconds);

    const previousProgress = kart.unwrappedDistanceMeters;
    const previousDistance = kart.lapDistanceMeters;
    kart = stepKartOnCircuit(circuit, kart, command, dtSeconds);
    furthestProgressMeters = Math.max(furthestProgressMeters, kart.unwrappedDistanceMeters);
    const nextPosition = kart.position;
    const nextHeading = kart.headingRad;
    const nextSpeedKph = kart.speedKph;
    const { axleScrub, barrierContact } = kart;
    const nearest = { distanceMeters: kart.lapDistanceMeters, progress: kart.lapProgress };
    if (barrierContact) {
      lap.isClean = false;
      drillIsClean = false;
    }
    tick += 1;
    elapsedSeconds += dtSeconds;

    cameraPresentation.step(kart, dtSeconds);

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
        if (axleScrub > referenceDrills.find((drill) => drill.target.id === activeDrillTarget.id)!.referencePeakAxleScrub + 0.1) {
          drillExcessScrubSeconds += dtSeconds;
        }
      }

      for (const tn of activeDrillTarget.turns) {
        const turn = circuit.turns[tn - 1];
        if (kart.lapDistanceMeters < turn.entryDistanceMeters || kart.lapDistanceMeters > turn.exitDistanceMeters) continue;
        const tire = insideFrontTirePosition(kart, turn.direction);
        const target = referenceApexTargets.get(tn)!;
        const distance = Math.hypot(tire.x - target.x, tire.z - target.z);
        if (distance < (drillApexMinDistMeters.get(tn) ?? Infinity)) drillApexMinDistMeters.set(tn, distance);
      }

      if (kart.unwrappedDistanceMeters >= referenceDrills.find((drill) => drill.target.id === activeDrillTarget.id)!.finishProgressMeters) {
        finalizeCornerDrillPass(nextSpeedKph);
      }

      return;
    }

    if (lap.lapNumber >= 1) lap.currentLapSeconds += dtSeconds;

    // Record Ghost sample every 3 ticks (~40 Hz) during timed laps
    if (lap.lapNumber >= 1 && tick % 3 === 0 && kart.unwrappedDistanceMeters < lapStartProgressMeters + circuit.totalLengthMeters) {
      activeLapGhostFrames.push({
        lapSeconds: lap.currentLapSeconds,
        distanceMeters: Math.max(0, kart.unwrappedDistanceMeters - lapStartProgressMeters),
        position: { ...nextPosition },
        headingRad: nextHeading,
        speedKph: nextSpeedKph,
        steerAngleRad: kart.steerAngleRad,
      });
    }

    // Ordered forward checkpoints use net Circuit progress; backtracking cannot
    // overwrite an observed split or turn a local Start/Finish loop into a lap.
    if (lap.lapNumber >= 1) {
      const firstCheckpoint = lapStartProgressMeters + circuit.turns[2].exitDistanceMeters;
      const secondCheckpoint = lapStartProgressMeters + circuit.turns[7].exitDistanceMeters;
      if (lap.currentSectorSplits[0] === null && previousProgress <= firstCheckpoint && kart.unwrappedDistanceMeters > firstCheckpoint) {
        const s1Time = lap.currentLapSeconds - sectorEntryLapSeconds;
        lap.currentSectorSplits[0] = s1Time;
        if (
          lap.isClean &&
          (lap.bestSectorSplits[0] === null || s1Time < lap.bestSectorSplits[0])
        ) {
          lap.bestSectorSplits[0] = s1Time;
        }
        sectorEntryLapSeconds = lap.currentLapSeconds;
      } else if (lap.currentSectorSplits[0] !== null && lap.currentSectorSplits[1] === null && previousProgress <= secondCheckpoint && kart.unwrappedDistanceMeters > secondCheckpoint) {
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

    // Only a complete traversal may end a timed lap. Incomplete crossings keep its timer running.
    if (previousDistance > circuit.totalLengthMeters * 0.8 && nearest.distanceMeters < circuit.totalLengthMeters * 0.2) {
      if (lap.lapNumber >= 1 && (
        kart.unwrappedDistanceMeters < lapStartProgressMeters + circuit.totalLengthMeters - 1e-6 ||
        lap.currentSectorSplits[0] === null || lap.currentSectorSplits[1] === null
      )) return;
      if (lap.lapNumber >= 1) {
        const finishedLapSeconds = lap.currentLapSeconds;
        const s1 = lap.currentSectorSplits[0]!;
        const s2 = lap.currentSectorSplits[1]!;
        const s3 = finishedLapSeconds - sectorEntryLapSeconds;
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
                steerAngleRad: kart.steerAngleRad,
              },
            ];
          }
          saveToStorage();
        }
      }

      if (timeTrial.lapLimit !== null && timeTrial.completedLaps.length >= timeTrial.lapLimit) {
        timeTrial.status = 'Finished';
        return;
      }
      timeTrial.status = 'Driving';
      lapStartProgressMeters = kart.unwrappedDistanceMeters - kart.lapDistanceMeters;
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
          steerAngleRad: kart.steerAngleRad,
        },
      ];
    }

    return;
  }

  function releaseDriverInputs(): SessionSnapshot {
    keyboardAssistance.reset();
    return getSnapshot();
  }

  function setKeyboardAssistance(settings: Partial<KeyboardAssistanceSettings>): SessionSnapshot {
    keyboardAssistance.setSettings(settings);
    return getSnapshot();
  }

  function setCameraSettings(settings: Partial<CameraSettings>): SessionSnapshot {
    cameraPresentation.setSettings(settings);
    return getSnapshot();
  }

  function toggleCamera(): SessionSnapshot {
    cameraMode = cameraMode === 'Chase Cam' ? 'Helmet Cam' : 'Chase Cam';
    cameraPresentation.reset(kart);
    return getSnapshot();
  }

  function toggleRacingLine(): SessionSnapshot {
    const modes: RacingLineDisplayMode[] = ['Full', 'Corners Only', 'Off'];
    racingLineDisplayMode = modes[(modes.indexOf(racingLineDisplayMode) + 1) % modes.length];
    return getSnapshot();
  }

  function cycleGhostMode(): SessionSnapshot {
    const order: GhostMode[] = ['Reference Lap', 'Personal Best', 'Both', 'Off'];
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
      if (found.id !== activeDrillTarget.id) lastExecutionCard = null;
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
      drillPersonalBests: { ...drillPersonalBests }, drillReference,
      legacyDrillPersonalBests: structuredClone(legacyDrillPersonalBests),
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
    ].map((record) => sameRevision(record.revision, trainingRevision) ? alignDrillReference(record, drillReference) : record);
  }

  function applyTrainingRecords(records: TrainingRecords[]): void {
    const current = records.find((record) => sameRevision(record.revision, trainingRevision));
    legacyRecords = records.filter((record) => !sameRevision(record.revision, trainingRevision));
    if (current) {
      lap.personalBestSeconds = current.personalBestSeconds;
      lap.bestSectorSplits = current.bestSectorSplits;
      personalBestGhostFrames = current.personalBestGhostFrames;
      drillPersonalBests = current.drillPersonalBests;
      legacyDrillPersonalBests = structuredClone(current.legacyDrillPersonalBests ?? []);
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
      kart,
      racingLineDisplayMode,
    );

    const pbAtDist =
      ghostMode === 'Personal Best'
        ? samplePersonalBestSecondsAtDistance(
            personalBestGhostFrames,
            kart.lapDistanceMeters,
          )
        : null;
    const refBenchmarkSeconds =
      pbAtDist ?? referenceTimeAtDistance(reference, kart.lapDistanceMeters);
    const ambiguousComparison = kart.speedMps < -0.001 || kart.unwrappedDistanceMeters < furthestProgressMeters - 0.02 ||
      (ghostMode === 'Personal Best' && personalBestGhostFrames.length >= 2 && pbAtDist === null);
    const liveDelta = ambiguousComparison ? null :
      lap.lapNumber >= 1 ? lap.currentLapSeconds - refBenchmarkSeconds : 0;
    lap.timeDeltaSeconds = liveDelta;

    const showTrackRecord =
      ghostMode === 'Reference Lap' || ghostMode === 'Both';
    const showPersonalBest =
      ghostMode === 'Personal Best' || ghostMode === 'Both';

    // Lap replays have no approach tape: reveal them only when the lap clock starts.
    const ghostClockStarted = mode === 'Corner Drill' || lap.lapNumber >= 1;
    // A recovery tape can revisit a station: keep valid full-lap time playback,
    // but suppress a drill Ghost when its Flying Entry cannot be aligned.
    const personalBestDrillStartSeconds = mode === 'Corner Drill'
      ? samplePersonalBestSecondsAtDistance(personalBestGhostFrames, activeDrillTarget.flyingEntryDistanceMeters)
      : 0;
    const ghost: GhostState = {
      mode: ghostMode,
      trackRecordPose: showTrackRecord && ghostClockStarted
        ? referencePoseAtTime(
            reference,
            mode === 'Corner Drill'
              ? referenceDrills.find((drill) => drill.target.id === activeDrillTarget.id)!.referenceStartSeconds + drillCurrentSegmentSeconds
              : lap.currentLapSeconds,
          )
        : null,
      personalBestPose: showPersonalBest && ghostClockStarted && personalBestDrillStartSeconds !== null
        ? samplePersonalBestGhostPose(
            personalBestGhostFrames,
            mode === 'Corner Drill'
              ? personalBestDrillStartSeconds + drillCurrentSegmentSeconds
              : lap.currentLapSeconds,
          )
        : null,
    };

    const drill: DrillState = {
      target: { ...activeDrillTarget, turns: [...activeDrillTarget.turns] },
      availableTargets: drillCatalog.map((target) => ({ ...target, turns: [...target.turns] })),
      runNumber: drillRunNumber,
      currentSegmentSeconds: drillCurrentSegmentSeconds,
      isClean: drillIsClean,
      personalBests: { ...drillPersonalBests },
      lastExecutionCard: lastExecutionCard ? {
        ...lastExecutionCard,
        turnApexProximities: lastExecutionCard.turnApexProximities.map((turn) => ({ ...turn, referenceTarget: { ...turn.referenceTarget } })),
      } : null,
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
      camera: cameraPresentation.getState(kart, cameraMode),
      keyboardAssistance: keyboardAssistance.getSettings(),
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
    setCameraSettings,
    setKeyboardAssistance,
    toggleRacingLine,
    cycleGhostMode,
    setPracticeMode,
    setTimeTrialLapLimit,
    selectDrillTarget,
    reset,
    releaseDriverInputs,
    exportTrainingDataJson,
    importTrainingDataJson,
    getSnapshot,
    getReferenceReplay: () => structuredClone(reference),
  };
}

