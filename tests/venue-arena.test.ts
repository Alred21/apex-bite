import { describe, expect, it } from 'vitest';
import { buildK1TorontoCircuit } from '../src/simulation/circuit';
import { BARRIER_HALF_THICKNESS_METERS } from '../src/simulation/barrier-geometry';
import { createSimulationSession } from '../src/simulation/session';
import {
  computeArenaLayout,
  computeMinCorridorAndBarrierClearance,
  computeOrientedBoxMinClearance,
  deriveMarshalSignalState,
  deriveStartLightsState,
  formatScoreboardData,
  getVenueQualityVisibility,
} from '../src/render/arena-layout';

const CHASE_CAM_HEIGHT_METERS = 2.1;

describe('indoor arena layout, clearance invariants, and live venue states', () => {
  const circuit = buildK1TorontoCircuit();
  const layout = computeArenaLayout(circuit);

  it('places the start/finish gantry over samples[0] with columns outside barriers and beam comfortably above Chase Cam', () => {
    expect(layout.gantry.beamBottomY).toBeGreaterThanOrEqual(3.35);
    expect(layout.gantry.lightTreeBottomY).toBeGreaterThanOrEqual(3.35);
    expect(layout.gantry.scoreboardBottomY).toBeGreaterThanOrEqual(3.35);
    expect(layout.gantry.beamBottomY - CHASE_CAM_HEIGHT_METERS).toBeGreaterThanOrEqual(1.25);

    const s0 = circuit.samples[0];
    const centerDist = Math.hypot(
      layout.gantry.center.x - s0.center.x,
      layout.gantry.center.z - s0.center.z,
    );
    expect(centerDist).toBeLessThan(0.05);
    expect(layout.gantry.spanMeters).toBeGreaterThan(
      s0.widthMeters + BARRIER_HALF_THICKNESS_METERS * 2 + 0.8,
    );

    const leftClear = computeOrientedBoxMinClearance(circuit, layout.gantry.leftColumn);
    const rightClear = computeOrientedBoxMinClearance(circuit, layout.gantry.rightColumn);
    expect(leftClear).toBeGreaterThanOrEqual(0.35);
    expect(rightClear).toBeGreaterThanOrEqual(0.35);
  });

  it('places the pit & staging bay, gate, charging stanchions, and parked karts strictly > 1.0 m outside barriers across all 490 samples', () => {
    expect(layout.pitBay.parkedKarts.length).toBeGreaterThanOrEqual(2);
    expect(layout.pitBay.parkedKarts.length).toBeLessThanOrEqual(3);
    expect(layout.pitBay.chargingStanchions.length).toBeGreaterThanOrEqual(2);
    expect(layout.pitBay.gatePosts.length).toBeGreaterThanOrEqual(2);

    for (const corner of layout.pitBay.apronCorners) {
      const clear = computeMinCorridorAndBarrierClearance(circuit, corner.x, corner.z, 0);
      expect(clear).toBeGreaterThan(1.0);
    }
    for (const post of layout.pitBay.gatePosts) {
      expect(computeOrientedBoxMinClearance(circuit, post)).toBeGreaterThan(1.0);
    }
    for (const stanchion of layout.pitBay.chargingStanchions) {
      expect(computeOrientedBoxMinClearance(circuit, stanchion)).toBeGreaterThan(1.0);
    }
    for (const parkedKart of layout.pitBay.parkedKarts) {
      expect(computeOrientedBoxMinClearance(circuit, parkedKart)).toBeGreaterThan(1.0);
    }
  });

  it('places corner marshal LED panels at T1, T3, T8, and T10 with >= 0.55 m clearance outside outer barrier faces', () => {
    const turnNumbers = layout.marshalPanels.map((p) => p.turnNumber).sort((a, b) => a - b);
    expect(turnNumbers).toEqual([1, 3, 8, 10]);

    for (const panel of layout.marshalPanels) {
      const boxClear = computeOrientedBoxMinClearance(circuit, panel.footprint);
      expect(boxClear, `Marshal T${panel.turnNumber} box clearance`).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('places rubber tire stacks behind outer corners T1, T4, T8, T11 and mezzanine columns & drain grates strictly clear of barriers', () => {
    const tireTurns = new Set(layout.tireStacks.map((t) => t.turnNumber));
    expect([...tireTurns].sort((a, b) => a - b)).toEqual([1, 4, 8, 11]);

    for (const stack of layout.tireStacks) {
      const clear = computeMinCorridorAndBarrierClearance(circuit, stack.x, stack.z, stack.radius);
      expect(clear, `Tire stack T${stack.turnNumber}`).toBeGreaterThanOrEqual(0.5);
    }

    expect(layout.mezzanine.columns.length).toBeGreaterThanOrEqual(4);
    for (const col of layout.mezzanine.columns) {
      expect(computeOrientedBoxMinClearance(circuit, col)).toBeGreaterThanOrEqual(2.0);
    }

    expect(layout.drainGrates.length).toBeGreaterThanOrEqual(4);
    for (const grate of layout.drainGrates) {
      const clear = computeMinCorridorAndBarrierClearance(
        circuit,
        grate.x,
        grate.z,
        Math.hypot(grate.halfWidth, grate.halfDepth),
      );
      expect(clear).toBeGreaterThanOrEqual(0.6);
    }

    expect(layout.trussZs.length).toBeGreaterThanOrEqual(6);
    expect(layout.hvacRuns.length).toBeGreaterThanOrEqual(2);
    expect(layout.highBayLamps.length).toBeGreaterThanOrEqual(12);
    expect(layout.banners.length).toBeGreaterThanOrEqual(2);
  });

  it('derives start lights, corner marshal signals, scoreboard text, and quality-tier visibility deterministically', () => {
    const session = createSimulationSession();
    const flyingSnapshot = session.getSnapshot();
    expect(flyingSnapshot.timeTrial.status).toBe('Flying Start');

    const flyingLights = deriveStartLightsState(flyingSnapshot, false);
    expect(flyingLights.mode).toBe('Prep');
    expect(flyingLights.pods).toHaveLength(5);

    const drivingSnapshot = {
      ...flyingSnapshot,
      timeTrial: { ...flyingSnapshot.timeTrial, status: 'Driving' as const },
      lap: { ...flyingSnapshot.lap, isClean: true, currentLapSeconds: 12.34, lastLapSeconds: 25.12, personalBestSeconds: 24.89 },
    };
    const greenLights = deriveStartLightsState(drivingSnapshot, false);
    expect(greenLights.mode).toBe('Green');

    const dirtyLights = deriveStartLightsState(
      { ...drivingSnapshot, lap: { ...drivingSnapshot.lap, isClean: false } },
      true,
    );
    expect(dirtyLights.mode).toBe('DirtyAmber');

    expect(deriveMarshalSignalState(drivingSnapshot)).toBe('GreenSteady');
    expect(
      deriveMarshalSignalState({
        ...drivingSnapshot,
        kart: { ...drivingSnapshot.kart, barrierContact: true },
      }),
    ).toBe('YellowFlash');
    expect(
      deriveMarshalSignalState({
        ...drivingSnapshot,
        kart: { ...drivingSnapshot.kart, driveDirection: 'Reverse' },
      }),
    ).toBe('RedPulse');

    const board = formatScoreboardData(drivingSnapshot);
    expect(board.lapLine).toContain('01');
    expect(board.currentTime).toBe('12.34');
    expect(board.lastTime).toBe('25.12');
    expect(board.pbTime).toBe('24.89');
    expect(board.refTime).toBe(drivingSnapshot.racingLine.benchmarkLapSeconds.toFixed(2));

    const perf = getVenueQualityVisibility('Performance');
    expect(perf.showGantry).toBe(true);
    expect(perf.showMarshalPanels).toBe(true);
    expect(perf.showParkedKarts).toBe(false);
    expect(perf.showHvacDucts).toBe(false);
    expect(perf.showTireStacks).toBe(false);
    expect(perf.showMezzanineDetails).toBe(false);
    expect(perf.showDrainGrates).toBe(false);

    const balanced = getVenueQualityVisibility('Balanced');
    expect(balanced.showParkedKarts).toBe(true);
    expect(balanced.showHvacDucts).toBe(true);
    expect(balanced.showTireStacks).toBe(true);
    expect(balanced.showMezzanineDetails).toBe(true);
    expect(balanced.showDrainGrates).toBe(true);
  });
});
