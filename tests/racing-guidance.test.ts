import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

const DT = 1 / 120;

describe('Pose-aware Racing Line guidance through SimulationSession', () => {
  it('does not advise acceleration to a slow Kart after a badly aligned approach', () => {
    const session = createSimulationSession({ referenceReplay: true });
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 360; tick++) snapshot = session.step(DT, { brake: 1, steer: -0.7 });
    expect(snapshot.kart.speedMps).toBeLessThan(2);
    const nearby = snapshot.racingLine.points.reduce((best, point) =>
      Math.hypot(point.position.x - snapshot.kart.position.x, point.position.z - snapshot.kart.position.z) <
      Math.hypot(best.position.x - snapshot.kart.position.x, best.position.z - snapshot.kart.position.z) ? point : best);
    const headingError = Math.abs(Math.atan2(Math.sin(snapshot.kart.headingRad - nearby.headingRad), Math.cos(snapshot.kart.headingRad - nearby.headingRad)));
    expect(headingError).toBeGreaterThan(0.35);
    expect(snapshot.kart.speedKph).toBeLessThan(nearby.targetSpeedKph);
    expect(snapshot.racingLine.guidance.action).not.toBe('Accelerate');
    expect(snapshot.racingLine.guidance.cue).not.toBe('Green');
    expect(snapshot.racingLine.guidance.reason).toMatch(/align|rejoin|recover/i);
  });

  it('anticipates future Turn braking constraints even while the Kart matches the local Reference Lap speed', () => {
    const session = createSimulationSession({ referenceReplay: true });
    const replay = session.getReferenceReplay();
    const brakeTick = replay.commands.findIndex((command) => command.brake > 0.2);
    expect(brakeTick).toBeGreaterThan(0);
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick <= brakeTick; tick++) snapshot = session.step(DT, replay.commands[tick]);
    expect(snapshot.kart.barrierContact).toBe(false);
    expect(snapshot.racingLine.guidance.action).toBe('Brake');
    expect(snapshot.racingLine.guidance.targetSpeedKph).toBeLessThan(snapshot.kart.speedKph);
    expect(snapshot.racingLine.guidance.reason).toMatch(/ahead|Turn/);
  });

  it('distinguishes a slow aligned Kart from a slow parallel Kart displaced from the Racing Line', () => {
    const approach = (rightTicks: number, leftTicks: number) => {
      const session = createSimulationSession();
      for (let tick = 0; tick < rightTicks; tick++) session.step(DT, { steer: 0.5 });
      for (let tick = 0; tick < leftTicks; tick++) session.step(DT, { steer: -0.5, brake: 0.4 });
      let snapshot = session.getSnapshot();
      for (let tick = 0; tick < 240; tick++) snapshot = session.step(DT, { steer: 0, brake: 1 });
      const nearest = snapshot.racingLine.points.reduce((best, point) =>
        Math.hypot(point.position.x - snapshot.kart.position.x, point.position.z - snapshot.kart.position.z) <
        Math.hypot(best.position.x - snapshot.kart.position.x, best.position.z - snapshot.kart.position.z) ? point : best);
      return { snapshot, distance: Math.hypot(nearest.position.x - snapshot.kart.position.x, nearest.position.z - snapshot.kart.position.z),
        heading: Math.abs(Math.atan2(Math.sin(snapshot.kart.headingRad - nearest.headingRad), Math.cos(snapshot.kart.headingRad - nearest.headingRad))) };
    };
    const aligned = approach(30, 30);
    const displaced = approach(40, 30);
    expect(aligned.snapshot.kart.speedMps).toBeLessThan(0.1);
    expect(displaced.snapshot.kart.speedMps).toBeLessThan(0.1);
    expect(displaced.snapshot.kart.barrierContactCount).toBe(0);
    expect(aligned.distance).toBeLessThan(0.4);
    expect(displaced.distance).toBeGreaterThan(0.85);
    expect(displaced.heading).toBeLessThan(0.15);
    expect(aligned.snapshot.racingLine.guidance.action).toBe('Accelerate');
    expect(displaced.snapshot.racingLine.guidance.action).toBe('Coast');
  });

  it('cycles Full, Corners Only and Off without changing geometry, guidance or reference timing', () => {
    const session = createSimulationSession();
    const full = session.getSnapshot();
    expect(full.racingLine.displayMode).toBe('Full');
    expect(full.racingLine.points.every((point) => point.displayed)).toBe(true);
    const corners = session.toggleRacingLine();
    expect(corners.racingLine.displayMode).toBe('Corners Only');
    expect(corners.racingLine.points.some((point) => point.displayed)).toBe(true);
    expect(corners.racingLine.points.some((point) => !point.displayed)).toBe(true);
    const off = session.toggleRacingLine();
    expect(off.racingLine.displayMode).toBe('Off');
    expect(off.racingLine.visible).toBe(false);
    expect(off.racingLine.points.every((point) => !point.displayed)).toBe(true);
    for (const snapshot of [corners, off]) {
      expect(snapshot.racingLine.guidance).toEqual(full.racingLine.guidance);
      expect(snapshot.racingLine.points.map(({ displayed, ...point }) => point))
        .toEqual(full.racingLine.points.map(({ displayed, ...point }) => point));
      expect(snapshot.racingLine.benchmarkLapSeconds).toBe(full.racingLine.benchmarkLapSeconds);
      expect(snapshot.kart).toEqual(full.kart);
      expect(snapshot.ghost).toEqual(full.ghost);
    }
    expect(session.toggleRacingLine().racingLine.displayMode).toBe('Full');
  });
});
