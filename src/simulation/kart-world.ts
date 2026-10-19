import { stepKartDynamics, type KartCommand, type PlanarKartState } from './kart-dynamics';
import { FIXED_TIMESTEP_SECONDS, KART_DIMENSIONS, MAX_KART_SPEED_MPS } from './kart-parameters';
import type { CircuitData, KartState, SectorNumber, Vector2D } from './types';
import { buildBarrierSegments, BARRIER_HALF_THICKNESS_METERS, type BarrierSegment } from './barrier-geometry';

interface Pose { position: Vector2D; headingRad: number; }
const GRID_SIZE = 3;
const SAFETY_METERS = 0.004;
const indexes = new WeakMap<CircuitData, Map<string, BarrierSegment[]>>();

function barrierIndex(circuit: CircuitData): Map<string, BarrierSegment[]> {
  const cached = indexes.get(circuit);
  if (cached) return cached;
  const grid = new Map<string, BarrierSegment[]>();
  for (const segment of buildBarrierSegments(circuit)) {
    const margin = BARRIER_HALF_THICKNESS_METERS;
    for (let x = Math.floor((Math.min(segment.a.x, segment.b.x) - margin) / GRID_SIZE); x <= Math.floor((Math.max(segment.a.x, segment.b.x) + margin) / GRID_SIZE); x++) {
      for (let z = Math.floor((Math.min(segment.a.z, segment.b.z) - margin) / GRID_SIZE); z <= Math.floor((Math.max(segment.a.z, segment.b.z) + margin) / GRID_SIZE); z++) {
        const key = `${x},${z}`;
        const cell = grid.get(key) ?? [];
        cell.push(segment);
        grid.set(key, cell);
      }
    }
  }
  indexes.set(circuit, grid);
  return grid;
}

function nearbySegments(circuit: CircuitData, previous: Pose, next: Pose): BarrierSegment[] {
  const grid = barrierIndex(circuit);
  const radius = Math.hypot(KART_DIMENSIONS.frontExtentMeters, KART_DIMENSIONS.halfWidthMeters) + BARRIER_HALF_THICKNESS_METERS;
  const result = new Set<BarrierSegment>();
  for (let x = Math.floor((Math.min(previous.position.x, next.position.x) - radius) / GRID_SIZE); x <= Math.floor((Math.max(previous.position.x, next.position.x) + radius) / GRID_SIZE); x++) {
    for (let z = Math.floor((Math.min(previous.position.z, next.position.z) - radius) / GRID_SIZE); z <= Math.floor((Math.max(previous.position.z, next.position.z) + radius) / GRID_SIZE); z++) {
      for (const segment of grid.get(`${x},${z}`) ?? []) result.add(segment);
    }
  }
  return [...result];
}

