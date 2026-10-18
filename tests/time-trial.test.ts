import { describe, expect, it } from 'vitest';
import { createSimulationSession, SimulationSession } from '../src/simulation/session';

/**
 * Helper autopilot that steers smoothly along the optimal Racing Line at a configurable throttle/speed scale
 * without touching Barriers.
 */
function driveAlongRacingLine(
  session: SimulationSession,
  maxSteps: number,
  speedScale = 0.9,
  stopOnLapNumber?: number,
): ReturnType<SimulationSession['getSnapshot']> {
  let snap = session.getSnapshot();
  for (let i = 0; i < maxSteps; i++) {
    const pts = snap.racingLine.points;
    const samples = snap.circuit.samples;
    const n = pts.length;
    const curIdx = Math.floor(snap.kart.lapProgress * n) % n;
    const curPt = pts[curIdx];
    const lookPt = pts[(curIdx + 2) % n];
    const lookSample = samples[(curIdx + 2) % n];
    const futurePt = pts[(curIdx + 8) % n];

    // Blend racing line point with slight safety margin from inside barrier on tight hairpins
    const targetX = lookPt.position.x * 0.75 + lookSample.center.x * 0.25;
    const targetZ = lookPt.position.z * 0.75 + lookSample.center.z * 0.25;

    const dx = targetX - snap.kart.position.x;
    const dz = targetZ - snap.kart.position.z;
    const desiredHeading = Math.atan2(dz, dx);
    let headingErr = desiredHeading - snap.kart.headingRad;
    while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
    while (headingErr < -Math.PI) headingErr += 2 * Math.PI;

    const steer = Math.max(-1, Math.min(1, headingErr * 3.2));
    const targetSpeed =
      Math.min(curPt.targetSpeedMps, lookPt.targetSpeedMps, futurePt.targetSpeedMps) *
      speedScale;
    const speedErr = targetSpeed - snap.kart.speedMps;
    const throttle = speedErr > -0.1 ? 1.0 : 0.0;
    const brake = speedErr < -0.25 ? Math.min(0.85, -speedErr * 0.55) : 0.0;

    snap = session.step(1 / 120, { throttle, brake, steer });
    if (stopOnLapNumber !== undefined && snap.lap.lapNumber >= stopOnLapNumber) {
      break;
    }
  }
  return snap;
}

describe('Ticket #6: Time Trial Mode — Flying Start, Sector Splits, Time-Delta Bar, Ghost Kart & Persistence', () => {
  it('spawns in a rolling Flying Start exiting Turn 11 (~36 km/h) and begins timed Lap 1 across the Start/Finish line', () => {
    const session = createSimulationSession();
    const initial = session.getSnapshot();

    expect(initial.mode).toBe('Time Trial');
    expect(initial.kart.speedKph).toBeGreaterThanOrEqual(34.0);
    expect(initial.kart.speedKph).toBeLessThanOrEqual(38.0);
    expect(initial.kart.lapDistanceMeters).toBeGreaterThan(230);
    expect(initial.kart.lapDistanceMeters).toBeLessThan(244);

    // Drive across the checkered Start/Finish line into timed Lap 1
    const afterStart = driveAlongRacingLine(session, 240, 1.0, 1);
    expect(afterStart.lap.lapNumber).toBe(1);
    expect(afterStart.kart.lapDistanceMeters).toBeLessThan(15);
  });

  it('records S1/S2/S3 Sector splits, updates live Time-Delta Bar, and persists Clean Lap Personal Best + Ghost replay', () => {
    const session = createSimulationSession();

    // Cross start/finish into Lap 1, then complete full Lap 1 into Lap 2
    driveAlongRacingLine(session, 240, 0.96, 1);
    const completedSnap = driveAlongRacingLine(session, 4500, 0.96, 2);

    expect(completedSnap.lap.lapNumber).toBe(2);
    expect(completedSnap.lap.lastLapSeconds).not.toBeNull();
    expect(completedSnap.lap.lastLapSeconds!).toBeGreaterThan(23.5);
    expect(completedSnap.lap.lastLapSeconds!).toBeLessThan(32.0);

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
    const lap1End = driveAlongRacingLine(session, 4800, 0.9, 2);
    const savedPb = lap1End.lap.personalBestSeconds!;
    expect(savedPb).toBeGreaterThan(24.0);

    // On Lap 2, deliberately graze a Barrier so the lap is Dirty, then finish faster
    for (let i = 0; i < 120; i++) {
      const s = session.step(1 / 120, { throttle: 1, steer: -1 });
      if (!s.lap.isClean) break;
    }
    expect(session.getSnapshot().lap.isClean).toBe(false);

    const lap2End = driveAlongRacingLine(session, 4800, 1.02, 3);
    expect(lap2End.lap.lastLapSeconds).not.toBeNull();
    // Personal Best must remain the Clean Lap 1 time
    expect(lap2End.lap.personalBestSeconds).toBe(savedPb);
  });

  it('cycles Ghost Kart visibility modes and exports/imports training data via JSON', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().ghost.mode).toBe('Track Record');
    expect(session.getSnapshot().ghost.trackRecordPose).not.toBeNull();

    expect(session.cycleGhostMode().ghost.mode).toBe('Personal Best');
    expect(session.cycleGhostMode().ghost.mode).toBe('Both');
    expect(session.cycleGhostMode().ghost.mode).toBe('Off');
    expect(session.cycleGhostMode().ghost.mode).toBe('Track Record');

    // Record a Clean Personal Best, export to JSON, and import into a fresh session
    driveAlongRacingLine(session, 240, 0.95, 1);
    const done = driveAlongRacingLine(session, 4500, 0.95, 2);
    const pb = done.lap.personalBestSeconds!;
    expect(pb).toBeGreaterThan(23.5);

    const exportedJson = session.exportTrainingDataJson();
    const freshSession = createSimulationSession();
    const importedSnap = freshSession.importTrainingDataJson(exportedJson);

    expect(importedSnap.lap.personalBestSeconds).toBeCloseTo(pb, 3);
    expect(importedSnap.lap.bestSectorSplits).toEqual(done.lap.bestSectorSplits);
  });
});
