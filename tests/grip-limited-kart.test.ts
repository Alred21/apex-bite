import { describe, expect, it } from 'vitest';
import type { SessionSnapshot, Vector2D } from '../src/simulation/types';
import { createSimulationSession } from '../src/simulation/session';

function pointSegmentDistance(point: Vector2D, a: Vector2D, b: Vector2D): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - dx * fraction, point.z - a.z - dz * fraction);
}

function segmentDistance(a: Vector2D, b: Vector2D, c: Vector2D, d: Vector2D): number {
  const cross = (p: Vector2D, q: Vector2D, r: Vector2D) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Independent polygon-edge check uses the detailed model's measured envelope, not collision helpers. */
function visibleKartWallClearance(snapshot: SessionSnapshot): number {
  const { kart, circuit } = snapshot;
  const cos = Math.cos(kart.headingRad), sin = Math.sin(kart.headingRad);
  const body = [[0.87, 0.45], [0.87, -0.45], [-0.79, -0.45], [-0.79, 0.45]].map(([forward, right]) => ({
    x: kart.position.x + forward * cos - right * sin,
    z: kart.position.z + forward * sin + right * cos,
  }));
  let minimum = Infinity;
  for (const side of ['leftBarrier', 'rightBarrier'] as const) {
    for (let i = 0; i < circuit.samples.length; i += 2) {
      const a = circuit.samples[i][side], b = circuit.samples[(i + 2) % circuit.samples.length][side];
      const dx = b.x - a.x, dz = b.z - a.z;
      const first = { x: a.x - dx * 0.02, z: a.z - dz * 0.02 };
      const last = { x: b.x + dx * 0.02, z: b.z + dz * 0.02 };
      for (let edge = 0; edge < body.length; edge++) minimum = Math.min(minimum, segmentDistance(body[edge], body[(edge + 1) % body.length], first, last));
    }
  }
  return minimum;
}

/** Driver-visible invariants, exercised through the same session interface as the browser. */
describe('Progressive grip-limited electric Kart', () => {
  it('limits excessive turn-in by tire grip rather than rotating unrestrictedly at Flying Start speed', () => {
    const session = createSimulationSession();
    const initial = session.getSnapshot();
    let snapshot = initial;
    for (let tick = 0; tick < 12; tick++) {
      snapshot = session.step(1 / 120, { throttle: 1, steer: 1 });
      expect(Math.abs(snapshot.kart.lateralAccelMps2)).toBeLessThanOrEqual(11);
      expect(snapshot.kart.speedKph).toBeLessThanOrEqual(45);
    }
    expect(snapshot.kart.headingRad - initial.kart.headingRad).toBeLessThan(0.15);
    expect(snapshot.kart.slipRatio).toBeGreaterThan(0.5);
  });
  it('normalizes invalid inputs and gives rear braking priority over simultaneous motor demand', () => {
    const session = createSimulationSession();
    const braking = session.step(1 / 120, { throttle: 1, brake: 0.5, steer: Number.NaN });
    expect(braking.kart.throttleInput).toBe(0);
    expect(braking.kart.brakeInput).toBe(0.5);
    expect(Number.isFinite(braking.kart.headingRad)).toBe(true);
    const invalid = session.step(1 / 120, { throttle: Number.NaN, brake: Number.POSITIVE_INFINITY, steer: -Infinity });
    expect(invalid.kart.throttleInput).toBe(0);
    expect(invalid.kart.brakeInput).toBe(0);
    expect(Number.isFinite(invalid.kart.position.x)).toBe(true);
  });

  it('executes large frame intervals as identical 120 Hz ticks and rejects invalid time without changing the session', () => {
    const batched = createSimulationSession();
    const fixed = createSimulationSession();
    const input = { throttle: 0.7, steer: 0.3 };
    batched.step(0.1, input);
    for (let i = 0; i < 12; i++) fixed.step(1 / 120, input);
    expect(batched.getSnapshot().kart).toEqual(fixed.getSnapshot().kart);
    expect(batched.getSnapshot().tick).toBe(12);
    const before = batched.getSnapshot();
    for (const dt of [-1, Number.NaN, Infinity]) {
      expect(() => batched.step(dt, input)).toThrow();
      expect(batched.getSnapshot()).toEqual(before);
    }
    expect(batched.step(0, input)).toEqual(before);
  });

  it('keeps heading continuous at Barrier impact while slowing and invalidating the Clean Lap', () => {
    const session = createSimulationSession();
    let snapshot = session.getSnapshot();
    let contactSeen = false;
    for (let i = 0; i < 300; i++) {
      const previous = snapshot;
      snapshot = session.step(1 / 120, { throttle: 1, steer: -1 });
      if (snapshot.kart.barrierContact) {
        contactSeen = true;
        expect(Math.abs(snapshot.kart.headingRad - previous.kart.headingRad)).toBeLessThan(0.025);
        expect(snapshot.kart.speedMps).toBeLessThan(previous.kart.speedMps);
        expect(snapshot.lap.isClean).toBe(false);
        expect(visibleKartWallClearance(snapshot)).toBeGreaterThanOrEqual(0.12);
        expect(snapshot.kart.barrierContactCount).toBeGreaterThan(0);
        break;
      }
    }
    expect(contactSeen).toBe(true);
  });

  it('shares finite tire grip between rear braking and turning without a force switch at Trail Braking thresholds', () => {
    const session = createSimulationSession();
    for (let tick = 0; tick < 40; tick++) session.step(1 / 120, { throttle: 1, steer: 0.7 });
    for (let tick = 0; tick < 24; tick++) {
      const snapshot = session.step(1 / 120, { brake: 0.7, steer: 0.7 });
      if (!snapshot.kart.barrierContact) {
        // Reported deceleration also includes up to 0.22 m/s² rolling drag,
        // outside the unchanged 10.5 m/s² tire ellipse (10.72 total bound).
        expect(Math.hypot(snapshot.kart.forwardAccelMps2, snapshot.kart.lateralAccelMps2)).toBeLessThanOrEqual(10.72);
      }
    }
    const lower = createSimulationSession().step(1 / 120, { brake: 0.199, steer: 0.3 });
    const upper = createSimulationSession().step(1 / 120, { brake: 0.201, steer: 0.3 });
    expect(Math.abs(lower.kart.forwardAccelMps2 - upper.kart.forwardAccelMps2)).toBeLessThan(0.1);
  });

  it('starts representative Corner Drills with whole-Kart clearance instead of spawning bodywork inside a Barrier', () => {
    const session = createSimulationSession();
    for (const target of ['T1', 'T3', 'T8', 'T11'] as const) {
      const snapshot = session.selectDrillTarget(target);
      expect(visibleKartWallClearance(snapshot)).toBeGreaterThanOrEqual(0.12);
    }
  });

});
