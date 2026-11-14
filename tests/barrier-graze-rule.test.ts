import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ackermannSteeringAngles,
  createKartRig,
  DASH_BINNACLE_HEIGHT_METERS,
  KINGPIN_HALF_TRACK_METERS,
  SPINDLE_STUB_LENGTH_METERS,
  STEERING_WHEEL_HUB_HEIGHT_METERS,
} from '../src/render/kart';
import { HELMET_CAM_EYE_HEIGHT_METERS } from '../src/simulation/camera';
import { MAX_STEER_ANGLE_RAD } from '../src/simulation/kart-parameters';
import { isBarrierContactDirty } from '../src/simulation/kart-world';
import { createSimulationSession } from '../src/simulation/session';

describe('Barrier graze rule', () => {
  it('treats exactly 42 accumulated 120 Hz ticks (0.35 s) as a forgivable graze', () => {
    let seconds = 0;
    for (let tick = 0; tick < 42; tick++) seconds += 1 / 120;
    expect(isBarrierContactDirty(1, seconds)).toBe(false);
    expect(isBarrierContactDirty(1, seconds + 1 / 120)).toBe(true);
  });

  it('invalidates on inward normal speed above 1.8 m/s regardless of duration', () => {
    expect(isBarrierContactDirty(1.8, 0.01)).toBe(false);
    expect(isBarrierContactDirty(1.81, 0.01)).toBe(true);
  });

  it('reports zero impact speed while clear of every Barrier', () => {
    const session = createSimulationSession();
    const snapshot = session.step(1 / 120, { throttle: 0.5 });
    expect(snapshot.kart.barrierContact).toBe(false);
    expect(snapshot.kart.barrierImpactSpeedMps).toBe(0);
  });

  it('preserves Corner Drill drill.isClean on a brief shallow graze and invalidates on prolonged contact', () => {
    const session = createSimulationSession();
    session.setPracticeMode('Corner Drill');
    session.selectDrillTarget('T1');
    let snap = session.getSnapshot();

    // Slow down first so the initial brush against the outside Barrier has inward normal speed <= 1.8 m/s
    for (let i = 0; i < 360 && !snap.kart.barrierContact; i++) {
      const fast = snap.kart.speedMps > 1.3;
      snap = session.step(1 / 120, { throttle: fast ? 0 : 0.2, brake: fast ? 0.9 : 0, steer: 0 });
    }
    expect(snap.kart.barrierContact).toBe(true);
    expect(snap.kart.barrierImpactSpeedMps).toBeGreaterThan(0);
    expect(snap.kart.barrierImpactSpeedMps).toBeLessThanOrEqual(1.8);
    expect(snap.drill.isClean).toBe(true);

    // Deliberately grinding against the wall for > 0.35s (65 ticks) invalidates Corner Drill drill.isClean
    for (let i = 0; i < 65; i++) {
      snap = session.step(1 / 120, { throttle: 0.8, steer: -1 });
    }
    expect(snap.drill.isClean).toBe(false);
  });
});

