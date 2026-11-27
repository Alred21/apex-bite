import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ackermannSteeringAngles,
  computeDriverHeadYawRad,
  computeDriverTorsoLeanRad,
  OTL_RIG_CONFIG,
  solveDriverArmPose,
  solveDriverLegPose,
  solveSteeringFourBar,
  solveTwoBoneIK,
} from '../src/render/kinematics';
import { KART_DIMENSIONS, KART_WHEEL_GEOMETRY, MAX_STEER_ANGLE_RAD } from '../src/simulation/kart-parameters';

describe('OTL Superleggero calibrated rig config', () => {
  it('exposes calibrated cockpit, kingpin, caster/KPI, and powertrain constants', () => {
    expect(OTL_RIG_CONFIG.wheelbaseMeters).toBeCloseTo(KART_DIMENSIONS.wheelbaseMeters, 6);
    expect(OTL_RIG_CONFIG.kingpinHalfTrackMeters).toBeCloseTo(0.185, 4);
    expect(OTL_RIG_CONFIG.steeringWheelHub.y).toBeCloseTo(0.36, 3);
    expect(OTL_RIG_CONFIG.dashBinnacle.y).toBeCloseTo(0.483, 3);
    expect(OTL_RIG_CONFIG.casterAngleRad).toBeGreaterThan(THREE.MathUtils.degToRad(8));
    expect(OTL_RIG_CONFIG.casterAngleRad).toBeLessThan(THREE.MathUtils.degToRad(12));
    expect(OTL_RIG_CONFIG.kpiAngleRad).toBeGreaterThan(THREE.MathUtils.degToRad(5));
    expect(OTL_RIG_CONFIG.kpiAngleRad).toBeLessThan(THREE.MathUtils.degToRad(9));
    expect(OTL_RIG_CONFIG.rearGearRatio).toBeCloseTo(3.2, 2);
  });
});

describe('Ackermann steering angles', () => {
  it('returns zero straight-ahead and sharper inside wheel angles on left and right turns', () => {
    const straight = ackermannSteeringAngles(0);
    expect(straight.leftRad).toBeCloseTo(0, 8);
    expect(straight.rightRad).toBeCloseTo(0, 8);

    const left = ackermannSteeringAngles(-MAX_STEER_ANGLE_RAD);
    expect(left.leftRad).toBeLessThan(0);
    expect(left.rightRad).toBeLessThan(0);
    expect(Math.abs(left.leftRad)).toBeGreaterThan(Math.abs(left.rightRad));

    const right = ackermannSteeringAngles(MAX_STEER_ANGLE_RAD);
    expect(right.leftRad).toBeGreaterThan(0);
    expect(right.rightRad).toBeGreaterThan(0);
    expect(Math.abs(right.rightRad)).toBeGreaterThan(Math.abs(right.leftRad));
  });
});

describe('Rigid 4-bar steering linkage solver', () => {
  it('maintains constant fixed tie-rod length (< 1e-5 m) across full steering lock without scaling', () => {
    const rest = solveSteeringFourBar(0);
    expect(rest.left.steerRad).toBeCloseTo(0, 6);
    expect(rest.right.steerRad).toBeCloseTo(0, 6);
    expect(rest.left.rodLength).toBeGreaterThan(0.1);
    expect(rest.right.rodLength).toBeGreaterThan(0.1);
    expect(rest.left.rodLength).toBeCloseTo(rest.right.rodLength, 6);

    const maxWheelRad = MAX_STEER_ANGLE_RAD * 2.2; // 1.012 rad
    for (const swRad of [-maxWheelRad, -0.5 * maxWheelRad, -0.25, 0, 0.25, 0.5 * maxWheelRad, maxWheelRad]) {
      const solved = solveSteeringFourBar(swRad);
      const leftDist = solved.left.tieRodStart.distanceTo(solved.left.tieRodEnd);
      const rightDist = solved.right.tieRodStart.distanceTo(solved.right.tieRodEnd);
      expect(Math.abs(leftDist - solved.left.rodLength)).toBeLessThan(1e-5);
      expect(Math.abs(rightDist - solved.right.rodLength)).toBeLessThan(1e-5);
    }
  });

  it('produces true Ackermann angles (~±0.46 rad avg at ±1.012 rad) around tilted caster/KPI kingpins', () => {
    const maxWheelRad = MAX_STEER_ANGLE_RAD * 2.2; // 1.012 rad

    const leftTurn = solveSteeringFourBar(-maxWheelRad);
    expect(leftTurn.left.steerRad).toBeLessThan(0);
    expect(leftTurn.right.steerRad).toBeLessThan(0);
    expect(Math.abs(leftTurn.left.steerRad)).toBeGreaterThan(Math.abs(leftTurn.right.steerRad));
    const avgLeft = 0.5 * (leftTurn.left.steerRad + leftTurn.right.steerRad);
    expect(avgLeft).toBeCloseTo(-MAX_STEER_ANGLE_RAD, 2);

    const rightTurn = solveSteeringFourBar(maxWheelRad);
    expect(rightTurn.left.steerRad).toBeGreaterThan(0);
    expect(rightTurn.right.steerRad).toBeGreaterThan(0);
    expect(Math.abs(rightTurn.right.steerRad)).toBeGreaterThan(Math.abs(rightTurn.left.steerRad));
    const avgRight = 0.5 * (rightTurn.left.steerRad + rightTurn.right.steerRad);
    expect(avgRight).toBeCloseTo(MAX_STEER_ANGLE_RAD, 2);

    // Verify knuckle ball end rotates purely around its tilted kingpin axis (constant distance & projection)
    const rest = solveSteeringFourBar(0);
    for (const [sideKey, sideSign] of [
      ['left', -1],
      ['right', 1],
    ] as const) {
      const kingpinPivot = new THREE.Vector3(
        KART_WHEEL_GEOMETRY.frontAxleMeters,
        KART_WHEEL_GEOMETRY.tireRadiusMeters,
        sideSign * OTL_RIG_CONFIG.kingpinHalfTrackMeters,
      );
      const restRel = rest[sideKey].tieRodEnd.clone().sub(kingpinPivot);
      const turnedRel = rightTurn[sideKey].tieRodEnd.clone().sub(kingpinPivot);
      expect(turnedRel.length()).toBeCloseTo(restRel.length(), 6);
      expect(turnedRel.dot(rightTurn[sideKey].kingpinAxis)).toBeCloseTo(
        restRel.dot(rest[sideKey].kingpinAxis),
        6,
      );
    }
  });
});

