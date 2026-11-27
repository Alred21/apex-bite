import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';
import type { SessionSnapshot } from '../src/simulation/types';
import { SkidRibbonSystem } from '../src/render/skid-marks';

function makeSkidSnapshot(
  base: SessionSnapshot,
  overrides: {
    tick: number;
    x: number;
    z: number;
    headingRad?: number;
    speedKph?: number;
    axleScrub?: number;
    slipRatio?: number;
    mode?: SessionSnapshot['mode'];
  },
): SessionSnapshot {
  return {
    ...base,
    tick: overrides.tick,
    mode: overrides.mode ?? base.mode,
    kart: {
      ...base.kart,
      position: { x: overrides.x, z: overrides.z },
      headingRad: overrides.headingRad ?? 0,
      speedKph: overrides.speedKph ?? 45,
      speedMps: (overrides.speedKph ?? 45) / 3.6,
      axleScrub: overrides.axleScrub ?? 0.55,
      slipRatio: overrides.slipRatio ?? 0.45,
    },
  };
}

describe('SkidRibbonSystem zero-allocation ring buffer', () => {
  const session = createSimulationSession();
  const baseSnapshot = session.getSnapshot();

  it('emits continuous dual rear-tire ribbons at +-0.335 m track and 0.156 m width without allocating extra meshes', () => {
    const system = new SkidRibbonSystem(64);
    expect(system.capacity).toBe(64);
    expect(system.getActiveSegmentCount()).toBe(0);
    expect(system.mesh).toBeInstanceOf(THREE.Mesh);

    const posAttr = system.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const initialArrayRef = posAttr.array;

    // Drive forward while scrubbing across 10 steps
    for (let i = 0; i < 10; i++) {
      system.update(
        makeSkidSnapshot(baseSnapshot, {
          tick: i + 1,
          x: i * 0.25,
          z: 0,
          headingRad: 0,
          axleScrub: 0.5,
        }),
      );
    }

    // First step sets anchor; next 9 steps emit 9 continuous dual-tire segments
    expect(system.getActiveSegmentCount()).toBe(9);
    // Zero buffer reallocation
    expect(posAttr.array).toBe(initialArrayRef);

    // Check dual-tire lateral offsets at ±0.335 m and width 0.156 m
    const arr = posAttr.array as Float32Array;
    // Slot 0, left tire v0..v1 are at z = -0.335 - 0.078 = -0.413 and -0.335 + 0.078 = -0.257
    const zLeftInner = arr[2];
    const zLeftOuter = arr[5];
    expect(Math.abs(zLeftOuter - zLeftInner)).toBeCloseTo(0.156, 4);
    expect((zLeftInner + zLeftOuter) * 0.5).toBeCloseTo(-0.335, 4);

    // Slot 0, right tire v4..v5 at z = +0.335 ± 0.078
    const zRightInner = arr[4 * 3 + 2];
    const zRightOuter = arr[5 * 3 + 2];
    expect(Math.abs(zRightOuter - zRightInner)).toBeCloseTo(0.156, 4);
    expect((zRightInner + zRightOuter) * 0.5).toBeCloseTo(0.335, 4);
  });

  it('does not emit ribbons below 8 km/h or when grip is recovered, and splits strips cleanly on grip recovery or teleport', () => {
    const system = new SkidRibbonSystem(32);

    // Below 8 km/h -> no ribbon emitted
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 1, x: 0, z: 0, speedKph: 7.5, axleScrub: 0.8 }));
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 2, x: 0.3, z: 0, speedKph: 7.5, axleScrub: 0.8 }));
    expect(system.getActiveSegmentCount()).toBe(0);

    // Strip 1 at x = 0..0.4
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 3, x: 0, z: 0 }));
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 4, x: 0.4, z: 0 }));
    expect(system.getActiveSegmentCount()).toBe(1);

    // Grip recovery -> breaks strip
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 5, x: 0.8, z: 0, axleScrub: 0.05, slipRatio: 0.05 }));

    // Strip 2 after grip recovery at x = 5.0..5.4
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 6, x: 5.0, z: 0 }));
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 7, x: 5.4, z: 0 }));
    expect(system.getActiveSegmentCount()).toBe(2);

    // Teleport jump (same skidding flags, huge position jump) -> must NOT bridge x=5.4 to x=40.0
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 8, x: 40.0, z: 20.0 }));
    expect(system.getActiveSegmentCount()).toBe(2);

    system.update(makeSkidSnapshot(baseSnapshot, { tick: 9, x: 40.4, z: 20.0 }));
    expect(system.getActiveSegmentCount()).toBe(3);

    // Verify no quad segment stretches > 1.5 m
    const arr = system.mesh.geometry.getAttribute('position').array as Float32Array;
    for (let slot = 0; slot < 3; slot++) {
      const base = slot * 8 * 3;
      const dx = arr[base + 2 * 3] - arr[base];
      const dz = arr[base + 2 * 3 + 2] - arr[base + 2];
      expect(Math.hypot(dx, dz)).toBeLessThan(1.5);
    }

    // Reset (tick goes backwards) -> must split strip cleanly
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 1, x: -30.0, z: 10.0 }));
    expect(system.getActiveSegmentCount()).toBe(3);
    system.update(makeSkidSnapshot(baseSnapshot, { tick: 2, x: -29.6, z: 10.0 }));
    expect(system.getActiveSegmentCount()).toBe(4);
    const base3 = 3 * 8 * 3;
    expect(Math.hypot(arr[base3 + 6] - arr[base3], arr[base3 + 8] - arr[base3 + 2])).toBeLessThan(1.5);
  });

  it('wraps ring buffer cleanly at capacity without out-of-bounds or bridge stretches', () => {
    const system = new SkidRibbonSystem(8);
    for (let i = 0; i < 25; i++) {
      system.update(
        makeSkidSnapshot(baseSnapshot, {
          tick: i + 1,
          x: i * 0.3,
          z: Math.sin(i * 0.2) * 0.2,
        }),
      );
    }
    expect(system.getActiveSegmentCount()).toBe(8);
    const arr = system.mesh.geometry.getAttribute('position').array as Float32Array;
    for (let slot = 0; slot < 8; slot++) {
      const base = slot * 8 * 3;
      const dx = arr[base + 6] - arr[base];
      const dz = arr[base + 8] - arr[base + 2];
      expect(Number.isFinite(dx) && Number.isFinite(dz)).toBe(true);
      expect(Math.hypot(dx, dz)).toBeLessThan(1.5);
    }
  });
});
