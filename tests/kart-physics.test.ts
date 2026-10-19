import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #3: Solid-Axle Kart Physics, Trail Braking, Barrier Collisions & Progressive Controls', () => {
  it('shapes keyboard S brake through a progressive Trail Braking window while Spacebar commands immediate 100% rear brake', () => {
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

    // Spacebar commands immediate 1.0 rear brake on the very first tick after release
    session.step(1 / 120, {});
    const spaceSnap = session.step(1 / 120, { keys: { space: true } });
    expect(spaceSnap.kart.brakeInput).toBe(1.0);
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
    expect(snap.lap.isClean).toBe(false);
    expect(snap.kart.speedKph).toBeLessThan(peakSpeedBeforeHit);
  });
});