describe('Analytical two-bone IK solver', () => {
  it('places mid-joint and end-effector at exact bone lengths in the pole plane', () => {
    const root = new THREE.Vector3(-0.335, 0.485, 0.122);
    const target = new THREE.Vector3(0.14, 0.35, 0.105);
    const pole = new THREE.Vector3(-0.06, -0.25, 0.96);
    const upper = 0.27;
    const lower = 0.26;

    const result = solveTwoBoneIK(root, target, upper, lower, pole);
    expect(result.mid.distanceTo(root)).toBeCloseTo(upper, 5);
    expect(result.end.distanceTo(result.mid)).toBeCloseTo(lower, 5);
    expect(result.end.distanceTo(target)).toBeCloseTo(0, 5);

    // Verify mid joint bends toward the pole direction relative to root->target chord
    const chord = target.clone().sub(root).normalize();
    const midOffset = result.mid.clone().sub(root);
    const perpToChord = midOffset.clone().addScaledVector(chord, -midOffset.dot(chord));
    expect(perpToChord.dot(pole)).toBeGreaterThan(0);
  });

  it('clamps gracefully without NaN when target exceeds full reach or collapses near root', () => {
    const root = new THREE.Vector3(0, 0, 0);
    const pole = new THREE.Vector3(0, 0, 1);

    const farTarget = new THREE.Vector3(2.0, 0, 0);
    const farResult = solveTwoBoneIK(root, farTarget, 0.3, 0.25, pole);
    expect(Number.isFinite(farResult.mid.x)).toBe(true);
    expect(Number.isFinite(farResult.end.x)).toBe(true);
    expect(farResult.end.distanceTo(root)).toBeCloseTo(0.55, 4);

    const nearTarget = new THREE.Vector3(0.01, 0, 0);
    const nearResult = solveTwoBoneIK(root, nearTarget, 0.3, 0.25, pole);
    expect(Number.isFinite(nearResult.mid.x)).toBe(true);
    expect(Number.isFinite(nearResult.end.x)).toBe(true);
    expect(nearResult.mid.distanceTo(root)).toBeCloseTo(0.3, 4);
    expect(nearResult.end.distanceTo(nearResult.mid)).toBeCloseTo(0.25, 4);
  });
});

