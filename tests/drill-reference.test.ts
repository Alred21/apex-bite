import { driveReference } from './reference-driver';
import { describe, expect, it } from 'vitest';
import { driveDrillVariant } from './drill-driver';
import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../src/simulation/session';

// Approved seam: public Session commands/snapshots and its retained input tape.
describe('Reference-backed Corner Drills', () => {
  it('reproduces the selected Reference Lap from all eleven Turns and five Corner Complex Flying Entries', () => {
    const session = createSimulationSession();
    const replay = session.getReferenceReplay();
    const targets = session.getSnapshot().drill.availableTargets;
    expect(targets).toHaveLength(16);
    for (const target of targets) {
      const start = session.selectDrillTarget(target.id);
      const startFrame = replay.frames.findIndex((frame) => frame.kart.position.x === start.kart.position.x && frame.kart.position.z === start.kart.position.z);
      expect(startFrame).toBeGreaterThanOrEqual(0);
      expect(start.kart).toEqual(replay.frames[startFrame].kart);
      let completed = start.drill.lastExecutionCard;
      const runNumber = start.drill.runNumber;
      let index = startFrame;
      do {
        completed = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[index++]).drill.lastExecutionCard;
      } while ((!completed || completed.runNumber !== runNumber) && index < replay.commands.length);
      expect(completed?.targetId).toBe(target.id);
      expect(completed?.isClean).toBe(true);
      expect(completed!.benchmarkTimeSeconds).toBeCloseTo((index - startFrame) * FIXED_TIMESTEP_SECONDS, 8);
      expect(completed!.segmentTimeSeconds).toBeCloseTo(completed!.benchmarkTimeSeconds, 8);
      expect(completed!.exitSpeedKph).toBeCloseTo(replay.frames[index].kart.speedKph, 8);
      expect(completed!.targetExitSpeedKph).toBeCloseTo(completed!.exitSpeedKph, 8);
      const firstTurn = start.circuit.turns[target.turns[0] - 1];
      const lastTurn = start.circuit.turns[target.turns[target.turns.length - 1] - 1];
      const entry = replay.frames.find((frame) => frame.kart.lapDistanceMeters >= firstTurn.entryDistanceMeters)!;
      const minimum = Math.min(...replay.frames.filter((frame) => frame.kart.lapDistanceMeters >= firstTurn.entryDistanceMeters && frame.kart.lapDistanceMeters <= lastTurn.exitDistanceMeters).map((frame) => frame.kart.speedKph));
      expect(completed!.entrySpeedKph).toBeCloseTo(entry.kart.speedKph, 8);
      expect(completed!.targetEntrySpeedKph).toBeCloseTo(completed!.entrySpeedKph, 8);
      expect(completed!.minApexSpeedKph).toBeCloseTo(minimum, 8);
      expect(completed!.targetMinApexSpeedKph).toBeCloseTo(completed!.minApexSpeedKph, 8);
      const reset = session.reset();
      expect(reset.kart).toEqual(start.kart);
    }
  });

  it('reports each Corner Complex Turn against the detailed Kart inside-front-tire target', () => {
    const session = createSimulationSession();
    const replay = session.getReferenceReplay();
    const start = session.selectDrillTarget('T1-T3');
    const first = replay.frames.findIndex((frame) => frame.kart.position.x === start.kart.position.x && frame.kart.position.z === start.kart.position.z);
    let card = start.drill.lastExecutionCard;
    for (let index = first; !card && index < replay.commands.length; index++) {
      card = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[index]).drill.lastExecutionCard;
    }
    expect(card!.turnApexProximities.map((turn) => turn.turnNumber)).toEqual([1, 2, 3]);
    for (const proximity of card!.turnApexProximities) {
      const turn = start.circuit.turns[proximity.turnNumber - 1];
      const frame = replay.frames.reduce((best, frame) => Math.abs(frame.kart.lapDistanceMeters - turn.apexDistanceMeters) < Math.abs(best.kart.lapDistanceMeters - turn.apexDistanceMeters) ? frame : best);
      const side = turn.direction === 'Right' ? 1 : -1;
      // Independent physical dimensions: model front axle +0.54m, half track 0.285m.
      expect(proximity.referenceTarget.x).toBeCloseTo(frame.kart.position.x + Math.cos(frame.kart.headingRad) * 0.54 - Math.sin(frame.kart.headingRad) * side * 0.285, 8);
      expect(proximity.referenceTarget.z).toBeCloseTo(frame.kart.position.z + Math.sin(frame.kart.headingRad) * 0.54 + Math.cos(frame.kart.headingRad) * side * 0.285, 8);
      expect(proximity.distanceCm).toBeLessThan(0.001);
    }
  });


  it('reports a slow clean pass as measured speed/time loss without inventing a braking cause', () => {
    const session = createSimulationSession();
    session.selectDrillTarget('T1');
    let card = session.getSnapshot().drill.lastExecutionCard;
    for (let tick = 0; !card && tick < 4000; tick++) card = driveReference(session, 1, 0.55).drill.lastExecutionCard;
    expect(card).not.toBeNull();
    expect(card!.isClean).toBe(true);
    expect(card!.deltaToBenchmarkSeconds).toBeGreaterThan(0.5);
    expect(card!.coachingCategory).toBe('Below Reference Speed');
    expect(card!.coachingInsight).not.toMatch(/late braking|release.*brak|without Trail Braking|pushing|bogged|optimal/i);
  });


  it('keeps a significant individual Turn miss visible within a clean Corner Complex without calling it late braking', () => {
    const session = createSimulationSession();
    session.selectDrillTarget('T1-T3');
    const card = driveDrillVariant(session, 0.85, 0.9);
    expect(card.isClean).toBe(true);
    const turn2 = card.turnApexProximities.find((turn) => turn.turnNumber === 2)!;
    expect(turn2.distanceCm).toBeGreaterThan(70);
    expect(card.turnApexProximities.filter((turn) => turn.turnNumber !== 2).every((turn) => turn.distanceCm !== null && turn.distanceCm < 20)).toBe(true);
    expect(card.apexProximityCm).toBe(turn2.distanceCm);
    expect(card.coachingCategory).toBe('Missed Reference Target');
    expect(card.coachingInsight).toMatch(/T2.*cm away/);
    expect(card.coachingInsight).not.toMatch(/late braking|initiate Trail Braking|pushing|bogged|without Trail Braking/i);
  });

  it('reports sustained measured Axle Scrub above the Reference Lap in a clean pass', () => {
    const session = createSimulationSession();
    session.selectDrillTarget('T6');
    const card = driveDrillVariant(session, 0.95, 0, 0.75);
    expect(card.isClean).toBe(true);
    expect(card.peakAxleScrub).toBeGreaterThan(card.referencePeakAxleScrub + 0.1);
    expect(card.excessScrubSeconds).toBeGreaterThan(0.15);
    expect(card.deltaToBenchmarkSeconds).toBeGreaterThan(0.08);
    expect(card.coachingCategory).toBe('Excessive Axle Scrub');
    expect(card.coachingInsight).not.toMatch(/without Trail Braking|pushing|bogged|release.*brak/i);
  });

  it('does not call a slower clean pass optimal when its minimum speed and target distance look acceptable', () => {
    const session = createSimulationSession();
    session.selectDrillTarget('T1');
    const card = driveDrillVariant(session, 0.9);
    expect(card.isClean).toBe(true);
    expect(card.minApexSpeedKph).toBeGreaterThan(card.targetMinApexSpeedKph - 2.8);
    expect(card.apexProximityCm).toBeLessThan(50);
    expect(card.deltaToBenchmarkSeconds).toBeGreaterThan(0.2);
    expect(card.coachingCategory).toBe('Measured Time Loss');
  });

  it('isolates public targets and per-Turn card evidence and clears unrelated cards on target selection', () => {
    const session = createSimulationSession();
    const initial = session.selectDrillTarget('T1-T3');
    const intendedTurns = [...initial.drill.target.turns];
    initial.drill.target.turns[0] = 11;
    initial.drill.availableTargets[0].benchmarkTimeSeconds = 0;
    expect(session.getSnapshot().drill.target.turns).toEqual(intendedTurns);
    expect(session.getSnapshot().drill.availableTargets[0].benchmarkTimeSeconds).toBeGreaterThan(0);
    const card = driveDrillVariant(session, 0.9);
    const intendedTarget = { ...card.turnApexProximities[0].referenceTarget };
    card.turnApexProximities[0].referenceTarget.x += 100;
    expect(session.getSnapshot().drill.lastExecutionCard!.turnApexProximities[0].referenceTarget).toEqual(intendedTarget);
    expect(session.selectDrillTarget('T8').drill.lastExecutionCard).toBeNull();
  });


  it('aligns the Reference Ghost Kart with the selected Flying Entry and its elapsed segment time', () => {
    const session = createSimulationSession();
    let snapshot = session.selectDrillTarget('T8');
    const replay = session.getReferenceReplay();
    const first = replay.frames.findIndex((frame) => frame.kart.position.x === snapshot.kart.position.x && frame.kart.position.z === snapshot.kart.position.z);
    for (let tick = 0; tick <= 100; tick++) {
      const ghost = snapshot.ghost.trackRecordPose!;
      expect(Math.hypot(ghost.position.x - snapshot.kart.position.x, ghost.position.z - snapshot.kart.position.z)).toBeLessThan(1e-8);
      if (tick < 100) snapshot = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[first + tick]);
    }
  });


  it('retains the full-lap Personal Best Ghost Kart and aligns its selected drill segment', () => {
    const session = createSimulationSession({ referenceReplay: true });
    session.setTimeTrialLapLimit(1);
    const replay = session.getReferenceReplay();
    for (const command of replay.commands) session.step(FIXED_TIMESTEP_SECONDS, command);
    expect(session.getSnapshot().lap.personalBestSeconds).not.toBeNull();
    session.cycleGhostMode();
    let snapshot = session.selectDrillTarget('T8');
    const first = replay.frames.findIndex((frame) => frame.kart.position.x === snapshot.kart.position.x && frame.kart.position.z === snapshot.kart.position.z);
    for (let tick = 0; tick <= 100; tick++) {
      const ghost = snapshot.ghost.personalBestPose;
      expect(ghost).not.toBeNull();
      // The Personal Best is recorded at 40Hz, so interpolation has finite error.
      expect(Math.hypot(ghost!.position.x - snapshot.kart.position.x, ghost!.position.z - snapshot.kart.position.z)).toBeLessThan(0.15);
      if (tick < 100) snapshot = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[first + tick]);
    }
  });

});
