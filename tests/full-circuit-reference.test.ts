import { expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

it('evaluates achievable geometric and later Apex placements for every Turn while choosing a faster complete lap', () => {
  const snapshot = createSimulationSession().getSnapshot();
  const evidence = snapshot.racingLine.reference.candidates;
  const proposedTurns = new Set(evidence.flatMap((candidate) => candidate.turnPlacement ? [candidate.turnPlacement.turnNumber] : []));
  expect([...proposedTurns].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const turn of snapshot.circuit.turns) {
    const proposals = evidence.filter((candidate) => candidate.turnPlacement?.turnNumber === turn.number);
    expect(proposals.some((candidate) => candidate.turnPlacement!.requestedApexDistanceMeters > turn.apexDistanceMeters + 1)).toBe(true);
    expect(proposals.some((candidate) => candidate.feasible)).toBe(true);
  }
  const baseline = evidence.find((candidate) => candidate.name === 'Conservative centerline')!;
  expect(snapshot.racingLine.benchmarkLapSeconds).toBeLessThan(baseline.lapSeconds!);
  expect(snapshot.racingLine.benchmarkLapSeconds).toBeLessThan(45.791666666666664);
});

it('uses a visible outside-to-inside placement through the opening Turn rather than tracing the Circuit Centreline', () => {
  const snapshot = createSimulationSession().getSnapshot();
  const turn = snapshot.circuit.turns[0];
  const offsets = snapshot.racingLine.points.filter((point) => point.distanceMeters < turn.exitDistanceMeters).map((point) => {
    const sample = snapshot.circuit.samples[point.index];
    return (point.position.x - sample.center.x) * sample.normal.x + (point.position.z - sample.center.z) * sample.normal.z;
  });
  // Two Kart widths of deliberate lateral travel, with a real outside setup
  // and inside placement; exact stations remain an optimization decision.
  expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(1.8);
  expect(Math.min(...offsets)).toBeLessThan(-0.45);
  expect(Math.max(...offsets)).toBeGreaterThan(0.9);
});

it('indexes the displayed executed geometry at the same Circuit station as the retained traversal', () => {
  const session = createSimulationSession();
  const snapshot = session.getSnapshot(), reference = session.getReferenceReplay();
  for (const station of [0, 20, 90, 179, 260, 333]) {
    const point = snapshot.racingLine.points.reduce((best, point) => Math.abs(point.distanceMeters - station) < Math.abs(best.distanceMeters - station) ? point : best);
    const index = reference.frames.findIndex((frame) => frame.kart.lapDistanceMeters >= point.distanceMeters);
    const a = index === 0 ? reference.frames.at(-2)! : reference.frames[index - 1], b = reference.frames[index];
    const firstStation = a.kart.lapDistanceMeters - (index === 0 ? snapshot.circuit.totalLengthMeters : 0);
    const fraction = (point.distanceMeters - firstStation) / (b.kart.lapDistanceMeters - firstStation);
    const x = a.kart.position.x + (b.kart.position.x - a.kart.position.x) * fraction;
    const z = a.kart.position.z + (b.kart.position.z - a.kart.position.z) * fraction;
    expect(Math.hypot(point.position.x - x, point.position.z - z)).toBeLessThan(0.002);
  }
});
