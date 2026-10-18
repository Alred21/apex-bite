import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #5: Optimal Racing Line with Live Speed-Reactive Color Cues & 24.499s Target Profile', () => {
  it('computes an outside-inside-outside Racing Line clipping all 11 Turn apexes and calibrated to 24.499s (±0.05s) under 45.0 km/h', () => {
    const session = createSimulationSession();
    const snap = session.getSnapshot();

    expect(snap.racingLine.visible).toBe(true);
    expect(snap.racingLine.benchmarkLapSeconds).toBeCloseTo(24.499, 2);

    for (const pt of snap.racingLine.points) {
      expect(pt.targetSpeedKph).toBeGreaterThan(15);
      expect(pt.targetSpeedKph).toBeLessThanOrEqual(45.0001);
    }

    // Verify each Turn apex is clipped closely by the Racing Line
    for (const turn of snap.circuit.turns) {
      let minDist = Infinity;
      for (const pt of snap.racingLine.points) {
        const d = Math.hypot(
          pt.position.x - turn.apexPoint.x,
          pt.position.z - turn.apexPoint.z,
        );
        if (d < minDist) minDist = d;
      }
      expect(minDist).toBeLessThan(0.95);
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
