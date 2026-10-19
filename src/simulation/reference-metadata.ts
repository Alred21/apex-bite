import type { CircuitData, RacingLineState } from './types';
import type { ReferenceReplay } from './reference-lap';

const cache = new WeakMap<CircuitData, RacingLineState['reference']>();

/** Immutable reference evidence is shared; do not copy hundreds of results on every 120 Hz snapshot. */
export function referenceMetadata(circuit: CircuitData, reference: ReferenceReplay): RacingLineState['reference'] {
  const existing = cache.get(circuit);
  if (existing) return existing;
  const metadata = Object.freeze({
    name: reference.name, validated: true, realWorldBenchmarkSeconds: circuit.trackRecordSeconds,
    closure: reference.closure, candidates: reference.evidence,
  });
  cache.set(circuit, metadata);
  return metadata;
}
