import { describe, expect, it } from 'vitest';
import { isBarrierContactDirty } from '../src/simulation/kart-world';
import { createSimulationSession } from '../src/simulation/session';

describe('Barrier graze rule', () => {
  it('treats exactly 42 accumulated 120 Hz ticks (0.35 s) as a forgivable graze', () => {
    let seconds = 0;
    for (let tick = 0; tick < 42; tick++) seconds += 1 / 120;
    expect(isBarrierContactDirty(1, seconds)).toBe(false);
    expect(isBarrierContactDirty(1, seconds + 1 / 120)).toBe(true);
  });

  it('invalidates on inward normal speed above 1.8 m/s regardless of duration', () => {
    expect(isBarrierContactDirty(1.8, 0.01)).toBe(false);
    expect(isBarrierContactDirty(1.81, 0.01)).toBe(true);
  });

  it('reports zero impact speed while clear of every Barrier', () => {
    const session = createSimulationSession();
    const snapshot = session.step(1 / 120, { throttle: 0.5 });
    expect(snapshot.kart.barrierContact).toBe(false);
    expect(snapshot.kart.barrierImpactSpeedMps).toBe(0);
  });
});
