import { insideFrontTirePosition } from './kart-geometry';
import type {
  CircuitData, KartState, RacingLinePoint, ReferenceCandidateEvidence,
  ReferenceClosure, ReferenceComplexEvidence, Vector2D,
} from './types';
import { offsetComplex } from './reference-proposals';
import { CORNER_COMPLEXES } from './corner-complexes';
import { buildPriorLineProposal } from './prior-line-proposal';
import type { KartCommand } from './kart-dynamics';
import { stepKartOnCircuit, hasKartBarrierContact } from './kart-world';
import { FIXED_TIMESTEP_SECONDS, MAX_STEER_ANGLE_RAD, WHEELBASE_METERS, MAX_KART_SPEED_MPS } from './kart-parameters';
import { wrapAngleRad } from './planar-math';
import { CURRENT_TRAINING_REVISION, type TrainingRevision } from './training-data';

export interface ReferenceFrame { lapSeconds: number; kart: KartState; }
export type { ReferenceCandidateEvidence, ReferenceComplexEvidence } from './types';
export interface ReferenceReplay {
  revision: TrainingRevision;
  name: string;
  lapSeconds: number;
  initialState: KartState;
  commands: KartCommand[];
  frames: ReferenceFrame[];
  points: RacingLinePoint[];
  evidence: ReferenceCandidateEvidence[];
  closure: ReferenceClosure;
}
export interface ReferenceProposal { name: string; positions: Vector2D[]; speedScale?: number; }
const cache = new WeakMap<CircuitData, ReferenceReplay>();
export const cloneKartState = (kart: KartState): KartState => ({ ...kart, position: { ...kart.position }, velocity: { ...kart.velocity } });

export function createKartAtDistance(circuit: CircuitData, distanceMeters: number, speedMps: number): KartState {
  const sample = circuit.samples[Math.round(distanceMeters / circuit.totalLengthMeters * circuit.samples.length) % circuit.samples.length];
  const headingRad = Math.atan2(sample.tangent.z, sample.tangent.x);
  return {
    position: { ...sample.center }, headingRad, speedMps, speedKph: speedMps * 3.6,
    velocity: { x: sample.tangent.x * speedMps, z: sample.tangent.z * speedMps }, yawRateRadPerSecond: 0,
    forwardAccelMps2: 0, lateralAccelMps2: 0, steerAngleRad: 0, steeringWheelAngleRad: 0,
    driveDirection: 'Forward', throttleInput: 0, brakeInput: 0, isTrailBraking: false, axleScrub: 0, slipRatio: 0,
    barrierContact: false, barrierContactCount: 0, lapDistanceMeters: sample.distanceMeters,
    unwrappedDistanceMeters: sample.distanceMeters, lapProgress: sample.progress, currentTurn: null, currentSector: sample.sector,
  };
}

export function proposalCurvatures(positions: Vector2D[]): number[] {
  return positions.map((b, index) => {
    const a = positions[(index - 1 + positions.length) % positions.length], c = positions[(index + 1) % positions.length];
    const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
    return 2 * (ax * bz - az * bx) / Math.max(1e-9, Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(c.x - a.x, c.z - a.z));
  });
}

function proposalSpeedProfile(proposal: ReferenceProposal): number[] {
  const positions = proposal.positions, n = positions.length;
  const curvature = proposalCurvatures(positions);
  const speeds = curvature.map((value) => Math.min(MAX_KART_SPEED_MPS * 0.96, Math.sqrt(5.2 / Math.max(0.0001, Math.abs(value)))))
    .map((speed) => speed * (proposal.speedScale ?? 1));
  for (let pass = 0; pass < 20; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n, distance = Math.hypot(positions[j].x - positions[i].x, positions[j].z - positions[i].z);
      speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[j] ** 2 + 2 * 3.3 * distance));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, distance = Math.hypot(positions[j].x - positions[i].x, positions[j].z - positions[i].z);
      speeds[j] = Math.min(speeds[j], Math.sqrt(speeds[i] ** 2 + 2 * 3.5 * distance));
    }
  }
  return speeds;
}

function interpolateAtDistance<T extends {distanceMeters: number}>(points: T[], distance: number) {
  let low = 0, high = points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (points[middle].distanceMeters <= distance) low = middle; else high = middle - 1;
  }
  return low;
}

