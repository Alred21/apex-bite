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
import { KART_DIMENSIONS, MAX_STEER_ANGLE_RAD } from '../src/simulation/kart-parameters';
import { createSimulationSession } from '../src/simulation/session';
import { analogReferenceCommand } from './analog-driver';

describe('Barrier graze rule', () => {
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

  it('carries active wall-riding contact across the Start/Finish lap rollover without granting a Clean Lap', () => {
    const session = createSimulationSession();
    let snap = session.getSnapshot();

    // Drive through Flying Start + clean Lap 1 until entering the final 22 m straight before Start/Finish
    while (snap.lap.lapNumber < 1) {
      snap = session.step(1 / 120, analogReferenceCommand(snap, 1));
    }
    while (snap.lap.lapNumber === 1 && snap.kart.lapDistanceMeters < snap.circuit.totalLengthMeters - 22) {
      snap = session.step(1 / 120, analogReferenceCommand(snap, 1));
    }

    // Steer into the left Barrier until touching, then hold an ~8° inward wall-slide heading across Start/Finish
    const steerTowardLeftWall = (inwardAngleRad: number): number => {
      const idx = snap.circuit.samples.findIndex((s) => s.distanceMeters >= snap.kart.lapDistanceMeters);
      const i0 = (idx < 0 ? 0 : idx) % snap.circuit.samples.length;
      const a = snap.circuit.samples[i0].leftBarrier;
      const b = snap.circuit.samples[(i0 + 1) % snap.circuit.samples.length].leftBarrier;
      const wallYaw = Math.atan2(b.z - a.z, b.x - a.x);
      const targetYaw = wallYaw - inwardAngleRad;
      let err = targetYaw - snap.kart.headingRad;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      return Math.max(-1, Math.min(1, err * 4.0));
    };

    const lapBeforeCrossing = snap.lap.lapNumber;
    let totalContactTicksBeforeLine = 0;
    let consecutivePreLineTicks = 0;
    let crossedStartFinishInContact = false;
    for (let i = 0; i < 600; i++) {
      const prevLap = snap.lap.lapNumber;
      const steer = steerTowardLeftWall(snap.kart.barrierContact ? 0.14 : 0.42);
      snap = session.step(1 / 120, { throttle: 0.75, steer });
      if (snap.kart.barrierContact) {
        totalContactTicksBeforeLine += 1;
        consecutivePreLineTicks += 1;
      } else {
        consecutivePreLineTicks = 0;
      }
      if (snap.lap.lapNumber > prevLap) {
        crossedStartFinishInContact = snap.kart.barrierContact;
        break;
      }
    }

    expect(totalContactTicksBeforeLine).toBeGreaterThan(0);
    expect(snap.lap.lapNumber).toBeGreaterThan(lapBeforeCrossing);
    expect(crossedStartFinishInContact).toBe(true);
    // Remaining allowed duration in continuous contact across Start/Finish must stay <= 43 ticks total
    const remainingTicksForLimit = Math.max(2, 46 - consecutivePreLineTicks);
    for (let i = 0; i < remainingTicksForLimit && snap.lap.isClean; i++) {
      snap = session.step(1 / 120, { throttle: 0.75, steer: steerTowardLeftWall(0.14) });
    }
    expect(snap.lap.isClean).toBe(false);
  });
});