describe('Driver two-bone arm IK & steering wheel grip tracking', () => {
  it('keeps wrists planted on rotated F1 wheel grips across full steering lock [-1.012, +1.012] rad with exact bone lengths', () => {
    const maxWheelRad = MAX_STEER_ANGLE_RAD * 2.2; // 1.012 rad
    const leanAngles = [-THREE.MathUtils.degToRad(3.5), 0, THREE.MathUtils.degToRad(3.5)];
    const steerSweep = [-maxWheelRad, -0.5 * maxWheelRad, 0, 0.5 * maxWheelRad, maxWheelRad];

    for (const torsoLeanRad of leanAngles) {
      for (const swRad of steerSweep) {
        for (const side of [-1, 1] as const) {
          const arm = solveDriverArmPose(side, swRad, torsoLeanRad);
          expect(Number.isFinite(arm.shoulder.x)).toBe(true);
          expect(Number.isFinite(arm.elbow.x)).toBe(true);
          expect(Number.isFinite(arm.wrist.x)).toBe(true);

          // Exact non-stretched bone lengths
          expect(arm.shoulder.distanceTo(arm.elbow)).toBeCloseTo(OTL_RIG_CONFIG.driverUpperArmLength, 5);
          expect(arm.elbow.distanceTo(arm.wrist)).toBeCloseTo(OTL_RIG_CONFIG.driverForearmLength, 5);

          // Wrist reaches the exact rotated grip wrist target without clamping/separation
          expect(arm.wrist.distanceTo(arm.wristTarget)).toBeLessThan(1e-4);

          // Elbow bends naturally outward/downward above sidepod deck
          expect(Math.abs(arm.elbow.z)).toBeGreaterThan(Math.abs(arm.shoulder.z));
          expect(arm.elbow.y).toBeGreaterThan(0.295);
        }
      }
    }
  });
});

describe('Driver two-bone leg IK & live pedal-tracking boots', () => {
  it('tracks live brake and throttle pedal travel [0, 1] with exact thigh/shin lengths and valid Kart bounds', () => {
    for (const side of [-1, 1] as const) {
      const restLeg = solveDriverLegPose(side, 0);
      const fullLeg = solveDriverLegPose(side, 1);

      // Depressing pedal pushes sole & ankle forward (+X) and pitches boot forward (-Z rot)
      expect(fullLeg.soleContact.x).toBeGreaterThan(restLeg.soleContact.x + 0.012);
      expect(fullLeg.bootPitchRad).toBeCloseTo(-0.24, 5);
      expect(restLeg.bootPitchRad).toBeCloseTo(0, 5);

      for (const pedalInput of [0, 0.25, 0.5, 0.75, 1]) {
        const leg = solveDriverLegPose(side, pedalInput);
        expect(Number.isFinite(leg.hip.x)).toBe(true);
        expect(Number.isFinite(leg.knee.x)).toBe(true);
        expect(Number.isFinite(leg.ankle.x)).toBe(true);

        // Exact thigh & shin bone lengths without stretching
        expect(leg.hip.distanceTo(leg.knee)).toBeCloseTo(OTL_RIG_CONFIG.driverThighLength, 5);
        expect(leg.knee.distanceTo(leg.ankle)).toBeCloseTo(OTL_RIG_CONFIG.driverShinLength, 5);
        expect(leg.ankle.distanceTo(leg.ankleTarget)).toBeLessThan(1e-4);

        // Knee rises above hip and ankle, and footwell clearance stays inside Kart bounds
        expect(leg.knee.y).toBeGreaterThan(leg.hip.y);
        expect(leg.knee.y).toBeGreaterThan(leg.ankle.y);
        expect(leg.ankle.y).toBeGreaterThan(0.085);
        expect(Math.abs(leg.knee.z)).toBeLessThanOrEqual(KART_DIMENSIONS.halfWidthMeters);
        expect(leg.soleContact.x).toBeLessThan(KART_DIMENSIONS.frontExtentMeters);
      }
    }
  });
});

describe('Driver lateral-G torso lean and look-to-apex head yaw', () => {
  it('bounds torso lean to ±3.5 deg and turns head into the corner apex', () => {
    expect(computeDriverTorsoLeanRad(0)).toBe(0);
    const maxLean = THREE.MathUtils.degToRad(3.5);
    expect(Math.abs(computeDriverTorsoLeanRad(12))).toBeCloseTo(maxLean, 6);
    expect(Math.abs(computeDriverTorsoLeanRad(30))).toBeCloseTo(maxLean, 6);
    expect(Math.abs(computeDriverTorsoLeanRad(-30))).toBeCloseTo(maxLean, 6);
    expect(Math.abs(computeDriverTorsoLeanRad(6))).toBeCloseTo(maxLean * 0.5, 6);

    // Left turn (steerAngleRad < 0) turns head toward -Z left (positive +Y yaw); right turn turns toward +Z
    expect(computeDriverHeadYawRad(0)).toBeCloseTo(0, 8);
    expect(computeDriverHeadYawRad(-MAX_STEER_ANGLE_RAD)).toBeCloseTo(MAX_STEER_ANGLE_RAD * 0.25, 6);
    expect(computeDriverHeadYawRad(MAX_STEER_ANGLE_RAD)).toBeCloseTo(-MAX_STEER_ANGLE_RAD * 0.25, 6);
  });
});