export function referenceDriverCommand(circuit: CircuitData, proposal: ReferenceProposal, speeds: number[], kart: KartState): KartCommand {
  const n = proposal.positions.length, length = circuit.totalLengthMeters;
  const lookahead = 0.85 + kart.speedMps * 0.11;
  const targetDistance = (kart.lapDistanceMeters + lookahead) % length;
  const fractionalIndex = targetDistance / length * n;
  const i = Math.floor(fractionalIndex), j = (i + 1) % n, f = fractionalIndex - i;
  const a = proposal.positions[i], b = proposal.positions[j];
  const target = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  const dx = target.x - kart.position.x, dz = target.z - kart.position.z;
  const alpha = wrapAngleRad(Math.atan2(dz, dx) - kart.headingRad);
  const steer = Math.max(-1, Math.min(1, Math.atan2(2 * WHEELBASE_METERS * Math.sin(alpha), Math.hypot(dx, dz)) / MAX_STEER_ANGLE_RAD));
  let targetSpeed = MAX_KART_SPEED_MPS;
  const stoppingHorizon = kart.speedMps ** 2 / (2 * 3.2) + 3;
  for (let distance = 0; distance <= stoppingHorizon; distance += 0.65) {
    const index = Math.floor(((kart.lapDistanceMeters + distance) % length) / length * n) % n;
    targetSpeed = Math.min(targetSpeed, Math.sqrt(speeds[index] ** 2 + 2 * 3.0 * Math.max(0, distance - 0.8)));
  }
  const error = targetSpeed - kart.speedMps;
  return {
    throttle: error > -0.08 ? Math.min(1, Math.max(0, 0.37 + error * 1.7)) : 0,
    brake: error < -0.2 ? Math.min(1, (-error - 0.1) * 0.8) : 0,
    steer,
  };
}

/** Executes proposals with the exact player solver; rejected traversals never publish times. */
export function executeReferenceProposal(circuit: CircuitData, proposal: ReferenceProposal): ReferenceReplay | ReferenceCandidateEvidence {
  const speeds = proposalSpeedProfile(proposal);
  const curvature = proposalCurvatures(proposal.positions);
  if (curvature.some((value) => Math.abs(Math.atan(WHEELBASE_METERS * value)) > MAX_STEER_ANGLE_RAD * 1.03)) {
    return { name: proposal.name, feasible: false, lapSeconds: null, reason: 'Requested local curvature exceeds the Kart steering range.' };
  }
  let kart = createKartAtDistance(circuit, 0, speeds[0]);
  if (hasKartBarrierContact(circuit, kart)) return { name: proposal.name, feasible: false, lapSeconds: null, reason: 'Initial whole-Kart envelope touches a physical Barrier.' };
  const length = circuit.totalLengthMeters;
  let crossings = 0, frames: ReferenceFrame[] = [], commands: KartCommand[] = [];
  for (let tick = 0; tick < 50000; tick++) {
    const command = referenceDriverCommand(circuit, proposal, speeds, kart);
    const next = stepKartOnCircuit(circuit, kart, command);
    if (next.barrierContact) return { name: proposal.name, feasible: false, lapSeconds: null, reason: `Swept whole-Kart Barrier contact near ${next.lapDistanceMeters.toFixed(2)}m.` };
    if (next.unwrappedDistanceMeters < kart.unwrappedDistanceMeters - 0.01) return { name: proposal.name, feasible: false, lapSeconds: null, reason: 'Traversal reversed Circuit progress.' };
    if (crossings >= 2) {
      commands.push(command);
      frames.push({ lapSeconds: commands.length * FIXED_TIMESTEP_SECONDS, kart: cloneKartState(next) });
    }
    if (next.lapDistanceMeters < length * 0.1 && kart.lapDistanceMeters > length * 0.9) {
      crossings++;
      if (crossings === 2) frames = [{ lapSeconds: 0, kart: cloneKartState(next) }];
      if (crossings === 3) {
        const initialState = frames[0].kart;
        const closure = {
          positionMeters: Math.hypot(next.position.x - initialState.position.x, next.position.z - initialState.position.z),
          headingRad: Math.abs(wrapAngleRad(next.headingRad - initialState.headingRad)),
          speedMps: Math.abs(next.speedMps - initialState.speedMps),
          yawRateRadPerSecond: Math.abs(next.yawRateRadPerSecond - initialState.yawRateRadPerSecond),
        };
        if (closure.positionMeters > 0.18 || closure.headingRad > 0.035 || closure.speedMps > 0.15 || closure.yawRateRadPerSecond > 0.04) return { name: proposal.name, feasible: false, lapSeconds: null, reason: `Unsettled lap closure: ${closure.positionMeters.toFixed(3)}m position mismatch.` };
        const lapSeconds = commands.length * FIXED_TIMESTEP_SECONDS;
        // Index the observed trajectory by Circuit progress, not proposal arc length.
        const distances = frames.map((frame) => ({ ...frame, distanceMeters: frame.kart.unwrappedDistanceMeters - initialState.unwrappedDistanceMeters }));
        const points = circuit.samples.map((sample, index): RacingLinePoint => {
          const distance = sample.distanceMeters;
          const frameIndex = interpolateAtDistance(distances, distance);
          const a = distances[frameIndex], b = distances[Math.min(frameIndex + 1, distances.length - 1)];
          const ratio = Math.max(0, Math.min(1, (distance - a.distanceMeters) / Math.max(1e-9, b.distanceMeters - a.distanceMeters)));
          const speed = a.kart.speedMps + (b.kart.speedMps - a.kart.speedMps) * ratio;
          return {
            index, distanceMeters: distance, progress: sample.progress,
            position: { x: a.kart.position.x + (b.kart.position.x - a.kart.position.x) * ratio, z: a.kart.position.z + (b.kart.position.z - a.kart.position.z) * ratio },
            headingRad: a.kart.headingRad + wrapAngleRad(b.kart.headingRad - a.kart.headingRad) * ratio,
            targetSpeedMps: speed, targetSpeedKph: speed * 3.6,
            benchmarkTimeSeconds: a.lapSeconds + (b.lapSeconds - a.lapSeconds) * ratio,
            liveCue: 'Green',
          };
        });
        return { revision: { ...CURRENT_TRAINING_REVISION }, name: proposal.name, lapSeconds, initialState: cloneKartState(initialState), commands, frames, points, closure, evidence: [{ name: proposal.name, feasible: true, lapSeconds, reason: null, complexes: measureComplexes(circuit, frames) }] };
      }
    }
    kart = next;
  }
  return { name: proposal.name, feasible: false, lapSeconds: null, reason: 'Traversal did not complete within the bounded simulation budget.' };
}

