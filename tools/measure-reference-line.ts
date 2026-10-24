import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { createSimulationSession } from '../src/simulation/session';
import { buildReferenceLap, executeReferenceProposal, referenceApex, referenceStateAtDistance } from '../src/simulation/reference-lap';
import { pathMetric } from '../src/simulation/path-distance';
import type { Vector2D } from '../src/simulation/types';
import { envelopeClearance } from './reference-evidence-helpers';

const started = performance.now(), session = createSimulationSession();
const snapshot = session.getSnapshot(), coldSessionMs = performance.now() - started;
const circuit = snapshot.circuit, reference = session.getReferenceReplay();
const warmStart = performance.now();
for (let index = 0; index < 20; index++) createSimulationSession().getSnapshot();
const cachedSessionMeanMs = (performance.now() - warmStart) / 20;
const lookupStart = performance.now();
for (let index = 0; index < 1000; index++) buildReferenceLap(circuit);
const cachedLookupMeanMs = (performance.now() - lookupStart) / 1000;
import baselineFixture from './fixtures/iteration-3-geometry.json';
import { REFERENCE_RECIPE } from '../src/simulation/reference-recipe';
const baseline = executeReferenceProposal(circuit, baselineFixture.baseline);
if (!('frames' in baseline)) throw new Error(`Frozen baseline failed: ${baseline.reason}`);
const candidate = JSON.parse(readFileSync('docs/iteration-4-controls/control-candidate.json', 'utf8'));
if (JSON.stringify(reference.commands) !== JSON.stringify(candidate.commands)) throw new Error('Production reference differs from validated tape.');
const sampleAt = (distance: number) => circuit.samples[Math.round(distance / circuit.totalLengthMeters * circuit.samples.length) % circuit.samples.length];
const offsetAt = (distance: number, point: Vector2D) => {
  const sample = sampleAt(distance);
  return (point.x - sample.center.x) * sample.normal.x + (point.z - sample.center.z) * sample.normal.z;
};
const turns = circuit.turns.map((turn) => {
  const apex = referenceApex(circuit, reference, turn.number);
  const entry = referenceStateAtDistance(reference, turn.entryDistanceMeters), exit = referenceStateAtDistance(reference, turn.exitDistanceMeters);
  const points = reference.points.filter((point) => point.distanceMeters >= turn.entryDistanceMeters && point.distanceMeters <= turn.exitDistanceMeters);
  const offsets = points.map((point) => offsetAt(point.distanceMeters, point.position));
  return { number: turn.number, geometricApexStationMeters: turn.apexDistanceMeters, achievedApexStationMeters: apex.frame.kart.lapDistanceMeters,
    entry: { station: entry.lapDistanceMeters, position: entry.position, speedKph: entry.speedKph, offsetMeters: offsetAt(entry.lapDistanceMeters, entry.position) },
    apex: { station: apex.frame.kart.lapDistanceMeters, position: apex.target, speedKph: apex.frame.kart.speedKph, centerOffsetMeters: offsetAt(apex.frame.kart.lapDistanceMeters, apex.frame.kart.position), insideTireBarrierCenterDistanceMeters: apex.clearanceMeters },
    exit: { station: exit.lapDistanceMeters, position: exit.position, speedKph: exit.speedKph, offsetMeters: offsetAt(exit.lapDistanceMeters, exit.position) },
    achievedCenterOffsetRangeMeters: [Math.min(...offsets), Math.max(...offsets)], corridorWidthMeters: turn.typicalWidthMeters,
    feasibleProposals: reference.evidence.filter((candidate) => candidate.feasible && candidate.turnPlacement?.turnNumber === turn.number).length,
  };
});
const drills = session.getSnapshot().drill.availableTargets.map((target) => {
  let snapshot = session.selectDrillTarget(target.id);
  const initial = snapshot.kart;
  const turn = circuit.turns[target.turns[0] - 1];
  const oldInitial = baseline.frames.find(frame => frame.kart.lapDistanceMeters >= Math.max(2, turn.entryDistanceMeters - 7))!.kart;
  const flyingEntryChange = { positionMeters: Math.hypot(initial.position.x - oldInitial.position.x, initial.position.z - oldInitial.position.z), speedKph: initial.speedKph - oldInitial.speedKph, headingRad: initial.headingRad - oldInitial.headingRad };
  if (flyingEntryChange.positionMeters < .0001 && Math.abs(flyingEntryChange.speedKph) < .00036 && Math.abs(flyingEntryChange.headingRad) < .0001) throw new Error(`Expected a changed Flying Entry for ${target.id}`);
  const first = reference.frames.findIndex((frame) => frame.kart.position.x === snapshot.kart.position.x && frame.kart.position.z === snapshot.kart.position.z);
  let index = first;
  while (!snapshot.drill.lastExecutionCard && index < reference.commands.length) snapshot = session.step(1 / 120, reference.commands[index++]);
  const card = snapshot.drill.lastExecutionCard;
  if (!card || !card.isClean || Math.abs(card.deltaToBenchmarkSeconds) > 1e-6 || card.apexProximityCm !== 0) throw new Error(`Drill mismatch: ${target.id}`);
  return { target: target.id, flyingEntryChange, seconds: card.segmentTimeSeconds, referenceSeconds: card.benchmarkTimeSeconds, apexProximityCm: card.apexProximityCm, isClean: card.isClean };
});
const repeater = createSimulationSession({ referenceReplay: true });
let contacts = 0;
for (let lap = 0; lap < 12; lap++) for (const command of reference.commands) contacts = Math.max(contacts, repeater.step(1 / 120, command).kart.barrierContactCount);
const repeated = repeater.getSnapshot();
if (repeated.timeTrial.completedLaps.length !== 12 || contacts || repeated.timeTrial.completedLaps.some(lap => !lap.isClean)) throw new Error('Twelve-lap replay did not remain clean.');
const evidence = {
  comparison: { baseline: { name: baseline.name, lapSeconds: baseline.lapSeconds }, selected: { name: reference.name, lapSeconds: reference.lapSeconds }, improvementSeconds: baseline.lapSeconds - reference.lapSeconds },
  recipe: { dynamicsSignature: REFERENCE_RECIPE.signature, contentSignature: REFERENCE_RECIPE.contentSignature, driver: REFERENCE_RECIPE.driver },
  achievedPathLengthMeters: pathMetric(circuit.totalLengthMeters, reference.points.map(point => point.position)).lengthMeters,
  sampledWholeKartSurfaceClearanceMeters: envelopeClearance(circuit, reference), closure: reference.closure,
  controlTapeMatchesValidatedArtifact: true,
  turns, drills, repeatedReplay: { contacts, status: repeated.timeTrial.status, completedLaps: repeated.timeTrial.completedLaps.map(lap => ({ seconds: lap.seconds, isClean: lap.isClean })) },
  performance: { cpu: cpus()[0].model, platform: `${platform()} ${arch()}`, runtime: process.version, coldSessionMs, cachedSessionMeanMs, cachedLookupMeanMs, note: 'One fresh CLI process; 20 cached Session constructions and 1000 cached Reference Lap lookups. Browser frame timing is separate integrated acceptance. No candidate search runs during startup or driving.' },
  achievedTraversalAndOverlays: 'docs/iteration-4-controls/control-candidate.json and control-line.svg, control-hairpin.svg, control-linked.svg; byte-for-byte retained control tape matched above.',
};
writeFileSync('docs/iteration-4-adoption-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ comparison: evidence.comparison, performance: evidence.performance, completedLaps: repeated.timeTrial.completedLaps.length, drills: drills.length }, null, 2));
