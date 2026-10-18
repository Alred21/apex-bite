import { describe, expect, it } from 'vitest';
import {
  FIXED_TIMESTEP_SECONDS,
  StorageLike,
  createSimulationSession,
} from '../src/simulation/session';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe('Ticket #7 — Corner Drill Mode: Flying Entry, Instant Reset, Corner Execution Card & Coaching Insight', () => {
  it('supports selecting any of the 11 Turns or 5 curated Corner Complexes and spawns at a Flying Entry with Instant Reset', () => {
    const session = createSimulationSession();

    const snapT10 = session.selectDrillTarget('T10');
    expect(snapT10.mode).toBe('Corner Drill');
    expect(snapT10.drill.target.id).toBe('T10');
    expect(snapT10.drill.target.kind).toBe('Turn');
    expect(snapT10.drill.availableTargets.length).toBe(16); // 11 Turns + 5 Corner Complexes

    const entryPos = { ...snapT10.kart.position };
    const entryHeading = snapT10.kart.headingRad;
    const entrySpeed = snapT10.kart.speedKph;
    expect(entrySpeed).toBeGreaterThan(25);

    // Advance 60 ticks away from Flying Entry
    for (let i = 0; i < 60; i++) {
      session.step(FIXED_TIMESTEP_SECONDS, { throttle: 1, steer: 0.3 });
    }
    expect(session.getSnapshot().kart.position.x).not.toBeCloseTo(entryPos.x, 1);

    // Instant one-key reset restores exact Flying Entry position, heading, and approach speed
    const resetSnap = session.reset();
    expect(resetSnap.kart.position.x).toBeCloseTo(entryPos.x, 5);
    expect(resetSnap.kart.position.z).toBeCloseTo(entryPos.z, 5);
    expect(resetSnap.kart.headingRad).toBeCloseTo(entryHeading, 5);
    expect(resetSnap.kart.speedKph).toBeCloseTo(entrySpeed, 5);
    expect(resetSnap.drill.currentSegmentSeconds).toBe(0);

    // Selecting a curated Corner Complex works and spawns prior to the complex entry
    const snapComplex = session.selectDrillTarget('T6-T7-T8');
    expect(snapComplex.drill.target.id).toBe('T6-T7-T8');
    expect(snapComplex.drill.target.kind).toBe('Corner Complex');
    expect(snapComplex.drill.target.turns).toEqual([6, 7, 8]);
  });

  it('produces an Optimal Pass Corner Execution Card and persists Personal Best when following the Racing Line through a drill', () => {
    const storage = createMemoryStorage();
    const session = createSimulationSession({ storage });
    session.selectDrillTarget('T3');

    let completedCard = session.getSnapshot().drill.lastExecutionCard;
    let safetyTicks = 0;

    while (!completedCard && safetyTicks < 2400) {
      const snap = session.getSnapshot();
      const pts = snap.racingLine.points;
      const samples = snap.circuit.samples;
      const n = pts.length;
      const curIdx = Math.floor(snap.kart.lapProgress * n) % n;
      const curPt = pts[curIdx];
      const lookPt = pts[(curIdx + 2) % n];
      const lookSample = samples[(curIdx + 2) % n];
      const futurePt = pts[(curIdx + 8) % n];

      const targetX = lookPt.position.x * 0.8 + lookSample.center.x * 0.2;
      const targetZ = lookPt.position.z * 0.8 + lookSample.center.z * 0.2;

      const desiredHeading = Math.atan2(
        targetZ - snap.kart.position.z,
        targetX - snap.kart.position.x,
      );
      let headingErr = desiredHeading - snap.kart.headingRad;
      while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
      while (headingErr < -Math.PI) headingErr += 2 * Math.PI;

      const steer = Math.max(-1, Math.min(1, headingErr * 3.2));
      const targetSpeed =
        Math.min(
          curPt.targetSpeedMps,
          lookPt.targetSpeedMps,
          futurePt.targetSpeedMps,
        ) * 0.92;
      const speedErr = targetSpeed - snap.kart.speedMps;
      const throttle = speedErr >= -0.15 ? 1 : 0;
      const brake =
        speedErr < -0.25 ? Math.min(0.65, Math.max(0.25, -speedErr * 0.5)) : 0;

      const after = session.step(FIXED_TIMESTEP_SECONDS, { throttle, brake, steer });
      completedCard = after.drill.lastExecutionCard;
      safetyTicks++;
    }

    expect(completedCard).not.toBeNull();
    expect(completedCard!.targetId).toBe('T3');
    expect(completedCard!.isClean).toBe(true);
    expect(completedCard!.apexProximityCm).toBeLessThan(50);
    expect(completedCard!.entrySpeedKph).toBeGreaterThan(20);
    expect(completedCard!.minApexSpeedKph).toBeGreaterThan(15);
    expect(completedCard!.exitSpeedKph).toBeGreaterThan(20);
    expect(completedCard!.personalBestSeconds).toBeCloseTo(
      completedCard!.segmentTimeSeconds,
      3,
    );
    expect(completedCard!.coachingCategory).toBe('Optimal Pass');
    expect(completedCard!.coachingInsight.length).toBeGreaterThan(15);

    // Verify drill personal best round-trips through JSON export/import
    const exported = session.exportTrainingDataJson();
    const session2 = createSimulationSession();
    const imported = session2.importTrainingDataJson(exported);
    expect(imported.drill.personalBests['T3']).toBeCloseTo(
      completedCard!.segmentTimeSeconds,
      3,
    );
  });

  it('diagnoses Late Braking Overshoot and Over-Slowed Entry in the Corner Execution Card Coaching Insight', () => {
    const session = createSimulationSession();

    // 1. Over-Slowed Entry: brake heavily in the middle of Turn 1 while still hugging the inside apex
    session.selectDrillTarget('T1');
    let cardOverSlowed = null;
    let ticks = 0;
    while (!cardOverSlowed && ticks < 2400) {
      const snap = session.getSnapshot();
      const lookaheadDist = (snap.kart.lapDistanceMeters + 3.0) % snap.circuit.totalLengthMeters;
      const n = snap.racingLine.points.length;
      const targetIdx =
        Math.round((lookaheadDist / snap.circuit.totalLengthMeters) * n) % n;
      const targetPt = snap.racingLine.points[targetIdx];

      const desiredHeading = Math.atan2(
        targetPt.position.z - snap.kart.position.z,
        targetPt.position.x - snap.kart.position.x,
      );
      let headingErr = desiredHeading - snap.kart.headingRad;
      while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
      while (headingErr < -Math.PI) headingErr += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, headingErr * 2.4));

      // Over-slow near apex to ~14 km/h
      const nearApex = Math.abs(snap.kart.lapDistanceMeters - snap.circuit.turns[0].apexDistanceMeters) < 6;
      const wantSpeedMps = nearApex ? 4.0 : targetPt.targetSpeedMps;
      const speedErr = wantSpeedMps - snap.kart.speedMps;
      const throttle = speedErr >= 0 ? 1 : 0;
      const brake = speedErr < 0 ? 0.65 : 0;

      const after = session.step(FIXED_TIMESTEP_SECONDS, { throttle, brake, steer });
      cardOverSlowed = after.drill.lastExecutionCard;
      ticks++;
    }

    expect(cardOverSlowed).not.toBeNull();
    expect(cardOverSlowed!.coachingCategory).toBe('Over-Slowed Entry');
    expect(cardOverSlowed!.coachingInsight).toMatch(/Over-Slowed Entry/i);

    // 2. Late Braking Overshoot: stay wide (1.3m outside the Racing Line) with high entry speed through Turn 4
    session.selectDrillTarget('T4');
    // Clear previous card by checking when a new T4 card arrives
    let cardLateBrake = null;
    ticks = 0;
    while ((!cardLateBrake || cardLateBrake.targetId !== 'T4') && ticks < 2400) {
      const snap = session.getSnapshot();
      const lookaheadDist = (snap.kart.lapDistanceMeters + 3.5) % snap.circuit.totalLengthMeters;
      const n = snap.circuit.samples.length;
      const sampleIdx =
        Math.round((lookaheadDist / snap.circuit.totalLengthMeters) * n) % n;
      const sample = snap.circuit.samples[sampleIdx];
      // Aim 1.1m to the LEFT (outside of Right-hand Turn 4) so we miss the apex wide without hitting the left barrier
      const wideTarget = {
        x: sample.center.x - sample.normal.x * 1.1,
        z: sample.center.z - sample.normal.z * 1.1,
      };
      const desiredHeading = Math.atan2(
        wideTarget.z - snap.kart.position.z,
        wideTarget.x - snap.kart.position.x,
      );
      let headingErr = desiredHeading - snap.kart.headingRad;
      while (headingErr > Math.PI) headingErr -= 2 * Math.PI;
      while (headingErr < -Math.PI) headingErr += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, headingErr * 2.4));

      const after = session.step(FIXED_TIMESTEP_SECONDS, { throttle: 1, brake: 0, steer });
      cardLateBrake = after.drill.lastExecutionCard;
      ticks++;
    }

    expect(cardLateBrake).not.toBeNull();
    expect(cardLateBrake!.targetId).toBe('T4');
    expect(cardLateBrake!.apexProximityCm).toBeGreaterThan(50);
    expect(cardLateBrake!.coachingCategory).toBe('Late Braking Overshoot');
    expect(cardLateBrake!.coachingInsight).toMatch(/Late Braking Overshoot/i);
  });
});
