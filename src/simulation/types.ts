export type TurnDirection = 'Left' | 'Right';

export type TurnNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type SectorNumber = 1 | 2 | 3;

export type CameraMode = 'Chase Cam' | 'Helmet Cam';

export type PracticeMode = 'Time Trial' | 'Corner Drill';

export type GhostMode = 'Track Record' | 'Personal Best' | 'Both' | 'Off';

export interface Vector2D {
  x: number;
  z: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface CircuitSample {
  index: number;
  distanceMeters: number;
  progress: number; // 0..1
  center: Vector2D;
  tangent: Vector2D;
  normal: Vector2D; // points to the right of direction of travel (inside of clockwise right-hand turns)
  widthMeters: number;
  leftBarrier: Vector2D;
  rightBarrier: Vector2D;
  curvature: number; // positive = right turn, negative = left turn
  sector: SectorNumber;
}

export interface TurnMetadata {
  number: TurnNumber;
  name: string;
  direction: TurnDirection;
  sector: SectorNumber;
  entryDistanceMeters: number;
  apexDistanceMeters: number;
  exitDistanceMeters: number;
  apexPoint: Vector2D;
  typicalWidthMeters: number;
}

export interface CircuitData {
  name: string;
  totalLengthMeters: number;
  trackRecordSeconds: number;
  samples: CircuitSample[];
  turns: TurnMetadata[];
}

export interface KeyboardInputState {
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  space?: boolean;
}

export interface KeyboardAssistanceSettings {
  steeringSensitivity: number; // 0.5–1.75, affects keyboard response rather than grip limits
}

export interface GamepadInputState {
  throttle?: number; // 0..1
  brake?: number; // 0..1
  steer?: number; // -1..1
  deadzone?: number; // configurable analog deadzone (default 0.06)
}

export interface DriverInput {
  throttle?: number; // 0..1
  brake?: number; // 0..1
  fullBrake?: boolean; // Spacebar instant 100% rear brake
  steer?: number; // -1 (left) .. +1 (right)
  keys?: KeyboardInputState;
  gamepad?: GamepadInputState;
}

export interface KartState {
  velocity: Vector2D;
  yawRateRadPerSecond: number;
  position: Vector2D;
  headingRad: number; // 0 = +x, PI/2 = +z, clockwise in top-down (x, z)
  speedMps: number;
  speedKph: number;
  forwardAccelMps2: number;
  lateralAccelMps2: number;
  steerAngleRad: number;
  steeringWheelAngleRad: number;
  throttleInput: number;
  brakeInput: number;
  isTrailBraking: boolean;
  axleScrub: number; // 0..1 solid rear axle scrub intensity
  slipRatio: number; // 0..1 overall tire lateral slip / scrub intensity
  barrierContact: boolean;
  barrierContactCount: number;
  lapDistanceMeters: number;
  unwrappedDistanceMeters: number;
  lapProgress: number;
  currentTurn: TurnNumber | null;
  currentSector: SectorNumber;
}

export interface CameraSettings {
  fieldOfViewDegrees: number;
  motionStrength: number; // 0 fully disables acceleration, cornering and impact feedback
}

export interface CameraState {
  mode: CameraMode;
  settings: CameraSettings;
  rollRad: number;
  position: Vector3D;
  lookAt: Vector3D;
}

export type RacingLineCue = 'Green' | 'Yellow' | 'Red';

export interface RacingLinePoint {
  index: number;
  distanceMeters: number;
  progress: number;
  position: Vector2D;
  headingRad: number;
  targetSpeedMps: number;
  targetSpeedKph: number;
  benchmarkTimeSeconds: number;
  liveCue: RacingLineCue;
}

export interface RacingLineState {
  visible: boolean;
  benchmarkLapSeconds: number;
  points: RacingLinePoint[];
}

export type SectorSplitsTuple = [number | null, number | null, number | null];

export interface CompletedTimeTrialLap {
  lapNumber: number;
  seconds: number;
  isClean: boolean;
  sectorSplits: SectorSplitsTuple;
}

export interface TimeTrialState {
  lapLimit: number | null; // null explicitly selects unlimited practice
  status: 'Flying Start' | 'Driving' | 'Finished';
  completedLaps: CompletedTimeTrialLap[];
  totalSeconds: number;
  bestCleanLapSeconds: number | null;
}

export interface LapSummaryState {
  isClean: boolean;
  currentLapSeconds: number;
  lapNumber: number;
  lastLapSeconds: number | null;
  personalBestSeconds: number | null;
  timeDeltaSeconds: number;
  currentSectorSplits: SectorSplitsTuple;
  lastSectorSplits: SectorSplitsTuple;
  bestSectorSplits: SectorSplitsTuple;
}

export interface GhostPose {
  position: Vector2D;
  headingRad: number;
  speedKph: number;
}

export interface GhostSampleFrame {
  lapSeconds: number;
  distanceMeters: number;
  position: Vector2D;
  headingRad: number;
  speedKph: number;
}

export interface GhostState {
  mode: GhostMode;
  trackRecordPose: GhostPose | null;
  personalBestPose: GhostPose | null;
}

export type DrillTargetId =
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'T6'
  | 'T7'
  | 'T8'
  | 'T9'
  | 'T10'
  | 'T11'
  | 'T1-T3'
  | 'T2-T3'
  | 'T4-T5'
  | 'T6-T7-T8'
  | 'T9-T10-T11';

export interface DrillTargetDefinition {
  id: DrillTargetId;
  label: string;
  kind: 'Turn' | 'Corner Complex';
  turns: TurnNumber[];
  flyingEntryDistanceMeters: number;
  exitDistanceMeters: number;
  benchmarkTimeSeconds: number;
  targetEntrySpeedKph: number;
  targetMinApexSpeedKph: number;
  targetExitSpeedKph: number;
}

export type CoachingInsightCategory =
  | 'Optimal Pass'
  | 'Barrier Contact'
  | 'Late Braking Overshoot'
  | 'Over-Slowed Entry'
  | 'Excessive Axle Scrub';

export interface CornerExecutionCard {
  targetId: DrillTargetId;
  targetLabel: string;
  runNumber: number;
  isClean: boolean;
  segmentTimeSeconds: number;
  benchmarkTimeSeconds: number;
  deltaToBenchmarkSeconds: number;
  personalBestSeconds: number | null;
  deltaToPersonalBestSeconds: number | null;
  entrySpeedKph: number;
  minApexSpeedKph: number;
  exitSpeedKph: number;
  targetEntrySpeedKph: number;
  targetMinApexSpeedKph: number;
  targetExitSpeedKph: number;
  apexProximityCm: number;
  coachingCategory: CoachingInsightCategory;
  coachingInsight: string;
}

export interface DrillState {
  target: DrillTargetDefinition;
  availableTargets: DrillTargetDefinition[];
  runNumber: number;
  currentSegmentSeconds: number;
  isClean: boolean;
  personalBests: Partial<Record<DrillTargetId, number>>;
  lastExecutionCard: CornerExecutionCard | null;
}

export interface SessionSnapshot {
  tick: number;
  elapsedSeconds: number;
  mode: PracticeMode;
  circuit: CircuitData;
  kart: KartState;
  camera: CameraState;
  keyboardAssistance: KeyboardAssistanceSettings;
  lap: LapSummaryState;
  timeTrial: TimeTrialState;
  racingLine: RacingLineState;
  ghost: GhostState;
  drill: DrillState;
  trainingData: import('./training-data').TrainingDataState;
}