export function buildReferenceLap(circuit: CircuitData): ReferenceReplay {
  const existing = cache.get(circuit);
  if (existing) return existing;
  const result = executeReferenceProposal(circuit, { name: 'Conservative centerline', positions: circuit.samples.map((sample) => sample.center) });
  if (!('frames' in result)) throw new Error(`Reference Lap unavailable: ${result.reason}`);
  const prior = executeReferenceProposal(circuit, { name: 'Prior pinned-apex heuristic', positions: buildPriorLineProposal(circuit) });
  result.evidence.push('frames' in prior ? { name: prior.name, feasible: true, lapSeconds: prior.lapSeconds, reason: null } : prior);
  // Session callers receive copies; freeze the cached graph so its validation
  // cannot be invalidated accidentally by a later consumer.
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  let selected = result;
  let selectedPositions = circuit.samples.map((sample) => sample.center);
  const evidence = result.evidence;
  for (let complexIndex = 0; complexIndex < CORNER_COMPLEXES.length; complexIndex++) {
    const sourcePositions = selectedPositions;
    const basisName = selected.name;
    for (const [amplitude, phase] of [[-0.45, -2], [-0.45, 2], [0.45, -2], [0.45, 2]]) {
      const name = `${CORNER_COMPLEXES[complexIndex].id} offset ${amplitude > 0 ? '+' : ''}${amplitude.toFixed(2)}m / phase ${phase > 0 ? '+' : ''}${phase}m`;
      const positions = offsetComplex(circuit, sourcePositions, complexIndex, amplitude, phase);
      const candidate = executeReferenceProposal(circuit, { name, positions });
      if ('frames' in candidate) {
        candidate.evidence[0].basisCandidate = basisName;
        candidate.evidence[0].adjustment = { complexId: CORNER_COMPLEXES[complexIndex].id, offsetMeters: amplitude, phaseMeters: phase };
        evidence.push(candidate.evidence[0]);
        if (candidate.lapSeconds < selected.lapSeconds) { selected = candidate; selectedPositions = positions; }
      } else evidence.push({ ...candidate, basisCandidate: basisName, adjustment: { complexId: CORNER_COMPLEXES[complexIndex].id, offsetMeters: amplitude, phaseMeters: phase } });
    }
  }
  selected.evidence = evidence;
  cache.set(circuit, freeze(selected));
  return selected;
}