describe('OTL Superleggero 3D rig proportions and non-overlapping clearance', () => {
  it('matches calibrated heights, Ackermann spindle geometry, and stays within envelope across steering lock', () => {
    const rig = createKartRig();
    const session = createSimulationSession();
    const snapshot = session.getSnapshot();

    expect(STEERING_WHEEL_HUB_HEIGHT_METERS).toBeCloseTo(0.36, 3);
    expect(DASH_BINNACLE_HEIGHT_METERS).toBeCloseTo(0.483, 3);
    expect(HELMET_CAM_EYE_HEIGHT_METERS).toBeCloseTo(0.75, 2);
    expect(KINGPIN_HALF_TRACK_METERS).toBeCloseTo(0.185, 4);
    expect(SPINDLE_STUB_LENGTH_METERS).toBeCloseTo(0.1, 4);

    // Ackermann kinematics: inside front spindle turns sharper than outside front spindle
    const leftTurn = ackermannSteeringAngles(-MAX_STEER_ANGLE_RAD);
    expect(Math.abs(leftTurn.leftRad)).toBeGreaterThan(Math.abs(leftTurn.rightRad));
    const rightTurn = ackermannSteeringAngles(MAX_STEER_ANGLE_RAD);
    expect(Math.abs(rightTurn.rightRad)).toBeGreaterThan(Math.abs(rightTurn.leftRad));
    const straight = ackermannSteeringAngles(0);
    expect(straight.leftRad).toBeCloseTo(0, 6);
    expect(straight.rightRad).toBeCloseTo(0, 6);

    const visibleVertexStats = (state: typeof snapshot) => {
      rig.update(state);
      rig.root.position.set(0, 0, 0);
      rig.root.rotation.set(0, 0, 0);
      rig.root.updateMatrixWorld(true);

      let meshCount = 0;
      let visibleVertexCount = 0;
      let allFinite = true;
      rig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        let visible = true;
        let cur: THREE.Object3D | null = obj;
        while (cur) {
          if (!cur.visible) {
            visible = false;
            break;
          }
          cur = cur.parent;
        }
        const pos = obj.geometry.getAttribute('position');
        if (pos.count === 0) allFinite = false;
        for (let i = 0; i < pos.count; i++) {
          if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
            allFinite = false;
            break;
          }
        }
        meshCount += 1;
        if (visible) visibleVertexCount += pos.count;
      });
      const box = new THREE.Box3().setFromObject(rig.root);
      return { meshCount, visibleVertexCount, allFinite, box };
    };

    const chaseStats = visibleVertexStats(snapshot);
    expect(chaseStats.allFinite).toBe(true);
    expect(chaseStats.meshCount).toBeGreaterThan(10);
    // Whole kart stays inside physical solver collision envelope (±0.45 m width, [-0.80, +0.88] m length)
    expect(chaseStats.box.max.y).toBeGreaterThan(0.84);
    expect(chaseStats.box.max.y).toBeLessThan(0.89);
    expect(Math.max(Math.abs(chaseStats.box.min.z), Math.abs(chaseStats.box.max.z))).toBeLessThanOrEqual(
      KART_DIMENSIONS.halfWidthMeters,
    );
    expect(chaseStats.box.min.x).toBeGreaterThanOrEqual(-KART_DIMENSIONS.rearExtentMeters);
    expect(chaseStats.box.max.x).toBeLessThanOrEqual(KART_DIMENSIONS.frontExtentMeters);

    // Toggling to Helmet Cam hides the driver helmet & neck mesh without altering physics
    const helmetSnap = session.toggleCamera();
    expect(helmetSnap.camera.mode).toBe('Helmet Cam');
    const helmetStats = visibleVertexStats(helmetSnap);
    expect(helmetStats.visibleVertexCount).toBeLessThan(chaseStats.visibleVertexCount);
    session.toggleCamera();

    // Sweep static full steering lock and live driving maneuvers through public Session API
    for (const steer of [-MAX_STEER_ANGLE_RAD, -0.5 * MAX_STEER_ANGLE_RAD, 0, 0.5 * MAX_STEER_ANGLE_RAD, MAX_STEER_ANGLE_RAD]) {
      const stats = visibleVertexStats({
        ...snapshot,
        kart: {
          ...snapshot.kart,
          steerAngleRad: steer,
          steeringWheelAngleRad: steer * 2.2,
        },
      });
      expect(stats.allFinite).toBe(true);
      expect(Math.max(Math.abs(stats.box.min.z), Math.abs(stats.box.max.z))).toBeLessThanOrEqual(
        KART_DIMENSIONS.halfWidthMeters,
      );
    }

    for (const maneuver of [
      { throttle: 1, brake: 0, steer: 0, ticks: 60 },
      { throttle: 0.8, brake: 0, steer: -1, ticks: 45 },
      { throttle: 0.8, brake: 0, steer: 1, ticks: 60 },
      { throttle: 0, brake: 1, steer: -0.6, ticks: 40 },
    ]) {
      let current = session.getSnapshot();
      for (let t = 0; t < maneuver.ticks; t++) {
        current = session.step(1 / 120, maneuver);
      }
      const stats = visibleVertexStats(current);
      expect(stats.allFinite).toBe(true);
    }
  });
});

