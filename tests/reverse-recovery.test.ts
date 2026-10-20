import { describe, expect, it } from 'vitest';
import { createSimulationSession, type SimulationSession } from '../src/simulation/session';
import { driveReference } from './reference-driver';
import type { DriverInput } from '../src/simulation/types';

const DT = 1 / 120;
function hold(session: SimulationSession, input: DriverInput, ticks: number) {
  let snapshot = session.getSnapshot();
  for (let tick = 0; tick < ticks; tick++) snapshot = session.step(DT, input);
  return snapshot;
}
function stop(session: SimulationSession, input: DriverInput = { keys: { space: true } }) {
  let snapshot = session.getSnapshot();
  for (let tick = 0; tick < 900 && snapshot.kart.speedMps > 0; tick++) snapshot = session.step(DT, input);
  expect(snapshot.kart.speedMps).toBe(0);
  return snapshot;
}

describe('deliberate reverse recovery through SimulationSession', () => {
  it('holds the stopped Kart until Brake/Reverse is released and freshly pressed, then backs up at no more than 8 km/h', () => {
    const session = createSimulationSession();
    const stopped = stop(session);
    const held = hold(session, { keys: { space: true } }, 120);
    expect(held.kart.position).toEqual(stopped.kart.position);
    expect(held.kart.speedMps).toBe(0);
    session.step(DT, {});
    const reversing = hold(session, { keys: { space: true } }, 180);
    expect(reversing.kart.speedMps).toBeLessThan(-1);
    expect(reversing.kart.speedKph).toBeCloseTo(8, 8);
    expect(reversing.kart.driveDirection).toBe('Reverse');
    expect(reversing.kart.unwrappedDistanceMeters).toBeLessThan(stopped.kart.unwrappedDistanceMeters - 1);
  });

  it('steers while backing away from Barrier contact without resetting or clearing the Clean Lap rule', () => {
    const session = createSimulationSession();
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 600 && !snapshot.kart.barrierContact; tick++) snapshot = session.step(DT, { throttle: 1, steer: 1 });
    expect(snapshot.kart.barrierContact).toBe(true);
    const stopped = stop(session, { brake: 1 });
    session.step(DT, { brake: 0, steer: 0 });
    const reverse = hold(session, { gamepad: { brake: 0.7, steer: 0.2 } }, 180);
    expect(reverse.kart.speedMps).toBeLessThan(0);
    expect(reverse.kart.headingRad).toBeLessThan(stopped.kart.headingRad);
    expect(reverse.kart.barrierContact).toBe(false);
    expect(Math.hypot(reverse.kart.position.x - stopped.kart.position.x, reverse.kart.position.z - stopped.kart.position.z)).toBeGreaterThan(0.5);
    expect(reverse.lap.isClean).toBe(false);
  });

  it('brakes backward motion to zero before accelerator resumes forward drive, with equivalent analog pedals', () => {
    for (const analog of [false, true]) {
      const session = createSimulationSession();
      const brake = analog ? { gamepad: { brake: 0.7 } } : { keys: { space: true } };
      stop(session, brake);
      session.step(DT, {});
      const reverse = hold(session, brake, 100);
      expect(reverse.kart.speedMps).toBeLessThan(-1);
      const accelerator = analog ? { gamepad: { throttle: 0.7, brake: 0, steer: 0 } } : { keys: { up: true } };
      let snapshot = reverse;
      let observedZero = false;
      for (let tick = 0; tick < 150 && snapshot.kart.speedMps <= 0; tick++) {
        const previous = snapshot;
        snapshot = session.step(DT, accelerator);
        if (snapshot.kart.speedMps === 0) observedZero = true;
        if (previous.kart.speedMps < 0) expect(snapshot.kart.speedMps).toBeLessThanOrEqual(0);
      }
      expect(observedZero).toBe(true);
      expect(snapshot.kart.speedMps).toBeGreaterThan(0);
      expect(snapshot.kart.driveDirection).toBe('Forward');
      const neutral = session.step(DT, { gamepad: { throttle: 0, brake: 0, steer: 0 } });
      if (analog) expect(neutral.kart.throttleInput).toBe(0);
    }
  });

  it('does not award a lap or splits when backing across Start/Finish and hides ambiguous live comparisons', () => {
    const session = createSimulationSession({ referenceReplay: true });
    const initial = session.getSnapshot();
    const startProgress = initial.kart.unwrappedDistanceMeters - initial.kart.lapDistanceMeters;
    stop(session);
    session.step(DT, {});
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 1000 && snapshot.kart.unwrappedDistanceMeters >= startProgress; tick++) {
      snapshot = session.step(DT, { keys: { space: true } });
    }
    expect(snapshot.kart.unwrappedDistanceMeters).toBeLessThan(startProgress);
    expect(snapshot.lap.lapNumber).toBe(1);
    expect(snapshot.timeTrial.completedLaps).toEqual([]);
    expect(snapshot.lap.currentSectorSplits).toEqual([null, null, null]);
    expect(snapshot.lap.personalBestSeconds).toBeNull();
    expect(snapshot.lap.isClean).toBe(true);
    expect(snapshot.lap.timeDeltaSeconds).toBeNull();
  });

  it('preserves an observed Sector split through a backward and forward recrossing', () => {
    const session = createSimulationSession({ referenceReplay: true });
    const checkpoint = session.getSnapshot().circuit.turns[2].exitDistanceMeters;
    for (const command of session.getReferenceReplay().commands) {
      const snapshot = session.step(DT, command);
      if (snapshot.kart.lapDistanceMeters > checkpoint + 0.1) break;
    }
    const observed = session.getSnapshot().lap.currentSectorSplits[0];
    expect(observed).toBeGreaterThan(0);
    stop(session, { brake: 1 });
    session.step(DT, { brake: 0, steer: 0 });
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 1200 && snapshot.kart.lapDistanceMeters >= checkpoint - 0.2; tick++) snapshot = session.step(DT, { brake: 1, steer: 0 });
    expect(snapshot.kart.lapDistanceMeters).toBeLessThan(checkpoint);
    for (let tick = 0; tick < 1200 && snapshot.kart.lapDistanceMeters <= checkpoint + 0.2; tick++) snapshot = session.step(DT, { throttle: 0.4, steer: 0 });
    expect(snapshot.kart.lapDistanceMeters).toBeGreaterThan(checkpoint);
    expect(snapshot.lap.currentSectorSplits).toEqual([observed, null, null]);
    expect(snapshot.timeTrial.completedLaps).toEqual([]);
  });

  it('retains a clean recovery lap and portable backward Ghost poses without inventing a distance comparison', () => {
    const session = createSimulationSession({ referenceReplay: true });
    stop(session);
    session.step(DT, {});
    hold(session, { keys: { space: true } }, 90);
    // Reverse by itself does not invalidate a Clean Lap.
    expect(session.getSnapshot().lap.isClean).toBe(true);
    hold(session, { throttle: 0.7 }, 150);
    const completed = driveReference(session, 9500, 0.96, 2);
    expect(completed.lap.personalBestSeconds).toBeGreaterThan(0);
    const exported = JSON.parse(session.exportTrainingDataJson());
    const frames = exported.records[0].personalBestGhostFrames;
    expect(frames.some((frame: { distanceMeters: number }, index: number) => index > 0 && frame.distanceMeters < frames[index - 1].distanceMeters)).toBe(true);
    const imported = createSimulationSession({ referenceReplay: true });
    imported.importTrainingDataJson(JSON.stringify(exported));
    imported.cycleGhostMode();
    const snapshot = imported.step(DT, {});
    expect(snapshot.ghost.personalBestPose).not.toBeNull();
    expect(snapshot.lap.timeDeltaSeconds).toBeNull();
    expect(JSON.parse(imported.exportTrainingDataJson()).records[0].personalBestGhostFrames).toEqual(frames);
  });

  it('clears reverse engagement on input release, reset and practice changes', () => {
    const session = createSimulationSession();
    stop(session);
    session.step(DT, {});
    hold(session, { keys: { space: true } }, 60);
    session.releaseDriverInputs();
    // A still-held brake after pause is a stop, rather than stale reverse drive.
    const stopped = hold(session, { keys: { space: true } }, 120);
    expect(stopped.kart.speedMps).toBe(0);
    expect(hold(session, { keys: { space: true } }, 60).kart.speedMps).toBe(0);
    expect(session.reset().kart.driveDirection).toBe('Forward');
    expect(session.setPracticeMode('Corner Drill').kart.driveDirection).toBe('Forward');
    expect(session.setPracticeMode('Time Trial').kart.driveDirection).toBe('Forward');
  });
});