describe('OTL Superleggero 3D rig proportions and non-overlapping clearance', () => {
  it('matches true-scale reclined heights and maintains zero mesh overlap or disconnection statically and in action', () => {
    const rig = createKartRig();
    const session = createSimulationSession();
    const snapshot = session.getSnapshot();

    expect(STEERING_WHEEL_HUB_HEIGHT_METERS).toBeCloseTo(0.355, 3);
    expect(DASH_BINNACLE_HEIGHT_METERS).toBeCloseTo(0.478, 3);
    expect(HELMET_CAM_EYE_HEIGHT_METERS).toBeCloseTo(0.75, 2);

    rig.update(snapshot);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);

    const overallBox = new THREE.Box3().setFromObject(rig.root);
    // Roll hoop peak (~0.86 m) is the highest point on the kart, above the reclined helmet crown (~0.82 m).
    expect(overallBox.max.y).toBeGreaterThan(0.84);
    expect(overallBox.max.y).toBeLessThan(0.89);

    const helmetGroup = rig.root.getObjectByName('Helmet and neck')!;
    expect(helmetGroup).toBeDefined();
    const helmetBox = new THREE.Box3().setFromObject(helmetGroup);
    expect(helmetBox.max.y).toBeGreaterThan(0.79);
    expect(helmetBox.max.y).toBeLessThan(0.84);
    expect(helmetBox.max.y).toBeLessThan(overallBox.max.y);
    // Helmet back stays strictly ahead of the headrest pad (x <= -0.454 m) so no clipping occurs in Chase Cam
    expect(helmetBox.min.x).toBeGreaterThan(-0.448);

    const validateDynamicState = (state: typeof snapshot) => {
      rig.update(state);
      rig.root.position.set(0, 0, 0);
      rig.root.rotation.set(0, 0, 0);
      rig.root.updateMatrixWorld(true);

      // Every mesh must have finite coordinates
      let allFinite = true;
      rig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const pos = obj.geometry.getAttribute('position');
          if (pos.count === 0) allFinite = false;
          for (let i = 0; i < pos.count; i++) {
            if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
              allFinite = false;
              break;
            }
          }
        }
      });
      expect(allFinite).toBe(true);

      const leftGlove = rig.root.getObjectByName('Left hand grip')!;
      const rightGlove = rig.root.getObjectByName('Right hand grip')!;
      const leftSleeve = rig.root.getObjectByName('Left arm sleeve') as THREE.Mesh;
      const rightSleeve = rig.root.getObjectByName('Right arm sleeve') as THREE.Mesh;
      expect(leftGlove).toBeDefined();
      expect(rightGlove).toBeDefined();
      expect(leftSleeve).toBeDefined();
      expect(rightSleeve).toBeDefined();

      const leftGloveBox = new THREE.Box3().setFromObject(leftGlove);
      const rightGloveBox = new THREE.Box3().setFromObject(rightGlove);
      // Rotating gloves stay strictly above the driver's legs (y <= 0.165 m in the central z <= 0.125 m corridor)
      // and below the digital dash binnacle top (0.51 m).
      expect(leftGloveBox.min.y).toBeGreaterThan(0.215);
      expect(rightGloveBox.min.y).toBeGreaterThan(0.215);
      expect(leftGloveBox.max.y).toBeLessThan(0.49);
      expect(rightGloveBox.max.y).toBeLessThan(0.49);

      // Dynamic arm sleeves stay connected at the shoulder (-0.332, 0.488, ±0.142) and wrist cuff,
      // in front of the bucket seat back (x > -0.39 m) and above the driver's legs (y > 0.21 m).
      for (const [side, sleeve, glove] of [
        [-1, leftSleeve, leftGlove],
        [1, rightSleeve, rightGlove],
      ] as const) {
        const sleeveBox = new THREE.Box3().setFromObject(sleeve);
        expect(sleeveBox.min.x).toBeGreaterThan(-0.39);
        expect(sleeveBox.min.y).toBeGreaterThan(0.21);
        expect(Math.max(Math.abs(sleeveBox.min.z), Math.abs(sleeveBox.max.z))).toBeLessThan(0.24);

        // Verify wrist end of sleeve connects to the rotating glove cuff (distance < 0.045 m)
        const wristTarget = rig.root.worldToLocal(glove.localToWorld(new THREE.Vector3(-0.032, 0, 0)));
        const pos = sleeve.geometry.getAttribute('position');
        let minWristDist = Infinity;
        let minShoulderDist = Infinity;
        const shoulderTarget = new THREE.Vector3(-0.335, 0.485, side * 0.122);
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          minWristDist = Math.min(minWristDist, v.distanceTo(wristTarget));
          minShoulderDist = Math.min(minShoulderDist, v.distanceTo(shoulderTarget));
        }
        expect(minShoulderDist).toBeLessThan(0.055);
        expect(minWristDist).toBeLessThan(0.045);
      }

      // Verify kinematic front steering linkage: Pitman arm, steering knuckles, and tie rods
      const pitmanArm = rig.root.getObjectByName('Steering pitman arm')!;
      const leftKnuckle = rig.root.getObjectByName('Left steering knuckle')!;
      const rightKnuckle = rig.root.getObjectByName('Right steering knuckle')!;
      const leftTieRod = rig.root.getObjectByName('Left tie rod')!;
      const rightTieRod = rig.root.getObjectByName('Right tie rod')!;
      const brakePedal = rig.root.getObjectByName('Brake pedal')!;
      const throttlePedal = rig.root.getObjectByName('Throttle pedal')!;
      const rearRotor = rig.root.getObjectByName('Rear brake rotor')!;
      const rearPulley = rig.root.getObjectByName('Rear drive pulley')!;
      expect(pitmanArm).toBeDefined();
      expect(leftKnuckle).toBeDefined();
      expect(rightKnuckle).toBeDefined();
      expect(leftTieRod).toBeDefined();
      expect(rightTieRod).toBeDefined();
      expect(brakePedal).toBeDefined();
      expect(throttlePedal).toBeDefined();
      expect(rearRotor).toBeDefined();
      expect(rearPulley).toBeDefined();

      expect(KINGPIN_HALF_TRACK_METERS).toBeCloseTo(0.185, 4);
      expect(SPINDLE_STUB_LENGTH_METERS).toBeCloseTo(0.100, 4);
      expect(leftKnuckle.position.z).toBeCloseTo(-KINGPIN_HALF_TRACK_METERS, 4);
      expect(rightKnuckle.position.z).toBeCloseTo(KINGPIN_HALF_TRACK_METERS, 4);

      const { leftRad, rightRad } = ackermannSteeringAngles(state.kart.steerAngleRad);
      if (state.kart.steerAngleRad < -1e-4) {
        // Left turn: inside (left) wheel steers sharper than outside (right) wheel
        expect(Math.abs(leftRad)).toBeGreaterThan(Math.abs(rightRad));
      } else if (state.kart.steerAngleRad > 1e-4) {
        // Right turn: inside (right) wheel steers sharper than outside (left) wheel
        expect(Math.abs(rightRad)).toBeGreaterThan(Math.abs(leftRad));
      }

      expect(pitmanArm.rotation.y).toBeCloseTo(-state.kart.steerAngleRad, 4);
      expect(leftKnuckle.rotation.y).toBeCloseTo(-leftRad, 4);
      expect(rightKnuckle.rotation.y).toBeCloseTo(-rightRad, 4);
      expect(brakePedal.rotation.z).toBeCloseTo(-state.kart.brakeInput * 0.24, 4);
      expect(throttlePedal.rotation.z).toBeCloseTo(-state.kart.throttleInput * 0.24, 4);

      // Verify each tie rod's midpoint and orientation match the exact Pitman ear -> Ackermann Knuckle steering arm endpoints
      for (const [side, knuckle, tieRod] of [
        [-1, leftKnuckle, leftTieRod],
        [1, rightKnuckle, rightTieRod],
      ] as const) {
        const innerBallWorld = pitmanArm.localToWorld(new THREE.Vector3(-0.008, 0, side * 0.038));
        const outerBallWorld = knuckle.localToWorld(new THREE.Vector3(-0.066, 0.047, -side * 0.022));
        const expectedMid = innerBallWorld.clone().add(outerBallWorld).multiplyScalar(0.5);
        expect(tieRod.position.distanceTo(expectedMid)).toBeLessThan(0.002);
      }
    };

    // 1. Static steering sweep across full left, center, and full right lock
    for (const steer of [-MAX_STEER_ANGLE_RAD, -0.5 * MAX_STEER_ANGLE_RAD, 0, 0.5 * MAX_STEER_ANGLE_RAD, MAX_STEER_ANGLE_RAD]) {
      validateDynamicState({
        ...snapshot,
        kart: {
          ...snapshot.kart,
          steerAngleRad: steer,
          steeringWheelAngleRad: steer * 2.2,
        },
      });
    }

    // 2. Live simulation action: acceleration, hard left turn, hard right turn, and braking
    const maneuvers = [
      { throttle: 1, brake: 0, steer: 0, ticks: 60 },
      { throttle: 0.8, brake: 0, steer: -1, ticks: 45 },
      { throttle: 0.8, brake: 0, steer: 1, ticks: 60 },
      { throttle: 0, brake: 1, steer: -0.6, ticks: 40 },
    ];
    for (const maneuver of maneuvers) {
      let current = session.getSnapshot();
      for (let t = 0; t < maneuver.ticks; t++) {
        current = session.step(1 / 120, maneuver);
      }
      validateDynamicState(current);
    }
  });
});

