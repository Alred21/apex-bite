import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Validated Racing Line and live cues', () => {
  it('uses an achieved Reference Lap with separately labeled Real-World Benchmark and infeasible baseline evidence', () => {
    const session = createSimulationSession();
    const snap = session.getSnapshot();
    const replay = session.getReferenceReplay();
    expect(snap.racingLine.reference.validated).toBe(true);
    expect(snap.racingLine.benchmarkLapSeconds).toBe(replay.lapSeconds);
    expect(snap.racingLine.reference.realWorldBenchmarkSeconds).toBe(24.499);
    expect(snap.racingLine.reference.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Conservative centerline', feasible: true, lapSeconds: replay.lapSeconds }),
      expect.objectContaining({ name: 'Prior pinned-apex heuristic', feasible: false, lapSeconds: null, reason: expect.any(String) }),
    ]));
    for (const point of snap.racingLine.points) {
      expect(point.targetSpeedKph).toBeGreaterThan(0);
      expect(point.targetSpeedKph).toBeLessThanOrEqual(45);
    }
  });

  it('is ON by default and toggles cleanly via toggleRacingLine()', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().racingLine.visible).toBe(true);

    const offSnap = session.toggleRacingLine();
    expect(offSnap.racingLine.visible).toBe(false);

    const onSnap = session.toggleRacingLine();
    expect(onSnap.racingLine.visible).toBe(true);
  });

  it('dynamically shifts upcoming Racing Line segment colors between Green/Yellow and Red based on live Kart speed vs target speed', () => {
    // Low-speed session at s = 0 (0 km/h approaching Turn 1): segments ahead should cue Green (Full Throttle)
    const slowSession = createSimulationSession();
    const slowSnap = slowSession.getSnapshot();
    const turn1ApexIdx = Math.round(
      (slowSnap.circuit.turns[0].apexDistanceMeters / slowSnap.circuit.totalLengthMeters) *
        slowSnap.racingLine.points.length,
    );
    const slowCuesBeforeT1 = slowSnap.racingLine.points
      .slice(4, turn1ApexIdx)
      .map((p) => p.liveCue);
    expect(slowCuesBeforeT1).toContain('Green');
    expect(slowCuesBeforeT1).not.toContain('Red');

    // Fast session accelerating to ~44 km/h right into the Turn 1 braking zone: segments ahead must shift to Red (Brake)
    const fastSession = createSimulationSession();
    let fastSnap = fastSession.getSnapshot();
    for (let i = 0; i < 165; i++) {
      fastSnap = fastSession.step(1 / 120, { keys: { up: true } });
    }
    const fastCuesAroundT1 = fastSnap.racingLine.points
      .slice(10, turn1ApexIdx + 6)
      .map((p) => p.liveCue);
    expect(fastCuesAroundT1).toContain('Red');
  });
});
