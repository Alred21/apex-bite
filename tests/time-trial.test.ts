import { describe, expect, it } from 'vitest';
import { driveReference } from './reference-driver';
import { createSimulationSession, SimulationSession } from '../src/simulation/session';

/**
 * Helper autopilot that steers smoothly along the optimal Racing Line at a configurable throttle/speed scale
 * without touching Barriers.
 */
function driveAlongRacingLine(
  session: SimulationSession, maxSteps: number, speedScale = 1, stopOnLapNumber?: number,
): ReturnType<SimulationSession['getSnapshot']> {
  return driveReference(session, maxSteps, speedScale, stopOnLapNumber);
}

describe('Ticket #6: Time Trial Mode — Flying Start, Sector Splits, Time-Delta Bar, Ghost Kart & Persistence', () => {
  it('spawns in a rolling Flying Start exiting Turn 11 at the achieved Reference Lap speed and begins timed Lap 1 across the Start/Finish line', () => {
    const session = createSimulationSession();
    const initial = session.getSnapshot();

    expect(initial.mode).toBe('Time Trial');
    expect(initial.kart.speedKph).toBeGreaterThanOrEqual(34.0);
    expect(initial.kart.speedKph).toBeCloseTo(40.0305110142, 5);
    expect(initial.kart.speedKph).toBeLessThanOrEqual(45.0);
    const replay = session.getReferenceReplay();
    expect(replay.frames.some((frame) => frame.kart.speedKph === initial.kart.speedKph && frame.kart.position.x === initial.kart.position.x && frame.kart.position.z === initial.kart.position.z)).toBe(true);
    expect(initial.kart.lapDistanceMeters).toBeGreaterThan(initial.circuit.totalLengthMeters - 18);
    expect(initial.kart.lapDistanceMeters).toBeLessThan(initial.circuit.totalLengthMeters - 8);

    // Drive across the checkered Start/Finish line into timed Lap 1
    const afterStart = driveAlongRacingLine(session, 240, 1.0, 1);
    expect(afterStart.lap.lapNumber).toBe(1);
    expect(afterStart.kart.lapDistanceMeters).toBeLessThan(15);
  });

  it('records S1/S2/S3 Sector splits, updates live Time-Delta Bar, and persists Clean Lap Personal Best + Ghost replay', () => {
    const session = createSimulationSession();

    // Cross start/finish into Lap 1, then complete full Lap 1 into Lap 2
    driveAlongRacingLine(session, 240, 0.96, 1);
    const completedSnap = driveAlongRacingLine(session, 9000, 0.96, 2);

    expect(completedSnap.lap.lapNumber).toBe(2);
    expect(completedSnap.lap.lastLapSeconds).not.toBeNull();
    expect(completedSnap.lap.lastLapSeconds!).toBeGreaterThan(23.5);
    expect(completedSnap.lap.lastLapSeconds!).toBeLessThan(65.0);

    // All 3 Sector splits must be populated and sum close to lastLapSeconds
    const splits = completedSnap.lap.lastSectorSplits;
    expect(splits[0]).not.toBeNull();
    expect(splits[1]).not.toBeNull();
    expect(splits[2]).not.toBeNull();
    const sumSplits = (splits[0] ?? 0) + (splits[1] ?? 0) + (splits[2] ?? 0);
    expect(sumSplits).toBeCloseTo(completedSnap.lap.lastLapSeconds!, 1);

    // Clean lap saves Personal Best & Personal Best Ghost
    expect(completedSnap.lap.personalBestSeconds).toBeCloseTo(
      completedSnap.lap.lastLapSeconds!,
      3,
    );
    expect(typeof completedSnap.lap.timeDeltaSeconds).toBe('number');
  });

  it('prevents Dirty laps (with Barrier contact) from overwriting a saved Clean Lap Personal Best', () => {
    const session = createSimulationSession();
    driveAlongRacingLine(session, 240, 0.9, 1);
    const lap1End = driveAlongRacingLine(session, 9500, 0.9, 2);
    const savedPb = lap1End.lap.personalBestSeconds!;
    expect(savedPb).toBeGreaterThan(24.0);

    // On Lap 2, deliberately graze a Barrier so the lap is Dirty, then finish faster
    for (let i = 0; i < 120; i++) {
      const s = session.step(1 / 120, { throttle: 1, steer: -1 });
      if (!s.lap.isClean) break;
    }
    expect(session.getSnapshot().lap.isClean).toBe(false);

    const lap2End = driveAlongRacingLine(session, 9500, 1.02, 3);
    expect(lap2End.lap.lastLapSeconds).not.toBeNull();
    // Personal Best must remain the Clean Lap 1 time
    expect(lap2End.lap.personalBestSeconds).toBe(savedPb);
  });

  it('cycles Ghost Kart visibility modes and exports/imports training data via JSON', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().ghost.mode).toBe('Reference Lap');
    expect(session.getSnapshot().ghost.trackRecordPose).toBeNull();

    expect(session.cycleGhostMode().ghost.mode).toBe('Personal Best');
    expect(session.cycleGhostMode().ghost.mode).toBe('Both');
    expect(session.cycleGhostMode().ghost.mode).toBe('Off');
    expect(session.cycleGhostMode().ghost.mode).toBe('Reference Lap');

    // Record a Clean Personal Best, export to JSON, and import into a fresh session
    driveAlongRacingLine(session, 240, 0.95, 1);
    const done = driveAlongRacingLine(session, 9000, 0.95, 2);
    const pb = done.lap.personalBestSeconds!;
    expect(pb).toBeGreaterThan(23.5);

    const exportedJson = session.exportTrainingDataJson();
    const freshSession = createSimulationSession();
    const importedSnap = freshSession.importTrainingDataJson(exportedJson);

    expect(importedSnap.lap.personalBestSeconds).toBeCloseTo(pb, 3);
    expect(importedSnap.lap.bestSectorSplits).toEqual(done.lap.bestSectorSplits);
  });
});

