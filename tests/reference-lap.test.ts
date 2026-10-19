import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Executable Reference Lap', () => {
  it('preserves eleven Turns inside a nonintersecting physical Circuit', () => {
    const snapshot = createSimulationSession().getSnapshot();
    const { samples, turns } = snapshot.circuit;
    expect(turns.map((turn) => turn.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const cross = (a: {x: number; z: number}, b: {x: number; z: number}, p: {x: number; z: number}) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const segments = (['leftBarrier', 'rightBarrier'] as const).flatMap((side) => samples.map((sample, index) => [sample[side], samples[(index + 1) % samples.length][side]]));
    let intersections = 0;
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const [a, b] = segments[i], [c, d] = segments[j];
      if (cross(a, b, c) * cross(a, b, d) < -1e-10 && cross(c, d, a) * cross(c, d, b) < -1e-10) intersections++;
    }
    expect(intersections).toBe(0);
  });
  it('replays its retained analog commands through the ordinary Session solver without Barrier contact', () => {
    const source = createSimulationSession();
    const replay = source.getReferenceReplay();
    expect(replay.lapSeconds).toBeGreaterThan(30);
    expect(replay.lapSeconds).not.toBeCloseTo(24.499, 2);
    expect(replay.commands.length).toBeGreaterThan(3600);
    const session = createSimulationSession({ referenceReplay: true });
    for (let i = 0; i < replay.commands.length; i++) {
      const state = session.step(1 / 120, replay.commands[i]);
      const observed = replay.frames[i + 1].kart;
      expect(state.kart.barrierContact).toBe(false);
      expect(state.kart.position.x).toBeCloseTo(observed.position.x, 8);
      expect(state.kart.position.z).toBeCloseTo(observed.position.z, 8);
      expect(state.kart.speedKph).toBeLessThanOrEqual(45);
    }
    const finished = session.getSnapshot();
    expect(finished.lap.lastLapSeconds).toBeCloseTo(replay.lapSeconds, 5);
    expect(finished.lap.personalBestSeconds).toBeCloseTo(replay.lapSeconds, 5);
  });

});

it('keeps Reference Ghost Kart motion, live timing, and returned copies consistent with the executed traversal', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const reference = session.getReferenceReplay();
  for (let i = 0; i < 1600; i++) session.step(1 / 120, reference.commands[i]);
  const snap = session.getSnapshot();
  expect(snap.ghost.mode).toBe('Reference Lap');
  expect(snap.ghost.trackRecordPose!.position.x).toBeCloseTo(snap.kart.position.x, 7);
  expect(snap.ghost.trackRecordPose!.position.z).toBeCloseTo(snap.kart.position.z, 7);
  expect(Math.abs(snap.lap.timeDeltaSeconds)).toBeLessThan(0.025);
  expect(reference.closure.positionMeters).toBeLessThan(0.1);
  expect(reference.closure.headingRad).toBeLessThan(0.01);
  reference.initialState.position.x = 10000;
  reference.commands[0].steer = 10000;
  snap.racingLine.points[0].position.x = 10000;
  const next = createSimulationSession({ referenceReplay: true });
  expect(next.getSnapshot().kart.position.x).not.toBe(10000);
  expect(next.getReferenceReplay().commands[0].steer).not.toBe(10000);
  expect(next.getSnapshot().racingLine.points[0].position.x).not.toBe(10000);
});

it('repeats the retained control tape through all twelve timed laps with no Barrier contacts or artificial state resets', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const reference = session.getReferenceReplay();
  let maximumContacts = 0;
  for (let lap = 0; lap < 12; lap++) for (const command of reference.commands) {
    maximumContacts = Math.max(maximumContacts, session.step(1 / 120, command).kart.barrierContactCount);
  }
  const snap = session.getSnapshot();
  expect(maximumContacts).toBe(0);
  expect(snap.timeTrial.status).toBe('Finished');
  expect(snap.timeTrial.completedLaps).toHaveLength(12);
  expect(snap.timeTrial.completedLaps.every((lap) => lap.isClean)).toBe(true);
  expect(snap.timeTrial.completedLaps.every((lap) => Math.abs(lap.seconds - reference.lapSeconds) < 0.05)).toBe(true);
});
