export type TurnDirection = 'Left' | 'Right';

export type TurnNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type SectorNumber = 1 | 2 | 3;

export type CameraMode = 'Chase Cam' | 'Helmet Cam';

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

export interface GamepadInputState {
  throttle?: number; // 0..1
  brake?: number; // 0..1
  steer?: number; // -1..1
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
  position: Vector2D;
  headingRad: number; // 0 = +x, PI/2 = +z, clockwise in top-down (x, z)
  speedMps: number;
  speedKph: number;
  forwardAccelMps2: number;
  lateralAccelMps2: number;
  steerAngleRad: number;
  throttleInput: number;
  brakeInput: number;
  isTrailBraking: boolean;
  axleScrub: number; // 0..1 solid rear axle scrub intensity
  slipRatio: number; // 0..1 overall tire lateral slip / scrub intensity
  barrierContact: boolean;
  barrierContactCount: number;
  lapDistanceMeters: number;
  lapProgress: number;
  currentTurn: TurnNumber | null;
  currentSector: SectorNumber;
}

export interface CameraState {
  mode: CameraMode;
  position: Vector3D;
  lookAt: Vector3D;
}

export interface LapSummaryState {
  isClean: boolean;
  currentLapSeconds: number;
  lapNumber: number;
}

export interface SessionSnapshot {
  tick: number;
  elapsedSeconds: number;
  circuit: CircuitData;
  kart: KartState;
  camera: CameraState;
  lap: LapSummaryState;
}