export function referenceStateAtDistance(reference: ReferenceReplay, distance: number): KartState {
  const frames = reference.frames;
  let best = frames[0];
  for (const frame of frames) if (Math.abs(frame.kart.lapDistanceMeters - distance) < Math.abs(best.kart.lapDistanceMeters - distance)) best = frame;
  return cloneKartState(best.kart);
}

export function referenceTimeAtDistance(reference: ReferenceReplay, distance: number): number {
  const index = interpolateAtDistance(reference.points, distance);
  const a = reference.points[index], b = reference.points[(index + 1) % reference.points.length];
  const endDistance = index + 1 === reference.points.length ? reference.frames.at(-1)!.kart.unwrappedDistanceMeters - reference.initialState.unwrappedDistanceMeters : b.distanceMeters;
  const endTime = index + 1 === reference.points.length ? reference.lapSeconds : b.benchmarkTimeSeconds;
  const ratio = Math.max(0, Math.min(1, (distance - a.distanceMeters) / Math.max(1e-9, endDistance - a.distanceMeters)));
  return a.benchmarkTimeSeconds + (endTime - a.benchmarkTimeSeconds) * ratio;
}

export function referencePoseAtTime(reference: ReferenceReplay, seconds: number) {
  const time = ((seconds % reference.lapSeconds) + reference.lapSeconds) % reference.lapSeconds;
  const fractionalIndex = time / FIXED_TIMESTEP_SECONDS, index = Math.floor(fractionalIndex), ratio = fractionalIndex - index;
  const a = reference.frames[index].kart, b = reference.frames[Math.min(index + 1, reference.frames.length - 1)].kart;
  return { position: { x: a.position.x + (b.position.x - a.position.x) * ratio, z: a.position.z + (b.position.z - a.position.z) * ratio }, headingRad: a.headingRad + wrapAngleRad(b.headingRad - a.headingRad) * ratio, speedKph: a.speedKph + (b.speedKph - a.speedKph) * ratio };
}

/** Inside-front-tire target measured from the executed Turn traversal. */
export function referenceApexTarget(circuit: CircuitData, reference: ReferenceReplay, turnNumber: number): Vector2D {
  const turn = circuit.turns[turnNumber - 1];
  const kart = referenceStateAtDistance(reference, turn.apexDistanceMeters);
  return insideFrontTirePosition(kart, turn.direction);
}

function measureComplexes(circuit: CircuitData, frames: ReferenceFrame[]): ReferenceComplexEvidence[] {
  const at = (distance: number) => {
    let index = frames.findIndex((frame) => frame.kart.lapDistanceMeters >= distance);
    if (index < 0) index = frames.length - 1;
    const a = frames[Math.max(0, index - 1)], b = frames[index];
    const ratio = Math.max(0, Math.min(1, (distance - a.kart.lapDistanceMeters) / Math.max(1e-9, b.kart.lapDistanceMeters - a.kart.lapDistanceMeters)));
    return { seconds: a.lapSeconds + (b.lapSeconds - a.lapSeconds) * ratio, speedKph: a.kart.speedKph + (b.kart.speedKph - a.kart.speedKph) * ratio };
  };
  return CORNER_COMPLEXES.map((complex) => {
    const first = circuit.turns[complex.turns[0] - 1], last = circuit.turns[complex.turns[complex.turns.length - 1] - 1];
    const entry = at(first.entryDistanceMeters), exit = at(last.exitDistanceMeters);
    return { id: complex.id, seconds: exit.seconds - entry.seconds, entrySpeedKph: entry.speedKph, exitSpeedKph: exit.speedKph,
      turns: complex.turns.map((number) => ({ number, seconds: at(circuit.turns[number - 1].exitDistanceMeters).seconds - at(circuit.turns[number - 1].entryDistanceMeters).seconds })) };
  });
}