describe('Time Trial session lifecycle', () => {
  it('keeps timing the same lap through repeated local Start/Finish recrossings until a complete Circuit traversal', () => {
    const session = createSimulationSession({ referenceReplay: true });
    session.setTimeTrialLapLimit(1);
    let snap = session.getSnapshot();
    const line = snap.kart.unwrappedDistanceMeters - snap.kart.lapDistanceMeters;
    let forwardCrossings = 0, previousTimedSeconds = 0;
    const advance = (input: Parameters<SimulationSession['step']>[1]) => {
      const previous = snap;
      snap = session.step(1 / 120, input);
      if (previous.kart.lapProgress > 0.8 && snap.kart.lapProgress < 0.2) forwardCrossings++;
      expect(snap.lap.currentLapSeconds).toBeGreaterThanOrEqual(previousTimedSeconds);
      previousTimedSeconds = snap.lap.currentLapSeconds;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let tick = 0; tick < 900 && snap.kart.speedMps > 0; tick++) advance({ brake: 1 });
      advance({});
      for (let tick = 0; tick < 1200 && snap.kart.unwrappedDistanceMeters >= line - 0.5; tick++) advance({ brake: 1 });
      expect(snap.kart.unwrappedDistanceMeters).toBeLessThan(line - 0.5);
      for (let tick = 0; tick < 1200 && snap.kart.unwrappedDistanceMeters <= line + 0.5; tick++) advance({ throttle: 0.4 });
      expect(snap.kart.unwrappedDistanceMeters).toBeGreaterThan(line + 0.5);
    }
    expect(forwardCrossings).toBeGreaterThanOrEqual(2);
    expect(snap.lap.lapNumber).toBe(1);
    expect(snap.timeTrial.completedLaps).toEqual([]);
    expect(snap.lap.currentSectorSplits).toEqual([null, null, null]);
    expect(snap.timeTrial.status).toBe('Driving');
    expect(snap.lap.currentLapSeconds).toBeGreaterThan(10);
  });

  it('excludes the Flying Start and finishes exactly once after twelve timed laps with complete results', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().timeTrial.lapLimit).toBe(12);
    expect(session.getSnapshot().timeTrial.completedLaps).toEqual([]);
    driveAlongRacingLine(session, 240, 0.96, 1);
    expect(session.getSnapshot().timeTrial.completedLaps).toEqual([]);

    for (let lapNumber = 2; lapNumber <= 12; lapNumber++) {
      const snap = driveAlongRacingLine(session, 9000, 0.96, lapNumber);
      expect(snap.lap.lapNumber).toBe(lapNumber);
      expect(snap.timeTrial.status).toBe('Driving');
      expect(snap.timeTrial.completedLaps).toHaveLength(lapNumber - 1);
    }
    driveAlongRacingLine(session, 9000, 0.96, 13);
    const finished = session.getSnapshot();
    expect(finished.timeTrial.status).toBe('Finished');
    expect(finished.timeTrial.completedLaps).toHaveLength(12);
    expect(finished.lap.lapNumber).toBe(12);
    expect(finished.timeTrial.totalSeconds).toBeCloseTo(
      finished.timeTrial.completedLaps.reduce((sum, lap) => sum + lap.seconds, 0), 6,
    );
    expect(finished.timeTrial.bestCleanLapSeconds).toBe(finished.lap.personalBestSeconds);
    expect(finished.timeTrial.completedLaps.every((lap) =>
      lap.isClean && lap.sectorSplits.every((seconds) => seconds !== null && seconds > 0),
    )).toBe(true);
    const frozen = JSON.stringify(finished);
    for (let i = 0; i < 100; i++) session.step(1 / 120, { throttle: 1, steer: 1 });
    expect(JSON.stringify(session.getSnapshot())).toBe(frozen);
  });

  it('counts a contact lap toward a selected limit without awarding a Clean Lap Personal Best, and restarts consistently', () => {
    const session = createSimulationSession();
    session.setTimeTrialLapLimit(1);
    driveAlongRacingLine(session, 240, 0.9, 1);
    for (let i = 0; i < 120 && session.getSnapshot().lap.isClean; i++) {
      session.step(1 / 120, { throttle: 1, steer: -1 });
    }
    expect(session.getSnapshot().lap.isClean).toBe(false);
    driveAlongRacingLine(session, 9000, 0.9, 2);
    const finished = session.getSnapshot();
    expect(finished.timeTrial.status).toBe('Finished');
    expect(finished.timeTrial.completedLaps).toHaveLength(1);
    expect(finished.timeTrial.completedLaps[0].isClean).toBe(false);
    expect(finished.timeTrial.bestCleanLapSeconds).toBeNull();
    expect(finished.lap.personalBestSeconds).toBeNull();
    expect(finished.timeTrial.totalSeconds).toBe(finished.lap.lastLapSeconds);

    const restarted = session.reset();
    expect(restarted.timeTrial.status).toBe('Flying Start');
    expect(restarted.timeTrial.lapLimit).toBe(1);
    expect(restarted.timeTrial.completedLaps).toEqual([]);
    expect(restarted.timeTrial.totalSeconds).toBe(0);
    expect(restarted.lap.currentLapSeconds).toBe(0);
    expect(restarted.lap.lastLapSeconds).toBeNull();
    session.step();
    expect(session.getSnapshot().lap.currentLapSeconds).toBe(0);
    session.setPracticeMode('Corner Drill');
    const reentered = session.setPracticeMode('Time Trial');
    expect(reentered.timeTrial).toEqual(restarted.timeTrial);
    expect(reentered.lap.lapNumber).toBe(0);
  });

  it('continues beyond twelve completed laps only when unlimited practice was explicitly selected', () => {
    const session = createSimulationSession();
    session.setTimeTrialLapLimit(null);
    driveAlongRacingLine(session, 240, 0.96, 1);
    for (let lapNumber = 2; lapNumber <= 14; lapNumber++) {
      driveAlongRacingLine(session, 9000, 0.96, lapNumber);
    }
    const unlimited = session.getSnapshot();
    expect(unlimited.timeTrial.lapLimit).toBeNull();
    expect(unlimited.timeTrial.status).toBe('Driving');
    expect(unlimited.timeTrial.completedLaps).toHaveLength(13);
    expect(unlimited.lap.lapNumber).toBe(14);
    const selected = session.setTimeTrialLapLimit(12);
    expect(selected.timeTrial.status).toBe('Flying Start');
    expect(selected.timeTrial.completedLaps).toEqual([]);
    expect(selected.lap.personalBestSeconds).toBe(unlimited.lap.personalBestSeconds);
  });

});
