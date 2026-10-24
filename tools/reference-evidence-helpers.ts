import type { CircuitData, ReferenceCandidateEvidence, Vector2D } from '../src/simulation/types';
import { CORNER_COMPLEXES } from '../src/simulation/corner-complexes';
import { offsetComplex, placeTurn, placeCircuit, relaxPlacement, type CircuitPlacement } from '../src/simulation/reference-proposals';
import { cloneKartState, type ReferenceReplay } from '../src/simulation/reference-lap';
import { FIXED_TIMESTEP_SECONDS } from '../src/simulation/kart-parameters';
import { stepKartOnCircuit } from '../src/simulation/kart-world';

/** Reconstruct a published candidate's requested geometry for offline review. */
export function evidenceProposal(circuit: CircuitData, evidence: ReferenceCandidateEvidence[], name: string): Vector2D[] {
  const memo = new Map<string, { positions: Vector2D[]; controls?: CircuitPlacement[] }>();
  function at(name: string): { positions: Vector2D[]; controls?: CircuitPlacement[] } {
    const cached = memo.get(name);
    if (cached) return cached;
    if (name === 'Conservative centerline') return { positions: circuit.samples.map((sample) => sample.center) };
    const item = evidence.find((candidate) => candidate.name === name);
    if (!item?.basisCandidate) throw new Error(`No reproducible candidate lineage for ${name}`);
    const basis = at(item.basisCandidate);
    let result: { positions: Vector2D[]; controls?: CircuitPlacement[] };
    if (item.adjustment) result = { positions: offsetComplex(circuit, basis.positions, CORNER_COMPLEXES.findIndex((complex) => complex.id === item.adjustment!.complexId), item.adjustment.offsetMeters, item.adjustment.phaseMeters) };
    else if (item.relaxation) result = { positions: relaxPlacement(circuit, basis.positions, item.relaxation.passes, item.relaxation.maxChangeMeters) };
    else {
      const placement = item.turnPlacement!, turn = circuit.turns[placement.turnNumber - 1];
      if (placement.family === 'circuit') {
        const controls = (basis.controls ?? circuit.turns.map(() => ({ entryWidthUse: 0, apexWidthUse: 0, apexShiftMeters: 0 }))).map((control) => ({ ...control }));
        controls[turn.number - 1] = { entryWidthUse: placement.entryWidthUse!, apexWidthUse: placement.widthUse, apexShiftMeters: placement.requestedApexDistanceMeters - turn.apexDistanceMeters };
        const next = turn.number % circuit.turns.length;
        controls[next].entryWidthUse = placement.exitWidthUse! * (circuit.turns[next].direction === turn.direction ? 1 : -1);
        result = { positions: placeCircuit(circuit, controls), controls };
      } else result = { positions: placeTurn(circuit, basis.positions, turn.number, { apexShiftMeters: placement.requestedApexDistanceMeters - turn.apexDistanceMeters, entryWidthUse: placement.widthUse, apexWidthUse: placement.widthUse, exitWidthUse: placement.widthUse * 0.55 }) };
    }
    memo.set(name, result);
    return result;
  }
  return at(name).positions;
}

const pointSegmentDistance = (point: Vector2D, a: Vector2D, b: Vector2D) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - ratio * dx, point.z - a.z - ratio * dz);
};

/** Independent rectangle-to-wall-surface measure at retained 120 Hz frames.
 * The solver separately validates the swept intervals, not just these samples. */
export function envelopeClearance(circuit: CircuitData, replay: ReferenceReplay, start = 0, end = circuit.totalLengthMeters): number {
  let minimum = Infinity;
  for (const { kart } of replay.frames) {
    if (kart.lapDistanceMeters < start || kart.lapDistanceMeters > end) continue;
    const corners = [[0.88, 0.45], [0.88, -0.45], [-0.8, -0.45], [-0.8, 0.45]].map(([forward, lateral]) => ({
      x: kart.position.x + Math.cos(kart.headingRad) * forward - Math.sin(kart.headingRad) * lateral,
      z: kart.position.z + Math.sin(kart.headingRad) * forward + Math.cos(kart.headingRad) * lateral,
    }));
    for (const sample of circuit.samples) for (const side of ['leftBarrier', 'rightBarrier'] as const) {
      const a = sample[side], b = circuit.samples[(sample.index + 1) % circuit.samples.length][side];
      if (Math.hypot(a.x - kart.position.x, a.z - kart.position.z) > 4) continue;
      for (let index = 0; index < corners.length; index++) {
        const first = corners[index], next = corners[(index + 1) % corners.length];
        minimum = Math.min(minimum, pointSegmentDistance(first, a, b), pointSegmentDistance(a, first, next), pointSegmentDistance(b, first, next));
      }
    }
  }
  return minimum - 0.12;
}

/** Common measurements for the offline experiments and candidate adoption. */
export function referenceMetrics(circuit: CircuitData, replay: ReferenceReplay) {
  const angles = replay.frames.map(frame => frame.kart.steerAngleRad);
  const rates = angles.slice(1).map((angle, index) => Math.abs(angle - angles[index]) / FIXED_TIMESTEP_SECONDS);
  const sorted = [...rates].sort((a, b) => a - b);
  return { name: replay.name, lapSeconds: replay.lapSeconds, sampledClearanceMeters: envelopeClearance(circuit, replay),
    steering: { p95RateRadPerSecond: sorted[Math.floor(sorted.length * 0.95)], maxRateRadPerSecond: Math.max(...rates),
      totalVariationRad: rates.reduce((sum, rate) => sum + rate * FIXED_TIMESTEP_SECONDS, 0) },
    closure: replay.closure, complexes: replay.evidence[0].complexes };
}

export function referenceRobustnessViolations(metrics: ReturnType<typeof referenceMetrics>, limits: {
  minimumSampledClearanceMeters: number;
  maximumP95SteeringRateRadPerSecond: number;
  maximumSteeringRateRadPerSecond: number;
  maximumSteeringVariationRad: number;
}) {
  return [metrics.sampledClearanceMeters < limits.minimumSampledClearanceMeters ? 'sampled clearance' : '',
    metrics.steering.p95RateRadPerSecond > limits.maximumP95SteeringRateRadPerSecond ? '95th-percentile steering rate' : '',
    metrics.steering.maxRateRadPerSecond > limits.maximumSteeringRateRadPerSecond ? 'peak steering rate' : '',
    metrics.steering.totalVariationRad > limits.maximumSteeringVariationRad ? 'steering total variation' : ''].filter(Boolean);
}

/** Replay retained tapes without resets, separately from proposal/controller execution. */
export function repeatReferenceTape(circuit: CircuitData, replay: ReferenceReplay) {
  let kart = cloneKartState(replay.initialState), maximumContacts = 0;
  for (let lap = 0; lap < 12; lap++) for (const command of replay.commands) {
    kart = stepKartOnCircuit(circuit, kart, command); maximumContacts = Math.max(maximumContacts, kart.barrierContactCount);
  }
  const progressedLaps = (kart.unwrappedDistanceMeters - replay.initialState.unwrappedDistanceMeters) / circuit.totalLengthMeters;
  return { laps: 12, maximumContacts, progressedLaps, clean: maximumContacts === 0 && Math.abs(progressedLaps - 12) < 0.01 };
}
