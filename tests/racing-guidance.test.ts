import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';
import { analogReferenceCommand } from './analog-driver';

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
    const approach = (lateralOffsetMeters: number) => {
      const session = createSimulationSession({ referenceReplay: true });
      let snapshot = session.getSnapshot();
      // An ordinary analog driver follows the selected line (or a parallel lane),
      // then slows to rest. No phase-specific steering taps or injected poses.
      for (let tick = 0; tick < 300; tick++) {
        snapshot = session.step(DT, analogReferenceCommand(snapshot, 0.2, { lateralOffsetMeters }));
      }
      for (let tick = 0; tick < 300; tick++) {
        snapshot = session.step(DT, { ...analogReferenceCommand(snapshot, 0, { lateralOffsetMeters }), brake: 1, throttle: 0 });
      }
      const nearest = snapshot.racingLine.points.reduce((best, point) =>
        Math.hypot(point.position.x - snapshot.kart.position.x, point.position.z - snapshot.kart.position.z) <
        Math.hypot(best.position.x - snapshot.kart.position.x, best.position.z - snapshot.kart.position.z) ? point : best);
      return { snapshot, distance: Math.hypot(nearest.position.x - snapshot.kart.position.x, nearest.position.z - snapshot.kart.position.z),
        heading: Math.abs(Math.atan2(Math.sin(snapshot.kart.headingRad - nearest.headingRad), Math.cos(snapshot.kart.headingRad - nearest.headingRad))) };
    };
    const aligned = approach(0);
    const displaced = approach(-1.1);
    expect(aligned.snapshot.kart.speedMps).toBeLessThan(0.1);
    expect(displaced.snapshot.kart.speedMps).toBeLessThan(0.1);
    expect(displaced.snapshot.kart.barrierContactCount).toBe(0);
    expect(aligned.distance).toBeLessThan(0.4);
    expect(displaced.distance).toBeGreaterThan(0.85);
    expect(displaced.heading).toBeLessThan(0.25);
    expect(aligned.snapshot.racingLine.guidance.action).toBe('Accelerate');
    expect(displaced.snapshot.racingLine.guidance.action).toBe('Coast');
  });

  it('permits progressive acceleration in aligned Reference Lap acceleration zones and braking across connected Turns', () => {
    const session = createSimulationSession({ referenceReplay: true });
    const replay = session.getReferenceReplay();
    let accelerateSamples = 0;
    const turnsWithBraking = new Set<number>();
    for (const command of replay.commands) {
      const snapshot = session.step(DT, command);
      if (command.throttle > 0.4 && snapshot.racingLine.guidance.action === 'Accelerate') accelerateSamples++;
      if (snapshot.kart.currentTurn && snapshot.racingLine.guidance.action === 'Brake') turnsWithBraking.add(snapshot.kart.currentTurn);
    }
    expect(accelerateSamples).toBeGreaterThan(20);
    // Connected-Turn compromises can move braking from one Turn to its neighbor.
    expect([4, 5].some(turn => turnsWithBraking.has(turn))).toBe(true);
    expect([6, 7, 8].some(turn => turnsWithBraking.has(turn))).toBe(true);
    expect(turnsWithBraking.size).toBeGreaterThanOrEqual(3);
  });

  it('warns earlier on the faster approach and clears section braking demand after slowing at a closely matched pose', () => {
    const approach = (brake: number) => {
      const session = createSimulationSession({ referenceReplay: true });
      let snapshot = session.getSnapshot();
      for (let tick = 0; tick < 300 && snapshot.kart.lapDistanceMeters < 6; tick++) {
        snapshot = session.step(DT, brake ? { brake } : { throttle: 1 });
      }
      return snapshot;
    };
    const fast = approach(0), slow = approach(0.3);
    // Natural trajectories, without teleporting or editing Session state.
    expect(Math.hypot(fast.kart.position.x - slow.kart.position.x, fast.kart.position.z - slow.kart.position.z)).toBeLessThan(0.05);
    expect(Math.abs(fast.kart.headingRad - slow.kart.headingRad)).toBeLessThan(0.01);
    expect(fast.kart.speedKph - slow.kart.speedKph).toBeGreaterThan(10);
    expect(fast.circuit.turns[0].entryDistanceMeters - fast.kart.lapDistanceMeters).toBeGreaterThan(5);
    const upcoming = (snapshot: typeof fast) => snapshot.racingLine.points.filter(point =>
      (point.distanceMeters - snapshot.kart.lapDistanceMeters + snapshot.circuit.totalLengthMeters) % snapshot.circuit.totalLengthMeters < 20);
    expect(upcoming(fast).filter(point => point.liveCue === 'Red').length).toBeGreaterThan(5);
    expect(upcoming(slow).some(point => point.liveCue === 'Red')).toBe(false);
    expect(upcoming(slow).some(point => point.liveCue === 'Yellow')).toBe(true);
    expect(fast.racingLine.guidance.action).toBe('Brake');
    expect(slow.racingLine.guidance.action).not.toBe('Brake');
    expect(fast.racingLine.points.map(({liveCue, ...point}) => point))
      .toEqual(slow.racingLine.points.map(({liveCue, ...point}) => point));
    expect(fast.racingLine.benchmarkLapSeconds).toBe(slow.racingLine.benchmarkLapSeconds);
  });

  it("keeps a low-speed recovery explanation separate from the sections' actual braking demand", () => {
    const session = createSimulationSession({ referenceReplay: true });
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 120; tick++) snapshot = session.step(DT, { brake: 0.5, steer: -0.7 });
    expect(snapshot.racingLine.guidance.reason).toMatch(/recover|align/i);
    expect(snapshot.racingLine.guidance.action).not.toBe('Accelerate');
    const near = snapshot.racingLine.points.filter(point =>
      (point.distanceMeters - snapshot.kart.lapDistanceMeters + snapshot.circuit.totalLengthMeters) % snapshot.circuit.totalLengthMeters < 6);
    expect(near.length).toBeGreaterThan(2);
    expect(near.every(point => point.targetSpeedMps > snapshot.kart.speedMps + 1)).toBe(true);
    // Yellow suspends acceleration advice; red is reserved for real speed/braking demand.
    expect(near.every(point => point.liveCue === 'Yellow')).toBe(true);
  });

  it('neutralizes forward acceleration colors and forward speed targets during deliberate reverse recovery', () => {
    const session = createSimulationSession();
    const initialLine = session.getSnapshot().racingLine;
    for (let tick = 0; tick < 360; tick++) session.step(DT, { brake: 1 });
    session.step(DT, { brake: 0 });
    let snapshot = session.getSnapshot();
    for (let tick = 0; tick < 120; tick++) snapshot = session.step(DT, { brake: 1 });
    expect(snapshot.kart.driveDirection).toBe('Reverse');
    expect(snapshot.kart.speedMps).toBeLessThan(0);
    expect(snapshot.racingLine.guidance.action).toBe('Coast');
    expect(snapshot.racingLine.guidance.targetSpeedKph).toBe(0);
    expect(snapshot.racingLine.points.every(point => point.liveCue !== 'Green')).toBe(true);
    expect(snapshot.racingLine.guidance.reason).toMatch(/reverse.*accelerat/i);
    expect(snapshot.racingLine.points.map(({liveCue, ...point}) => point))
      .toEqual(initialLine.points.map(({liveCue, ...point}) => point));
    expect(snapshot.racingLine.benchmarkLapSeconds).toBe(initialLine.benchmarkLapSeconds);
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
