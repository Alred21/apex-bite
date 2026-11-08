import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #3: Solid-Axle Kart Physics, Trail Braking, Barrier Collisions & Progressive Controls', () => {
  it('shapes S and Space through the same progressive Trail Braking window', () => {
    const session = createSimulationSession();
    // Accelerate down the main straight to ~40 km/h at Turn 1 entry
    for (let i = 0; i < 40; i++) {
      session.step(1 / 120, { keys: { up: true } });
    }

    // A short S pulse with turn-in permits controlled Trail Braking before full pressure.
    let snap = session.getSnapshot();
    for (let i = 0; i < 12; i++) {
      snap = session.step(1 / 120, { keys: { down: true, right: true } });
    }
    expect(snap.kart.brakeInput).toBeGreaterThanOrEqual(0.35);
    expect(snap.kart.brakeInput).toBeLessThanOrEqual(0.6);
    expect(snap.kart.isTrailBraking).toBe(true);

    // Hold S for an additional 450ms (54 ticks): brake pressure ramps up to full braking (> 0.9)
    for (let i = 0; i < 54; i++) {
      snap = session.step(1 / 120, { keys: { down: true } });
    }
    expect(snap.kart.brakeInput).toBeGreaterThan(0.9);

    // Switching aliases preserves pedal pressure rather than bypassing the ramp.
    const released = session.step(1 / 120, {});
    const spaceSnap = session.step(1 / 120, { keys: { space: true } });
    expect(spaceSnap.kart.brakeInput).toBeGreaterThan(released.kart.brakeInput);
    expect(spaceSnap.kart.brakeInput).toBeLessThan(1);
  });

  it('models continuous Axle Scrub and rear-braking response with equal analog steering', () => {
    const noTrailSession = createSimulationSession();
    const trailSession = createSimulationSession();
    const initialHeading = noTrailSession.getSnapshot().kart.headingRad;
    const noTrail = noTrailSession.step(1 / 120, { steer: 0.6 });
    const trail = trailSession.step(1 / 120, { steer: 0.6, brake: 0.3 });
    expect(noTrail.kart.axleScrub).toBeGreaterThan(0);
    expect(trail.kart.axleScrub).toBeLessThan(noTrail.kart.axleScrub);
    expect(trail.kart.speedKph).toBeLessThan(noTrail.kart.speedKph);
    expect(trail.kart.isTrailBraking).toBe(true);
    expect(trail.kart.headingRad).toBeGreaterThan(initialHeading);
    expect(noTrail.kart.headingRad).toBeGreaterThan(initialHeading);
  });

  it('detects indoor Barrier collisions, scrubs speed via tangential wall friction, and invalidates Clean Lap status', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().lap.isClean).toBe(true);

    // Accelerate and steer hard left directly into the left Barrier on the main straight
    let snap = session.getSnapshot();
    let peakSpeedBeforeHit = 0;
    for (let i = 0; i < 240; i++) {
      snap = session.step(1 / 120, {
        throttle: 1.0,
        steer: -1.0,
      });
      peakSpeedBeforeHit = Math.max(peakSpeedBeforeHit, snap.kart.speedKph);
      if (snap.kart.barrierContact) break;
    }

    expect(snap.kart.barrierContact).toBe(true);
    expect(snap.kart.barrierContactCount).toBeGreaterThanOrEqual(1);
    expect(snap.kart.barrierImpactSpeedMps).toBeGreaterThan(1.8);
    expect(snap.lap.isClean).toBe(false);
    expect(snap.kart.speedKph).toBeLessThan(peakSpeedBeforeHit);
  });

  it('aligns heading toward the Barrier tangent and preserves Clean Lap on a brief shallow graze while invalidating prolonged wall-riding', () => {
    const session = createSimulationSession();
    let snap = session.getSnapshot();
    const samples = snap.circuit.samples;

    // Regulate inward velocity toward the nearest left BarrierSegment to ~0.9 m/s for a genuine shallow graze
    const steerForInwardBarrierSpeed = (targetInwardMps: number): number => {
      let bestDistSq = Infinity;
      let nx = 0;
      let nz = 1;
      const frontX = snap.kart.position.x + Math.cos(snap.kart.headingRad) * 0.88;
      const frontZ = snap.kart.position.z + Math.sin(snap.kart.headingRad) * 0.88;
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i].leftBarrier;
        const b = samples[(i + 1) % samples.length].leftBarrier;
        const mx = 0.5 * (a.x + b.x);
        const mz = 0.5 * (a.z + b.z);
        const dSq = (frontX - mx) ** 2 + (frontZ - mz) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const len = Math.hypot(dx, dz) || 1;
          nx = -dz / len;
          nz = dx / len;
          const toKart = (snap.kart.position.x - mx) * nx + (snap.kart.position.z - mz) * nz;
          if (toKart < 0) {
            nx = -nx;
            nz = -nz;
          }
        }
      }
      const speedTowardWall = -(snap.kart.velocity.x * nx + snap.kart.velocity.z * nz);
      const speedError = targetInwardMps - speedTowardWall;
      return Math.max(-0.5, Math.min(0.5, -speedError * 0.45));
    };

    for (let i = 0; i < 360 && !snap.kart.barrierContact; i++) {
      snap = session.step(1 / 120, { throttle: 0.65, steer: steerForInwardBarrierSpeed(0.9) });
    }
    expect(snap.kart.barrierContact).toBe(true);
    expect(snap.kart.barrierImpactSpeedMps).toBeGreaterThan(0);
    expect(snap.kart.barrierImpactSpeedMps).toBeLessThanOrEqual(1.8);
    // A brief shallow graze preserves Clean Lap status
    expect(snap.lap.isClean).toBe(true);

    // Steering away immediately after the brief brush keeps the lap Clean and rotates heading away from the left wall
    const headingAtTouch = snap.kart.headingRad;
    const afterBrush = session.step(1 / 120, { throttle: 0.65, steer: 0.65 });
    expect(afterBrush.kart.headingRad).toBeGreaterThan(headingAtTouch);
    expect(afterBrush.lap.isClean).toBe(true);

    // Deliberately grinding against the wall for > 0.35s (65 ticks) invalidates Clean Lap (anti-wall-riding)
    for (let i = 0; i < 65; i++) {
      snap = session.step(1 / 120, { throttle: 0.85, steer: steerForInwardBarrierSpeed(1.5) });
    }
    expect(snap.lap.isClean).toBe(false);
  });
});
