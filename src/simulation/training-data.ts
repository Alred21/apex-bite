import type { DrillTargetId, GhostSampleFrame, SectorSplitsTuple } from './types';

/** Advance either identifier whenever player handling or Circuit geometry becomes incompatible. */
export const CURRENT_TRAINING_REVISION: TrainingRevision = {
  handling: 'kart-v2',
  circuit: 'k1-toronto-v2',
};

export interface TrainingRevision {
  handling: string;
  circuit: string;
}

export interface TrainingRecords {
  revision: TrainingRevision;
  personalBestSeconds: number | null;
  bestSectorSplits: SectorSplitsTuple;
  personalBestGhostFrames: GhostSampleFrame[];
  drillPersonalBests: Partial<Record<DrillTargetId, number>>;
}

export interface PersistedTrainingData {
  version: 2;
  records: TrainingRecords[];
}

export interface TrainingRecordSummary {
  revision: TrainingRevision;
  personalBestSeconds: number | null;
  bestSectorSplits: SectorSplitsTuple;
  drillPersonalBests: Partial<Record<DrillTargetId, number>>;
  ghostFrameCount: number;
}

export function summarizeTrainingRecords(records: TrainingRecords): TrainingRecordSummary {
  return {
    revision: { ...records.revision },
    personalBestSeconds: records.personalBestSeconds,
    bestSectorSplits: [...records.bestSectorSplits],
    drillPersonalBests: { ...records.drillPersonalBests },
    ghostFrameCount: records.personalBestGhostFrames.length,
  };
}

export interface TrainingDataState {
  revision: TrainingRevision;
  current: TrainingRecordSummary;
  legacy: TrainingRecordSummary[];
  persistence: 'memory' | 'saved' | 'error';
  message: string | null;
}

const DRILL_IDS = new Set<string>([
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11',
  'T1-T3', 'T2-T3', 'T4-T5', 'T6-T7-T8', 'T9-T10-T11',
]);

function invalid(): never {
  throw new Error('Invalid training data. No records were changed.');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, minimum = -Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) invalid();
  return value;
}

function time(value: unknown): number {
  const result = finiteNumber(value, 0);
  if (result === 0) invalid();
  return result;
}

function revision(value: unknown): TrainingRevision {
  const source = object(value);
  for (const key of ['handling', 'circuit']) {
    if (typeof source[key] !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(source[key])) invalid();
  }
  return { handling: source.handling as string, circuit: source.circuit as string };
}

function records(value: unknown, baseline: boolean): TrainingRecords {
  const source = object(value);
  if (!Array.isArray(source.bestSectorSplits) || source.bestSectorSplits.length !== 3) invalid();
  const bestSectorSplits = source.bestSectorSplits.map((value) => value === null ? null : time(value)) as SectorSplitsTuple;
  const personalBestSeconds = source.personalBestSeconds === null ? null : time(source.personalBestSeconds);
  if (!Array.isArray(source.personalBestGhostFrames)) invalid();
  let previousSeconds = -1;
  const personalBestGhostFrames = source.personalBestGhostFrames.map((value): GhostSampleFrame => {
    const frame = object(value);
    const position = object(frame.position);
    const lapSeconds = finiteNumber(frame.lapSeconds, 0);
    if (lapSeconds < previousSeconds) invalid();
    previousSeconds = lapSeconds;
    return {
      lapSeconds,
      distanceMeters: finiteNumber(frame.distanceMeters, 0),
      position: { x: finiteNumber(position.x), z: finiteNumber(position.z) },
      headingRad: finiteNumber(frame.headingRad),
      speedKph: finiteNumber(frame.speedKph, 0),
    };
  });
  const drillPersonalBests: Partial<Record<DrillTargetId, number>> = {};
  const drills = source.drillPersonalBests === undefined && baseline ? {} : object(source.drillPersonalBests);
  for (const [key, value] of Object.entries(drills)) {
    if (!DRILL_IDS.has(key)) invalid();
    drillPersonalBests[key as DrillTargetId] = time(value);
  }
  return {
    revision: baseline ? { handling: 'kart-v1', circuit: 'k1-toronto-v1' } : revision(source.revision),
    personalBestSeconds, bestSectorSplits, personalBestGhostFrames, drillPersonalBests,
  };
}

export function parseTrainingData(json: string): TrainingRecords[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON. No records were changed.');
  }
  const parsed = object(decoded);
  if (parsed.version === 1) return [records(parsed, true)];
  if (parsed.version !== 2) throw new Error('Unsupported training data version. No records were changed.');
  if (!Array.isArray(parsed.records) || !parsed.records.length) invalid();
  const result = parsed.records.map((value) => records(value, false));
  const keys = result.map((record) => JSON.stringify(record.revision));
  if (new Set(keys).size !== keys.length) invalid();
  return result;
}

export function sameRevision(a: TrainingRevision, b: TrainingRevision): boolean {
  return a.handling === b.handling && a.circuit === b.circuit;
}
