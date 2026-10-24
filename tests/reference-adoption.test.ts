import { expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';
import { ITERATION_3_RECORDS } from './iteration-3-records-fixture';

it('publishes the qualifying tuned lap and keeps faster robustness failures out of selection', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const snapshot = session.getSnapshot(), replay = session.getReferenceReplay();
  expect(replay.lapSeconds).toBeCloseTo(38.225, 6);
  expect(snapshot.racingLine.benchmarkLapSeconds).toBe(replay.lapSeconds);
  expect(snapshot.timeTrial.lapLimit).toBe(12);
  const candidates = snapshot.racingLine.reference.candidates;
  expect(candidates.some(candidate => candidate.feasible && candidate.lapSeconds! < replay.lapSeconds && candidate.selectionEligible === false)).toBe(true);
  const eligible = candidates.filter(candidate => candidate.feasible && candidate.selectionEligible !== false);
  expect(replay.lapSeconds).toBe(Math.min(...eligible.map(candidate => candidate.lapSeconds!)));
});

it('preserves iteration-3 lap and Sector achievements while archiving changed drill Flying Entries', () => {
  const session = createSimulationSession({ referenceReplay: true });
  const old = ITERATION_3_RECORDS.records[0];
  const snapshot = session.importTrainingDataJson(JSON.stringify(ITERATION_3_RECORDS));
  expect(snapshot.lap.personalBestSeconds).toBe(old.personalBestSeconds);
  expect(snapshot.lap.bestSectorSplits).toEqual(old.bestSectorSplits);
  expect(snapshot.drill.personalBests).toEqual({});
  expect(snapshot.trainingData.current.legacyDrillPersonalBests).toContainEqual({ reference: old.drillReference, personalBests: old.drillPersonalBests });
  const exported = JSON.parse(session.exportTrainingDataJson());
  expect(exported.records[0].personalBestGhostFrames).toEqual(old.personalBestGhostFrames);
  expect(exported.records[0].drillReference).not.toBe(old.drillReference);
  const ghost = session.cycleGhostMode().ghost.personalBestPose!;
  expect(ghost.position).toEqual(old.personalBestGhostFrames[0].position);
  expect(Number.isFinite(ghost.steerAngleRad)).toBe(true);
  const restored = createSimulationSession();
  restored.importTrainingDataJson(session.exportTrainingDataJson());
  expect(restored.getSnapshot().trainingData.current.legacyDrillPersonalBests).toEqual(snapshot.trainingData.current.legacyDrillPersonalBests);
});
