import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #3: Solid-Axle Kart Physics, Trail Braking, Barrier Collisions & Progressive Controls', () => {
  it('shapes keyboard S brake through a ~250ms Trail Braking window while Spacebar commands immediate 100% rear brake', () => {
    const session = createSimulationSession();
    // Accelerate down the main straight to ~40 km/h at Turn 1 entry
    for (let i = 0; i < 160; i++) {
      session.step(1 / 120, { keys: { up: true } });
    }

    // Hold S (down) for 180ms (22 ticks at 120 Hz) with slight turn-in: must stay in Trail Braking zone (0.35..0.60)
    let snap = session.getSnapshot();
    for (let i = 0; i < 22; i++) {
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

  it('uses slip-aware progressive keyboard steering and models continuous Axle Scrub and rear-braking response', () => {
    // Scenario A: Aggressive turn-in at Turn 1 entry with NO braking (flat chassis, inside rear tire loaded -> heavy Axle Scrub)
    const noTrailSession = createSimulationSession();
    for (let i = 0; i < 160; i++) {
      noTrailSession.step(1 / 120, { keys: { up: true } });
    }
    const headingBeforeA = noTrailSession.getSnapshot().kart.headingRad;

    // First tick of keyboard steering must be progressive, not instant full lock
    const firstSteerTick = noTrailSession.step(1 / 120, { keys: { right: true } });
    expect(Math.abs(firstSteerTick.kart.steerAngleRad)).toBeLessThan(0.1);

    let snapA = firstSteerTick;
    for (let i = 0; i < 35; i++) {
      snapA = noTrailSession.step(1 / 120, { keys: { right: true } });
    }

    // Scenario B: Same entry speed at Turn 1 entry, but apply 200ms keyboard Trail Braking (S + Right) to shift weight forward and unload inside rear
    const trailSession = createSimulationSession();
    for (let i = 0; i < 160; i++) {
      trailSession.step(1 / 120, { keys: { up: true } });
    }
    const headingBeforeB = trailSession.getSnapshot().kart.headingRad;
    let snapB = trailSession.getSnapshot();
    for (let i = 0; i < 24; i++) {
      snapB = trailSession.step(1 / 120, { keys: { down: true, right: true } });
    }
    for (let i = 0; i < 12; i++) {
      snapB = trailSession.step(1 / 120, { keys: { right: true } });
    }

    const yawChangeNoTrail = snapA.kart.headingRad - headingBeforeA;
    const yawChangeWithTrail = snapB.kart.headingRad - headingBeforeB;

    // Without unloading the inside rear, solid rear axle produces significant Axle Scrub
    expect(snapA.kart.axleScrub).toBeGreaterThan(0.25);
    // Rear braking reduces axle loading without granting a scripted rotation multiplier.
    expect(snapB.kart.axleScrub).toBeLessThan(snapA.kart.axleScrub);
    expect(yawChangeWithTrail).toBeGreaterThan(0);
    expect(yawChangeNoTrail).toBeGreaterThan(0);
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
