import { cloneKartState, type ReferenceReplay } from './reference-lap';
import type { CircuitData, DrillTargetDefinition, DrillTargetId, KartState, TurnNumber, CoachingInsightCategory, CornerExecutionCard } from './types';

export interface ReferenceDrill {
  target: DrillTargetDefinition;
  initialState: KartState;
  finishProgressMeters: number;
  referenceStartSeconds: number;
  referencePeakAxleScrub: number;
}

export function buildReferenceDrills(circuit: CircuitData, reference: ReferenceReplay): ReferenceDrill[] {
  const complexes: Array<{ id: DrillTargetId; label: string; turns: TurnNumber[] }> = [
    { id: 'T1-T3', label: 'Complex T1–T3 (Opening Sequence)', turns: [1, 2, 3] },
    { id: 'T2-T3', label: 'Complex T2–T3 (Sweeper into Hairpin 1)', turns: [2, 3] },
    { id: 'T4-T5', label: 'Complex T4–T5 (North Double-Right)', turns: [4, 5] },
    { id: 'T6-T7-T8', label: 'Complex T6–T7–T8 (Esses into Far-Right Sweeper)', turns: [6, 7, 8] },
    { id: 'T9-T10-T11', label: 'Complex T9–T10–T11 (Final Hairpin & Carousel)', turns: [9, 10, 11] },
  ];
  const specs = [
    ...circuit.turns.map((turn) => ({ id: `T${turn.number}` as DrillTargetId, label: turn.name, turns: [turn.number] })),
    ...complexes,
  ];
  const frameAtOrAfter = (distance: number) => reference.frames.find((frame) => frame.kart.lapDistanceMeters >= distance)!;
  return specs.map((spec) => {
    const first = circuit.turns[spec.turns[0] - 1];
    const finalTurn = circuit.turns[spec.turns[spec.turns.length - 1] - 1];
    const start = frameAtOrAfter(Math.max(2, first.entryDistanceMeters - 7));
    const entry = frameAtOrAfter(first.entryDistanceMeters);
    const finish = frameAtOrAfter(Math.min(circuit.totalLengthMeters - 2, finalTurn.exitDistanceMeters + 4));
    const turnFrames = reference.frames.filter((frame) => frame.kart.lapDistanceMeters >= first.entryDistanceMeters && frame.kart.lapDistanceMeters <= finalTurn.exitDistanceMeters);
    return {
      target: {
        id: spec.id, label: spec.label, turns: spec.turns,
        kind: spec.turns.length === 1 ? 'Turn' : 'Corner Complex',
        flyingEntryDistanceMeters: start.kart.lapDistanceMeters,
        exitDistanceMeters: finish.kart.lapDistanceMeters,
        benchmarkTimeSeconds: finish.lapSeconds - start.lapSeconds,
        targetEntrySpeedKph: entry.kart.speedKph,
        targetMinApexSpeedKph: Math.min(...turnFrames.map((frame) => frame.kart.speedKph)),
        targetExitSpeedKph: finish.kart.speedKph,
      },
      initialState: cloneKartState(start.kart), finishProgressMeters: finish.kart.unwrappedDistanceMeters, referenceStartSeconds: start.lapSeconds,
      referencePeakAxleScrub: Math.max(...turnFrames.map((frame) => frame.kart.axleScrub)),
    };
  });
}


export function evaluateDrillCoaching(evidence: {
  target: DrillTargetDefinition;
  isClean: boolean;
  seconds: number;
  minimumSpeedKph: number;
  peakScrub: number;
  referencePeakScrub: number;
  excessScrubSeconds: number;
  turnApexProximities: CornerExecutionCard['turnApexProximities'];
}): { category: CoachingInsightCategory; insight: string } {
  const { target } = evidence;
  const delta = evidence.seconds - target.benchmarkTimeSeconds;
  const tolerance = Math.max(0.08, target.benchmarkTimeSeconds * 0.01);
  const missed = evidence.turnApexProximities.filter((turn) => turn.distanceCm === null || turn.distanceCm > 50);
  const targetFacts = missed.length === 0 ? '' : ` Reference tire targets: ${missed.map((turn) => `T${turn.turnNumber} ${turn.distanceCm === null ? 'not observed' : `${turn.distanceCm.toFixed(0)} cm away`}`).join(', ')}.`;
  const timeFact = `${Math.abs(delta).toFixed(3)}s ${delta < 0 ? 'faster than' : 'slower than'} the Reference Lap segment.`;
  if (!evidence.isClean) return { category: 'Barrier Contact', insight: `Barrier contact observed; this pass is not Clean and cannot set a Personal Best. ${timeFact}${targetFacts}` };
  if (delta > tolerance && evidence.excessScrubSeconds >= 0.15) {
    return { category: 'Excessive Axle Scrub', insight: `Axle Scrub peaked at ${Math.round(evidence.peakScrub * 100)}% versus ${Math.round(evidence.referencePeakScrub * 100)}% in the Reference Lap, with ${evidence.excessScrubSeconds.toFixed(2)}s above its peak + 10 percentage points. ${timeFact}${targetFacts}` };
  }
  if (delta > tolerance && evidence.minimumSpeedKph < target.targetMinApexSpeedKph - 2.8) {
    return { category: 'Below Reference Speed', insight: `Measured minimum speed ${evidence.minimumSpeedKph.toFixed(1)} km/h versus ${target.targetMinApexSpeedKph.toFixed(1)} km/h in the Reference Lap. ${timeFact}${targetFacts}` };
  }
  if (missed.length > 0) return { category: 'Missed Reference Target', insight: `${timeFact}${targetFacts} Compare the affected Turn with the reference.` };
  if (delta > tolerance) return { category: 'Measured Time Loss', insight: `Clean pass: ${timeFact} Compare the measured entry, minimum and exit speeds with the reference.` };
  if (delta < -tolerance) return { category: 'Clean Faster Pass', insight: `Clean pass: ${timeFact} All measured tire targets were within 50 cm.` };
  return { category: 'Matched Reference', insight: `Clean pass within ${tolerance.toFixed(3)}s of the Reference Lap segment; all measured tire targets were within 50 cm.` };
}
