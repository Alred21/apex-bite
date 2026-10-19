import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

const baselineRevision = { handling: 'kart-v1', circuit: 'k1-toronto-v1' };

const baselineData = {
  version: 1,
  personalBestSeconds: 31,
  bestSectorSplits: [10, 12, 9],
  personalBestGhostFrames: [
    { lapSeconds: 0, distanceMeters: 0, position: { x: 1, z: 2 }, headingRad: 0, speedKph: 36 },
    { lapSeconds: 31, distanceMeters: 245, position: { x: 1, z: 2 }, headingRad: 0, speedKph: 36 },
  ],
  drillPersonalBests: { T3: 4.25, 'T4-T5': 5.5 },
};

describe('Revision-aware portable training records', () => {
  it('loads compatible baseline Personal Bests, Sector splits, Corner Drills, and Ghost Kart without discarding them', () => {
    const session = createSimulationSession({ referenceReplay: true, trainingRevision: baselineRevision, storage: {
      getItem: () => JSON.stringify(baselineData),
      setItem: () => {},
    } });
    const snapshot = session.cycleGhostMode();
    expect(snapshot.lap.personalBestSeconds).toBe(31);
    expect(snapshot.lap.bestSectorSplits).toEqual([10, 12, 9]);
    expect(snapshot.drill.personalBests).toEqual({ T3: 4.25, 'T4-T5': 5.5 });
    expect(snapshot.ghost.personalBestPose?.position).toEqual({ x: 1, z: 2 });
    const exported = JSON.parse(session.exportTrainingDataJson());
    expect(exported.version).toBe(2);
    expect(exported.records[0].personalBestGhostFrames).toEqual(baselineData.personalBestGhostFrames);
    expect(snapshot.trainingData.legacy).toEqual([]);
  });
  it('archives incompatible handling records, retains them through portable round trips, and never activates a legacy Ghost Kart', () => {
    const revised = createSimulationSession({ trainingRevision: { handling: 'kart-v2', circuit: 'k1-toronto-v1' } });
    const migrated = revised.importTrainingDataJson(JSON.stringify(baselineData));
    expect(migrated.lap.personalBestSeconds).toBeNull();
    expect(migrated.lap.bestSectorSplits).toEqual([null, null, null]);
    expect(migrated.drill.personalBests).toEqual({});
    expect(revised.cycleGhostMode().ghost.personalBestPose).toBeNull();
    expect(migrated.trainingData.legacy[0].personalBestSeconds).toBe(31);
    const restore = createSimulationSession({ trainingRevision: baselineRevision });
    restore.importTrainingDataJson(revised.exportTrainingDataJson());
    expect(restore.getSnapshot().lap.personalBestSeconds).toBe(31);
    // Importing another revision must retain existing current records and the other archive.
    const another = createSimulationSession({ trainingRevision: { handling: 'kart-v3', circuit: 'k1-toronto-v1' } });
    restore.importTrainingDataJson(another.exportTrainingDataJson());
    expect(restore.getSnapshot().lap.personalBestSeconds).toBe(31);
    expect(restore.getSnapshot().trainingData.legacy).toHaveLength(2);
    const exported = JSON.parse(restore.exportTrainingDataJson());
    expect(exported.records).toHaveLength(3);
    expect(exported.records[0].personalBestGhostFrames).toEqual(baselineData.personalBestGhostFrames);
  });

  it('rejects malformed or unsupported imports atomically without overwriting good records', () => {
    const session = createSimulationSession({ trainingRevision: baselineRevision });
    session.importTrainingDataJson(JSON.stringify(baselineData));
    const good = session.exportTrainingDataJson();
    const malformed = [
      '{', 'null', '[]', JSON.stringify({ ...baselineData, version: 99 }),
      JSON.stringify({ ...baselineData, personalBestSeconds: -1 }),
      JSON.stringify({ ...baselineData, bestSectorSplits: [1, 'bad', 3] }),
      JSON.stringify({ ...baselineData, personalBestGhostFrames: [{ lapSeconds: 0 }] }),
      JSON.stringify({ ...baselineData, drillPersonalBests: { T3: -4 } }),
      JSON.stringify({ ...baselineData, drillPersonalBests: { Unknown: 4 } }),
      JSON.stringify({ version: 2, records: [
        { ...baselineData, revision: { handling: 'kart-v1', circuit: 'k1-toronto-v1' }, personalBestSeconds: 29 },
        { ...baselineData, revision: { handling: 'kart-v2', circuit: 'k1-toronto-v1' }, bestSectorSplits: [1, 'bad', 3] },
      ] }),
    ];
    for (const json of malformed) {
      expect(() => session.importTrainingDataJson(json)).toThrow();
      expect(session.exportTrainingDataJson()).toBe(good);
      expect(session.getSnapshot().lap.personalBestSeconds).toBe(31);
    }
  });

  it('persists complete imports and leaves both memory and saved data unchanged when storage rejects a write', () => {
    const values = new Map<string, string>();
    let rejectWrite = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (rejectWrite) throw new Error('Quota exceeded');
        values.set(key, value);
      },
    };
    const session = createSimulationSession({ storage, trainingRevision: baselineRevision });
    session.importTrainingDataJson(JSON.stringify(baselineData));
    const good = session.exportTrainingDataJson();
    const saved = [...values];
    rejectWrite = true;
    expect(() => session.importTrainingDataJson(JSON.stringify({ ...baselineData, personalBestSeconds: 29 }))).toThrow(/storage/i);
    expect(session.exportTrainingDataJson()).toBe(good);
    expect([...values]).toEqual(saved);
    expect(session.getSnapshot().trainingData.persistence).toBe('error');
    const restored = createSimulationSession({ storage, trainingRevision: baselineRevision });
    expect(restored.getSnapshot().lap.personalBestSeconds).toBe(31);
  });

  it('keeps Circuit revisions separate and returns detached inspection data', () => {
    const session = createSimulationSession({ trainingRevision: { handling: 'kart-v1', circuit: 'k1-toronto-v2' } });
    session.importTrainingDataJson(JSON.stringify(baselineData));
    const inspection = session.getSnapshot().trainingData;
    expect(inspection.current.personalBestSeconds).toBeNull();
    expect(inspection.legacy[0].ghostFrameCount).toBe(2);
    inspection.legacy[0].bestSectorSplits[0] = 999;
    inspection.legacy[0].drillPersonalBests.T3 = 999;
    expect(session.getSnapshot().trainingData.legacy[0].bestSectorSplits).toEqual([10, 12, 9]);
    expect(session.getSnapshot().trainingData.legacy[0].drillPersonalBests.T3).toBe(4.25);
  });

  it('preserves baseline achievements as legacy under the revised default handling', () => {
    const session = createSimulationSession();
    const migrated = session.importTrainingDataJson(JSON.stringify(baselineData));
    expect(migrated.trainingData.revision.handling).toBe('kart-v2');
    expect(migrated.lap.personalBestSeconds).toBeNull();
    expect(migrated.trainingData.legacy[0].personalBestSeconds).toBe(31);
    expect(migrated.trainingData.legacy[0].ghostFrameCount).toBe(2);
  });

});
