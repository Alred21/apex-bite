import * as THREE from 'three';
import { KART_DIMENSIONS, KART_WHEEL_GEOMETRY } from '../simulation/kart-parameters';

const DEG_TO_RAD = Math.PI / 180;

const STEERING_WHEEL_HUB_X = 0.185;
const STEERING_WHEEL_HUB_Y = 0.36;
const STEERING_WHEEL_TILT_RAD = 0.35;
const UPPER_SHAFT_LENGTH_METERS = 0.064;
const U_JOINT_X = STEERING_WHEEL_HUB_X + UPPER_SHAFT_LENGTH_METERS * Math.cos(STEERING_WHEEL_TILT_RAD);
const U_JOINT_Y = STEERING_WHEEL_HUB_Y + UPPER_SHAFT_LENGTH_METERS * Math.sin(STEERING_WHEEL_TILT_RAD);

/** Calibrated OTL Superleggero cockpit, steering 4-bar, drivetrain, and driver anchor configuration. */
export const OTL_RIG_CONFIG = {
  wheelbaseMeters: KART_DIMENSIONS.wheelbaseMeters,
  kingpinHalfTrackMeters: 0.185,
  frontTireHalfWidthMeters: 0.056, // 112 mm indoor front slick
  rearTireHalfWidthMeters: 0.078, // 156 mm indoor rear slick
  casterAngleRad: 10 * DEG_TO_RAD,
  kpiAngleRad: 7 * DEG_TO_RAD,
  rearGearRatio: 3.2,
  steeringWheelHub: {
    x: STEERING_WHEEL_HUB_X,
    y: STEERING_WHEEL_HUB_Y,
    z: 0.0,
    tiltRad: STEERING_WHEEL_TILT_RAD,
  },
  steeringUJointCenter: [U_JOINT_X, U_JOINT_Y, 0.0] as const,
  dashBinnacle: { x: 0.262, y: 0.483 },
  pitmanPivot: [0.458, 0.192, 0.0] as const,
  pitmanBallLocal: [0.004, -0.056, 0.014] as const,
  knuckleArmBallLocal: [-0.086, 0.044, -0.014] as const,
  pedalPivot: [0.428, 0.095, 0.075] as const,
  brakeMasterPistonTarget: [0.382, 0.124, -0.122] as const,
  throttleSensorPivot: [0.416, 0.124, 0.122] as const,
  brakeClevisLocal: [0.0, 0.038, -0.047] as const,
  throttleClevisLocal: [0.0, 0.038, 0.047] as const,
  driverShoulder: [-0.335, 0.485, 0.122] as const,
  gloveGripOffset: [-0.01, 0.0, 0.105] as const,
  gloveWristLocal: [-0.032, 0.0, 0.0] as const,
} as const;

export interface SteeringSideSolution {
  steerRad: number;
  /** Signed rotation around upward kingpinAxis (positive = turns front toward -Z left). */
  knuckleRotationRad: number;
  kingpinAxis: THREE.Vector3;
  knuckleQuat: THREE.Quaternion;
  tieRodStart: THREE.Vector3;
  tieRodEnd: THREE.Vector3;
  rodLength: number;
}

export interface SteeringFourBarSolution {
  steeringWheelAngleRad: number;
  pitmanQuat: THREE.Quaternion;
  left: SteeringSideSolution;
  right: SteeringSideSolution;
}

export interface TwoBoneIKSolution {
  mid: THREE.Vector3;
  end: THREE.Vector3;
}

function mirroredTuple(triple: readonly [number, number, number], side: -1 | 1): THREE.Vector3 {
  return new THREE.Vector3(triple[0], triple[1], side * triple[2]);
}

function computeKingpinAxis(side: -1 | 1): THREE.Vector3 {
  const caster = OTL_RIG_CONFIG.casterAngleRad;
  const kpi = OTL_RIG_CONFIG.kpiAngleRad;
  return new THREE.Vector3(
    -Math.sin(caster) * Math.cos(kpi),
    Math.cos(caster) * Math.cos(kpi),
    -side * Math.sin(kpi),
  ).normalize();
}

