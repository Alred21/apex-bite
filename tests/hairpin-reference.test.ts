import { expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

it('offers achievable hairpin entry/Apex/exit alternatives and selects by complete-lap performance', () => {
  const session = createSimulationSession();
  const { circuit, racingLine } = session.getSnapshot();
  const hairpin = circuit.turns[2];
  const candidates = racingLine.reference.candidates.filter((candidate) => candidate.turnPlacement?.turnNumber === 3);
  expect(candidates.length).toBeGreaterThan(1);
  const feasible = candidates.filter((candidate) => candidate.feasible);
  expect(feasible.length).toBeGreaterThan(1);
  const apexStations = feasible.map((candidate) => candidate.turnPlacement!.achievedApexDistanceMeters!);
  expect(Math.max(...apexStations) - Math.min(...apexStations)).toBeGreaterThan(1);
  expect(feasible.some((candidate) => candidate.turnPlacement!.requestedApexDistanceMeters > hairpin.apexDistanceMeters + 1)).toBe(true);
  expect(racingLine.benchmarkLapSeconds).toBe(Math.min(...racingLine.reference.candidates.filter((candidate) => candidate.feasible).map((candidate) => candidate.lapSeconds!)));
});

it('keeps the hairpin line, Ghost Kart, timing and actual tire Apex coherent through a Corner Drill', () => {
  const session = createSimulationSession();
  const replay = session.getReferenceReplay();
  let snapshot = session.selectDrillTarget('T3');
  const turn = snapshot.circuit.turns[2];
  const first = replay.frames.findIndex((frame) => frame.kart.position.x === snapshot.kart.position.x && frame.kart.position.z === snapshot.kart.position.z);
  const positions = snapshot.racingLine.points.map((point) => ({ ...point.position }));
  let index = first;
  while (!snapshot.drill.lastExecutionCard && index < replay.commands.length) {
    snapshot = session.step(1 / 120, replay.commands[index++]);
    expect(snapshot.kart.barrierContactCount).toBe(0);
    expect(snapshot.ghost.trackRecordPose!.position.x).toBeCloseTo(snapshot.kart.position.x, 7);
    expect(snapshot.ghost.trackRecordPose!.position.z).toBeCloseTo(snapshot.kart.position.z, 7);
  }
  const card = snapshot.drill.lastExecutionCard!;
  expect(card.isClean).toBe(true);
  expect(card.segmentTimeSeconds).toBeCloseTo(card.benchmarkTimeSeconds, 8);
  expect(card.coachingCategory).toBe('Matched Reference');
  expect(card.apexProximityCm).toBe(0);
  expect(snapshot.racingLine.points.map((point) => point.position)).toEqual(positions);
  const target = card.turnApexProximities[0].referenceTarget;
  const actual = replay.frames.filter((frame) => frame.kart.lapDistanceMeters >= turn.entryDistanceMeters && frame.kart.lapDistanceMeters <= turn.exitDistanceMeters)
    .find((frame) => Math.hypot(frame.kart.position.x + Math.cos(frame.kart.headingRad) * 0.54 + Math.sin(frame.kart.headingRad) * 0.285 - target.x,
      frame.kart.position.z + Math.sin(frame.kart.headingRad) * 0.54 - Math.cos(frame.kart.headingRad) * 0.285 - target.z) < 1e-8)!;
  expect(actual).toBeDefined();
  expect(Math.abs(actual.kart.lapDistanceMeters - turn.apexDistanceMeters)).toBeGreaterThan(0.4);
  const frameAt = (distance: number) => replay.frames.reduce((best, frame) => Math.abs(frame.kart.lapDistanceMeters - distance) < Math.abs(best.kart.lapDistanceMeters - distance) ? frame : best);
  const lateralAt = (distance: number) => {
    const kart = frameAt(distance).kart;
    const sample = snapshot.circuit.samples.reduce((best, sample) => Math.abs(sample.distanceMeters - distance) < Math.abs(best.distanceMeters - distance) ? sample : best);
    return (kart.position.x - sample.center.x) * sample.normal.x + (kart.position.z - sample.center.z) * sample.normal.z;
  };
  // T3 is Left: approach from the right, clip left, then open the exit.
  const entryOffset = lateralAt((snapshot.circuit.turns[1].apexDistanceMeters + turn.apexDistanceMeters) * 0.5);
  expect(entryOffset).toBeGreaterThan(0);
  expect(lateralAt(actual.kart.lapDistanceMeters)).toBeLessThan(-0.4);
  expect(lateralAt(turn.exitDistanceMeters + 4)).toBeGreaterThan(0.15);
});
