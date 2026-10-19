import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #2: Walking Skeleton — K1 Speed Toronto Circuit & Electric Kart', () => {
  it('exposes the clockwise 11-Turn K1 Speed Toronto Circuit with a corrected estimated physical corridor and variable 4.8m–6.0m width', () => {
    const session = createSimulationSession();
    const snapshot = session.getSnapshot();

    expect(snapshot.circuit.name).toBe('K1 Speed Toronto');
    expect(snapshot.circuit.totalLengthMeters).toBeGreaterThanOrEqual(350);
    expect(snapshot.circuit.totalLengthMeters).toBeLessThanOrEqual(375);

    const turns = snapshot.circuit.turns;
    expect(turns).toHaveLength(11);
    expect(turns.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(turns.map((t) => t.direction)).toEqual([
      'Right', // T1: 90° right after start/finish
      'Right', // T2: right turn into first infield chute
      'Left',  // T3: tight 180° left hairpin
      'Right', // T4: 90° right at top-left
      'Right', // T5: north right turn
      'Right', // T6: upper-right kink (right)
      'Left',  // T7: upper-right kink (left)
      'Right', // T8: wide 180° far-right sweeper
      'Right', // T9: right turn off back straight
      'Left',  // T10: tight 180° lower infield hairpin
      'Right', // T11: final 180° right carousel onto main straight
    ]);

    // Turns must progress monotonically around the clockwise loop
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].apexDistanceMeters).toBeGreaterThan(turns[i - 1].apexDistanceMeters);
    }

    // Variable track width: tighter hairpins/chutes (~4.8m–5.2m) vs wider sweepers/straights (~5.5m–6.0m)
    const widths = snapshot.circuit.samples.map((s) => s.widthMeters);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    expect(minWidth).toBeGreaterThanOrEqual(4.75);
    expect(minWidth).toBeLessThanOrEqual(5.1);
    expect(maxWidth).toBeGreaterThanOrEqual(5.6);
    expect(maxWidth).toBeLessThanOrEqual(6.05);
  });

  it('models direct-drive electric torque tapering into a hard 45.0 km/h limiter and off-throttle motor drag', () => {
    const session = createSimulationSession();

    // Step 0.5s on full throttle via keyboard W key
    let snap = session.getSnapshot();
    for (let i = 0; i < 60; i++) {
      snap = session.step(1 / 120, { keys: { up: true } });
    }
    const lowSpeedAccel = snap.kart.forwardAccelMps2;
    expect(snap.kart.speedKph).toBeGreaterThan(8);
    expect(lowSpeedAccel).toBeGreaterThan(4.0);

    // The remaining Flying Start straight can reach the real limiter without a line-following aid.
    for (let i = 0; i < 30; i++) {
      snap = session.step(1 / 120, { throttle: 1, steer: 0 });
      expect(snap.kart.speedKph).toBeLessThanOrEqual(45.0001);
    }
    expect(snap.kart.barrierContact).toBe(false);
    expect(snap.kart.speedKph).toBeCloseTo(45.0, 1);

    const speedBeforeCoast = snap.kart.speedKph;
    for (let i = 0; i < 30; i++) snap = session.step(1 / 120, { steer: 0 });
    expect(snap.kart.speedKph).toBeLessThan(speedBeforeCoast - 1.0);
  });

  it('supports keyboard and gamepad steering/braking and exposes third-person Chase Cam pose', () => {
    const session = createSimulationSession();
    const initialHeading = session.getSnapshot().kart.headingRad;

    let snap = session.getSnapshot();
    for (let i = 0; i < 60; i++) {
      snap = session.step(1 / 120, {
        gamepad: { throttle: 0.8, brake: 0, steer: 0.5 },
      });
    }

    expect(snap.kart.headingRad).toBeGreaterThan(initialHeading);
    expect(snap.camera.mode).toBe('Chase Cam');
    const distFromKartToChaseCam = Math.hypot(
      snap.camera.position.x - snap.kart.position.x,
      snap.camera.position.z - snap.kart.position.z,
    );
    expect(distFromKartToChaseCam).toBeGreaterThan(2.5);
    expect(distFromKartToChaseCam).toBeLessThan(6.0);
    expect(snap.camera.position.y).toBeGreaterThan(1.2);
  });
});