function wrapAngleRad(angleRad: number): number {
  let a = (angleRad + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const PITMAN_PIVOT_VEC = new THREE.Vector3(...OTL_RIG_CONFIG.pitmanPivot);
const U_JOINT_VEC = new THREE.Vector3(...OTL_RIG_CONFIG.steeringUJointCenter);
/** Driver-facing lower column axis (-X, +Y): rotating by -steeringWheelAngleRad equals +steeringWheelAngleRad forward. */
export const LOWER_STEERING_COLUMN_AXIS_BACK = U_JOINT_VEC.clone().sub(PITMAN_PIVOT_VEC).normalize();
export const UPPER_STEERING_COLUMN_AXIS_BACK = new THREE.Vector3(
  -Math.cos(OTL_RIG_CONFIG.steeringWheelHub.tiltRad),
  -Math.sin(OTL_RIG_CONFIG.steeringWheelHub.tiltRad),
  0,
).normalize();

interface SidePrecomputed {
  side: -1 | 1;
  kingpinPivot: THREE.Vector3;
  kingpinAxis: THREE.Vector3;
  pitmanBallRest: THREE.Vector3;
  knuckleBallRest: THREE.Vector3;
  circleCenter: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  uSq: number;
  rodLength: number;
}

function buildSidePrecomputed(side: -1 | 1): SidePrecomputed {
  const kingpinPivot = new THREE.Vector3(
    KART_WHEEL_GEOMETRY.frontAxleMeters,
    KART_WHEEL_GEOMETRY.tireRadiusMeters,
    side * OTL_RIG_CONFIG.kingpinHalfTrackMeters,
  );
  const kingpinAxis = computeKingpinAxis(side);
  const pitmanBallRest = mirroredTuple(OTL_RIG_CONFIG.pitmanBallLocal, side);
  const knuckleBallRest = mirroredTuple(OTL_RIG_CONFIG.knuckleArmBallLocal, side);
  const pitmanWorldRest = PITMAN_PIVOT_VEC.clone().add(pitmanBallRest);
  const knuckleWorldRest = kingpinPivot.clone().add(knuckleBallRest);
  const rodLength = pitmanWorldRest.distanceTo(knuckleWorldRest);

  const proj = knuckleBallRest.dot(kingpinAxis);
  const u = knuckleBallRest.clone().addScaledVector(kingpinAxis, -proj);
  const v = new THREE.Vector3().crossVectors(kingpinAxis, u);
  const circleCenter = kingpinPivot.clone().addScaledVector(kingpinAxis, proj);

  return {
    side,
    kingpinPivot,
    kingpinAxis,
    pitmanBallRest,
    knuckleBallRest,
    circleCenter,
    u,
    v,
    uSq: u.lengthSq(),
    rodLength,
  };
}

const SIDE_LEFT = buildSidePrecomputed(-1);
const SIDE_RIGHT = buildSidePrecomputed(1);

function solveSideFourBar(
  prep: SidePrecomputed,
  pitmanQuat: THREE.Quaternion,
): SteeringSideSolution {
  const tieRodStart = prep.pitmanBallRest.clone().applyQuaternion(pitmanQuat).add(PITMAN_PIVOT_VEC);
  const d = tieRodStart.clone().sub(prep.circleCenter);
  const A = 2 * d.dot(prep.u);
  const B = 2 * d.dot(prep.v);
  const C = prep.uSq + d.lengthSq() - prep.rodLength * prep.rodLength;
  const R = Math.hypot(A, B);

  let knuckleRotationRad = 0;
  if (R > 1e-9) {
    const ratio = THREE.MathUtils.clamp(C / R, -1, 1);
    const base = Math.atan2(B, A);
    const delta = Math.acos(ratio);
    const t1 = wrapAngleRad(base + delta);
    const t2 = wrapAngleRad(base - delta);
    knuckleRotationRad = Math.abs(t1) <= Math.abs(t2) ? t1 : t2;
  }

  const tieRodEnd = prep.circleCenter
    .clone()
    .addScaledVector(prep.u, Math.cos(knuckleRotationRad))
    .addScaledVector(prep.v, Math.sin(knuckleRotationRad));

  const knuckleQuat = new THREE.Quaternion().setFromAxisAngle(prep.kingpinAxis, knuckleRotationRad);

  return {
    steerRad: -knuckleRotationRad,
    knuckleRotationRad,
    kingpinAxis: prep.kingpinAxis.clone(),
    knuckleQuat,
    tieRodStart,
    tieRodEnd,
    rodLength: prep.rodLength,
  };
}

/**
 * Computes true Ackermann left/right front spindle steering angles for a given
 * virtual center steering angle (`steerAngleRad`, where negative = left, positive = right).
 */
export function ackermannSteeringAngles(steerAngleRad: number): {
  leftRad: number;
  rightRad: number;
} {
  const tanS = Math.tan(steerAngleRad);
  const L = OTL_RIG_CONFIG.wheelbaseMeters;
  const kHalf = OTL_RIG_CONFIG.kingpinHalfTrackMeters;
  return {
    leftRad: Math.atan((L * tanS) / (L + kHalf * tanS)),
    rightRad: Math.atan((L * tanS) / (L - kHalf * tanS)),
  };
}

/**
 * Solves the exact 3D rigid circle-sphere 4-bar steering linkage driven by the
 * steering column & welded Pitman arm rotating by `-steeringWheelAngleRad`
 * around the driver-facing column axis (`LOWER_STEERING_COLUMN_AXIS_BACK`).
 */
export function solveSteeringFourBar(steeringWheelAngleRad: number): SteeringFourBarSolution {
  const pitmanQuat = new THREE.Quaternion().setFromAxisAngle(
    LOWER_STEERING_COLUMN_AXIS_BACK,
    -steeringWheelAngleRad,
  );
  return {
    steeringWheelAngleRad,
    pitmanQuat,
    left: solveSideFourBar(SIDE_LEFT, pitmanQuat),
    right: solveSideFourBar(SIDE_RIGHT, pitmanQuat),
  };
}

/**
 * Analytical 2-bone inverse kinematics solver placing the mid-joint (elbow/knee)
 * in the plane spanned by (target - root) and poleDirection, clamping cleanly
 * without NaN when the target is outside reachable bounds.
 */
export function solveTwoBoneIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  poleDirection: THREE.Vector3,
): TwoBoneIKSolution {
  const toTarget = target.clone().sub(root);
  const rawDist = toTarget.length();
  const dir = rawDist > 1e-6 ? toTarget.divideScalar(rawDist) : new THREE.Vector3(1, 0, 0);

  const minReach = Math.abs(upperLength - lowerLength) + 1e-5;
  const maxReach = upperLength + lowerLength - 1e-5;
  const clampedDist = THREE.MathUtils.clamp(rawDist, minReach, maxReach);

  const bend = poleDirection.clone().addScaledVector(dir, -poleDirection.dot(dir));
  if (bend.lengthSq() < 1e-8) {
    bend.set(0, 1, 0).addScaledVector(dir, -dir.y);
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1);
  }
  bend.normalize();

  const cosAlpha = THREE.MathUtils.clamp(
    (upperLength * upperLength + clampedDist * clampedDist - lowerLength * lowerLength) /
      (2 * upperLength * clampedDist),
    -1,
    1,
  );
  const along = upperLength * cosAlpha;
  const perp = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  const mid = root.clone().addScaledVector(dir, along).addScaledVector(bend, perp);
  const end = root.clone().addScaledVector(dir, clampedDist);

  return { mid, end };
}
