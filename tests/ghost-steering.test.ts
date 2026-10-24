import { expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';
import { analogReferenceCommand } from './analog-driver';

it('preserves recorded Personal Best steering through portable round trips and interpolates its replay clock', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const source = createSimulationSession({ referenceReplay: true, storage });
  const portable = JSON.parse(source.exportTrainingDataJson());
  portable.records[0].personalBestSeconds = 2;
  portable.records[0].personalBestGhostFrames = [
    { lapSeconds: 0, distanceMeters: 0, position: { x: 1, z: 2 }, headingRad: 0, speedKph: 36, steerAngleRad: -.2 },
    { lapSeconds: 1, distanceMeters: 10, position: { x: 11, z: 2 }, headingRad: 0, speedKph: 36, steerAngleRad: .2 },
    { lapSeconds: 2, distanceMeters: 20, position: { x: 21, z: 2 }, headingRad: 0, speedKph: 36, steerAngleRad: -.2 },
  ];
  source.importTrainingDataJson(JSON.stringify(portable));
  const restored = createSimulationSession({ referenceReplay: true, storage });
  expect(restored.cycleGhostMode().ghost.personalBestPose!.steerAngleRad).toBeCloseTo(-.2, 12);
  const replay = createSimulationSession({ referenceReplay: true });
  replay.importTrainingDataJson(source.exportTrainingDataJson());
  replay.cycleGhostMode();
  expect(JSON.parse(replay.exportTrainingDataJson()).records[0].personalBestGhostFrames).toEqual(portable.records[0].personalBestGhostFrames);
  expect(replay.getSnapshot().ghost.personalBestPose!.steerAngleRad).toBeCloseTo(-.2, 12);
  expect(replay.getSnapshot().ghost.personalBestPose!.steeringWheelAngleRad).toBeCloseTo(-.44, 12);
  const halfway = replay.step(.5, { brake: 1 }).ghost.personalBestPose!;
  expect(halfway.position.x).toBeCloseTo(6, 12);
  expect(halfway.position.z).toBe(2);
  expect(halfway.steerAngleRad).toBeCloseTo(0, 12);
  expect(replay.step(.5, { brake: 1 }).ghost.personalBestPose!.steerAngleRad).toBeCloseTo(.2, 12);
  replay.step(1, { brake: 1 });
  expect(replay.getSnapshot().ghost.personalBestPose!.steerAngleRad).toBeCloseTo(-.2, 12);
});

it('uses the observed Reference Lap steering at its replay time', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const tape = session.getReferenceReplay();
  for (let tick = 0; tick < 180; tick++) {
    const snapshot = session.step(1 / 120, tape.commands[tick]);
    const ghost = snapshot.ghost.trackRecordPose!;
    expect(ghost.steerAngleRad).toBeCloseTo(snapshot.kart.steerAngleRad, 10);
    expect(ghost.steeringWheelAngleRad).toBeCloseTo(snapshot.kart.steeringWheelAngleRad, 10);
  }
});

it('records the observed steering of a newly earned Clean Lap including its boundary samples', () => {
  const session = createSimulationSession();
  session.setTimeTrialLapLimit(1);
  const observed = new Map<number, number>();
  let snapshot = session.getSnapshot();
  for (let tick = 0; tick < 9000 && snapshot.timeTrial.status !== 'Finished'; tick++) {
    snapshot = session.step(1 / 120, analogReferenceCommand(snapshot, .95));
    if (snapshot.lap.lapNumber === 1) observed.set(snapshot.lap.currentLapSeconds, snapshot.kart.steerAngleRad);
  }
  expect(snapshot.timeTrial.status).toBe('Finished');
  expect(snapshot.lap.personalBestSeconds).not.toBeNull();
  const tape = JSON.parse(session.exportTrainingDataJson()).records[0].personalBestGhostFrames;
  expect(tape.length).toBeGreaterThan(2);
  expect(tape[0].lapSeconds).toBe(0);
  expect(tape.at(-1).lapSeconds).toBe(snapshot.lap.personalBestSeconds);
  for (const frame of tape) expect(frame.steerAngleRad).toBe(observed.get(frame.lapSeconds));
  expect(tape.some((frame: { steerAngleRad: number }) => frame.steerAngleRad > .1)).toBe(true);
  expect(tape.some((frame: { steerAngleRad: number }) => frame.steerAngleRad < -.1)).toBe(true);
});

it('infers older replay steering from wrapped heading and signed travel without changing its records or pose', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const portable = JSON.parse(session.exportTrainingDataJson());
  portable.records[0].personalBestSeconds = 2;
  const frames = [
    { lapSeconds: 0, distanceMeters: 0, position: { x: 0, z: 0 }, headingRad: Math.PI - .05, speedKph: 3.6 },
    { lapSeconds: 1, distanceMeters: 1, position: { x: -1, z: 0 }, headingRad: -Math.PI + .05, speedKph: 3.6 },
    { lapSeconds: 2, distanceMeters: 2, position: { x: 0, z: 0 }, headingRad: -Math.PI + .15, speedKph: 3.6 },
  ];
  portable.records[0].personalBestGhostFrames = frames;
  session.importTrainingDataJson(JSON.stringify(portable));
  session.cycleGhostMode();
  const forward = session.step(.5, { brake: 1 }).ghost.personalBestPose!;
  expect(forward.position.x).toBeCloseTo(-.5, 12);
  expect(forward.position.z).toBe(0);
  expect(forward.headingRad).toBeCloseTo(Math.PI, 12);
  expect(forward.speedKph).toBe(3.6);
  expect(forward.steerAngleRad).toBeGreaterThan(.09);
  expect(forward.steerAngleRad).toBeLessThan(.12);
  const reversing = session.step(1, { brake: 1 }).ghost.personalBestPose!;
  expect(reversing.steerAngleRad).toBeLessThan(-.09);
  expect(JSON.parse(session.exportTrainingDataJson()).records[0].personalBestGhostFrames).toEqual(frames);
});

it('rejects malformed or impossible imported steering atomically without changing good records', () => {
  const session = createSimulationSession();
  const portable = JSON.parse(session.exportTrainingDataJson());
  portable.records[0].personalBestSeconds = 2;
  portable.records[0].personalBestGhostFrames = [
    { lapSeconds: 0, distanceMeters: 0, position: { x: 0, z: 0 }, headingRad: 0, speedKph: 10, steerAngleRad: .1 },
    { lapSeconds: 2, distanceMeters: 5, position: { x: 5, z: 0 }, headingRad: .1, speedKph: 10, steerAngleRad: -.1 },
  ];
  session.importTrainingDataJson(JSON.stringify(portable));
  const good = session.exportTrainingDataJson();
  for (const invalidSteer of [null, '0.1', true, {}, .47, -.47]) {
    portable.records[0].personalBestGhostFrames[0].steerAngleRad = invalidSteer;
    expect(() => session.importTrainingDataJson(JSON.stringify(portable))).toThrow(/Invalid training data/);
    expect(session.exportTrainingDataJson()).toBe(good);
  }
});
