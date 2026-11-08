import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createKartRig,
  DASH_BINNACLE_HEIGHT_METERS,
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
  it('matches true-scale reclined heights and maintains zero mesh overlap across full steering lock', () => {
    const rig = createKartRig();
    const snapshot = createSimulationSession().getSnapshot();

    expect(STEERING_WHEEL_HUB_HEIGHT_METERS).toBeCloseTo(0.355, 3);
    expect(DASH_BINNACLE_HEIGHT_METERS).toBeCloseTo(0.478, 3);
    expect(HELMET_CAM_EYE_HEIGHT_METERS).toBeCloseTo(0.75, 2);

    rig.update(snapshot);
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

    for (const steer of [-MAX_STEER_ANGLE_RAD, 0, MAX_STEER_ANGLE_RAD]) {
      rig.update({
        ...snapshot,
        kart: {
          ...snapshot.kart,
          steerAngleRad: steer,
          steeringWheelAngleRad: steer * 2.2,
        },
      });
      rig.root.updateMatrixWorld(true);
      const leftGlove = rig.root.getObjectByName('Left hand grip')!;
      const rightGlove = rig.root.getObjectByName('Right hand grip')!;
      expect(leftGlove).toBeDefined();
      expect(rightGlove).toBeDefined();
      const leftGloveBox = new THREE.Box3().setFromObject(leftGlove);
      const rightGloveBox = new THREE.Box3().setFromObject(rightGlove);
      // Rotating gloves stay strictly above the driver's legs (y <= 0.165 m in the central z <= 0.125 m corridor)
      // and below the digital dash binnacle top (0.51 m).
      expect(leftGloveBox.min.y).toBeGreaterThan(0.215);
      expect(rightGloveBox.min.y).toBeGreaterThan(0.215);
      expect(leftGloveBox.max.y).toBeLessThan(0.49);
      expect(rightGloveBox.max.y).toBeLessThan(0.49);
    }
  });
});