/** Segment against an oriented whole-Kart rectangle expanded by the wall's half thickness. */
function overlaps(pose: Pose, segment: BarrierSegment): boolean {
  const cos = Math.cos(pose.headingRad), sin = Math.sin(pose.headingRad);
  const local = (point: Vector2D): Vector2D => {
    const x = point.x - pose.position.x, z = point.z - pose.position.z;
    return { x: x * cos + z * sin, z: -x * sin + z * cos };
  };
  const a = local(segment.a), b = local(segment.b);
  const radius = BARRIER_HALF_THICKNESS_METERS + SAFETY_METERS;
  const bounds = [
    [-KART_DIMENSIONS.rearExtentMeters - radius, KART_DIMENSIONS.frontExtentMeters + radius, a.x, b.x - a.x],
    [-KART_DIMENSIONS.halfWidthMeters - radius, KART_DIMENSIONS.halfWidthMeters + radius, a.z, b.z - a.z],
  ];
  let entry = 0, exit = 1;
  for (const [low, high, start, direction] of bounds) {
    if (Math.abs(direction) < 1e-12) {
      if (start < low || start > high) return false;
    } else {
      const first = (low - start) / direction, last = (high - start) / direction;
      entry = Math.max(entry, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (entry > exit) return false;
    }
  }
  return true;
}

function interpolatePose(a: Pose, b: Pose, fraction: number): Pose {
  return {
    position: { x: a.position.x + (b.position.x - a.position.x) * fraction, z: a.position.z + (b.position.z - a.position.z) * fraction },
    headingRad: a.headingRad + (b.headingRad - a.headingRad) * fraction,
  };
}

function wallNormal(segment: BarrierSegment, position: Vector2D): Vector2D {
  const dx = segment.b.x - segment.a.x, dz = segment.b.z - segment.a.z;
  const t = Math.max(0, Math.min(1, ((position.x - segment.a.x) * dx + (position.z - segment.a.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)));
  const nx = position.x - segment.a.x - dx * t, nz = position.z - segment.a.z - dz * t;
  const length = Math.hypot(nx, nz);
  return length > 1e-9 ? { x: nx / length, z: nz / length } : Math.hypot(dx, dz) > 1e-9 ? { x: -dz / Math.hypot(dx, dz), z: dx / Math.hypot(dx, dz) } : { x: 1, z: 0 };
}

export function hasKartBarrierContact(circuit: CircuitData, pose: Pose): boolean {
  return nearbySegments(circuit, pose, pose).some((segment) => overlaps(pose, segment));
}

function sweepBarriers(circuit: CircuitData, previous: Pose, next: Pose): { pose: Pose; normal: Vector2D | null; fraction: number } {
  const segments = nearbySegments(circuit, previous, next);
  const displacement = Math.hypot(next.position.x - previous.position.x, next.position.z - previous.position.z);
  const angularDistance = Math.abs(next.headingRad - previous.headingRad) * Math.hypot(KART_DIMENSIONS.frontExtentMeters, KART_DIMENSIONS.halfWidthMeters);
  // Bound every envelope point's movement by 2cm; wall thickness is 24cm.
  const subdivisions = Math.max(1, Math.ceil((displacement + angularDistance) / 0.02));
  let safeFraction = 0;
  for (let sample = 1; sample <= subdivisions; sample++) {
    const fraction = sample / subdivisions;
    const pose = interpolatePose(previous, next, fraction);
    const contact = segments.find((segment) => overlaps(pose, segment));
    if (contact) {
      let low = safeFraction, high = fraction;
      for (let iteration = 0; iteration < 10; iteration++) {
        const middle = (low + high) * 0.5;
        if (segments.some((segment) => overlaps(interpolatePose(previous, next, middle), segment))) high = middle;
        else low = middle;
      }
      const safePose = interpolatePose(previous, next, Math.max(0, low - 1e-5));
      return { pose: safePose, normal: wallNormal(contact, safePose.position), fraction: low };
    }
    safeFraction = fraction;
  }
  return { pose: next, normal: null, fraction: 1 };
}

/** Continuous local projection prevents a nearby branch from stealing Circuit progress. */
export function projectKartProgress(circuit: CircuitData, position: Vector2D, previousDistanceMeters: number) {
  const length = circuit.totalLengthMeters;
  let bestDistanceSquared = Infinity;
  let bestDistance = previousDistanceMeters;
  const windowMeters = 4;
  const samples = circuit.samples;
  let lower = 0, upper = samples.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (samples[middle].distanceMeters <= previousDistanceMeters) lower = middle;
    else upper = middle - 1;
  }
  const candidateIndices = new Set<number>([lower]);
  for (const direction of [-1, 1]) {
    for (let offset = 1; offset < samples.length; offset++) {
      const index = (lower + direction * offset + samples.length) % samples.length;
      let delta = samples[index].distanceMeters - previousDistanceMeters;
      delta = ((delta + length * 1.5) % length) - length * 0.5;
      // Include the boundary segment as the nearest point can lie at its far endpoint.
      candidateIndices.add(index);
      if (Math.abs(delta) > windowMeters) break;
    }
  }
  for (const i of candidateIndices) {
    const a = samples[i], b = samples[(i + 1) % samples.length];
    const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z;
    const t = Math.max(0, Math.min(1, ((position.x - a.center.x) * dx + (position.z - a.center.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)));
    const distanceSquared = (position.x - a.center.x - dx * t) ** 2 + (position.z - a.center.z - dz * t) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      const span = i === circuit.samples.length - 1 ? length - a.distanceMeters : b.distanceMeters - a.distanceMeters;
      bestDistance = (a.distanceMeters + t * span) % length;
    }
  }
  let deltaMeters = bestDistance - previousDistanceMeters;
  if (deltaMeters > length / 2) deltaMeters -= length;
  if (deltaMeters < -length / 2) deltaMeters += length;
  const sector: SectorNumber = bestDistance <= circuit.turns[2].exitDistanceMeters ? 1 : bestDistance <= circuit.turns[7].exitDistanceMeters ? 2 : 3;
  const currentTurn = circuit.turns.find((turn) => bestDistance >= turn.entryDistanceMeters && bestDistance <= turn.exitDistanceMeters)?.number ?? null;
  return { distanceMeters: bestDistance, deltaMeters, progress: bestDistance / length, sector, currentTurn };
}

/** Pure, complete 120 Hz world step shared by the driver and future Reference Lap builder. */
export function stepKartOnCircuit(circuit: CircuitData, previous: KartState, command: KartCommand, dtSeconds = FIXED_TIMESTEP_SECONDS): KartState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > FIXED_TIMESTEP_SECONDS + 1e-12) throw new RangeError('World steps must be at most one 120 Hz tick.');
  const dynamics = stepKartDynamics(previous, command, dtSeconds);
  const collision = sweepBarriers(circuit, previous, dynamics);
  let resolvedPose = collision.pose;
  let velocity = dynamics.velocity;
  let yawRateRadPerSecond = dynamics.yawRateRadPerSecond;
  const barrierContact = collision.normal !== null;
  if (collision.normal) {
    const normal = collision.normal;
    const inward = Math.min(0, velocity.x * normal.x + velocity.z * normal.z);
    const friction = previous.barrierContact ? Math.max(0, 1 - 2.5 * dtSeconds / Math.max(0.1, dynamics.speedMps)) : 0.92;
    velocity = { x: (velocity.x - normal.x * inward * 1.03) * friction, z: (velocity.z - normal.z * inward * 1.03) * friction };
    const remainingSeconds = (1 - collision.fraction) * dtSeconds;
    const slideTarget = {
      position: { x: collision.pose.position.x + velocity.x * remainingSeconds, z: collision.pose.position.z + velocity.z * remainingSeconds },
      headingRad: collision.pose.headingRad,
    };
    resolvedPose = sweepBarriers(circuit, collision.pose, slideTarget).pose;
    yawRateRadPerSecond *= 0.7;
  }
  const speedMps = Math.min(MAX_KART_SPEED_MPS, Math.hypot(velocity.x, velocity.z));
  const projection = projectKartProgress(circuit, resolvedPose.position, previous.lapDistanceMeters);
  return {
    ...dynamics,
    position: resolvedPose.position,
    headingRad: resolvedPose.headingRad,
    velocity,
    yawRateRadPerSecond,
    speedMps,
    speedKph: speedMps * 3.6,
    steeringWheelAngleRad: dynamics.steerAngleRad * 2.2,
    forwardAccelMps2: (speedMps - previous.speedMps) / dtSeconds,
    barrierContact,
    barrierContactCount: previous.barrierContactCount + (barrierContact && !previous.barrierContact ? 1 : 0),
    lapDistanceMeters: projection.distanceMeters,
    unwrappedDistanceMeters: previous.unwrappedDistanceMeters + projection.deltaMeters,
    lapProgress: projection.progress,
    currentSector: projection.sector,
    currentTurn: projection.currentTurn,
  };
}

export type { PlanarKartState };
