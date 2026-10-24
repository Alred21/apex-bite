/** Offline-only experiment reached through reference:generate -- --geometry-experiment.
 * No generated candidate is installed as the production Reference Lap here. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildK1TorontoCircuit } from '../src/simulation/circuit';
import iteration3 from './fixtures/iteration-3-geometry.json';
import { executeReferenceProposal, referenceRecipeSignature, referenceApex, referenceStateAtDistance, type ReferenceReplay, type ReferenceProposal } from '../src/simulation/reference-lap';
import { FIXED_TIMESTEP_SECONDS } from '../src/simulation/kart-parameters';
import type { Vector2D } from '../src/simulation/types';
import { referenceMetrics, referenceRobustnessViolations, repeatReferenceTape } from './reference-evidence-helpers';

const argument = (name: string, fallback: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const budget = Number(argument('--budget', '400'));
if (!Number.isInteger(budget) || budget < 1 || budget > 400) throw new Error('Geometry budget must be an integer from 1 to 400.');
const output = argument('--output', 'docs/iteration-4-geometry');
if (!output) throw new Error('An output directory is required.');
mkdirSync(output, { recursive: true });
const circuit = buildK1TorontoCircuit(), started = performance.now();
const signature = referenceRecipeSignature(circuit);
if (signature !== iteration3.signature) throw new Error('Iteration-3 experiment dynamics/driver signature changed; preserve the original protocol before comparison.');
const baselineProposal = iteration3.baseline;
const baseline = executeReferenceProposal(circuit, baselineProposal);
if (!('frames' in baseline)) throw new Error(`Baseline failed: ${baseline.reason}`);

const measure = (replay: ReferenceReplay) => referenceMetrics(circuit, replay);
const baselineMetrics = measure(baseline);
// Freeze criteria before the search. This experiment promises no material regression
// from the demonstrated baseline, with only rounding tolerance at measurement precision.
const limits = {
  minimumSampledClearanceMeters: Math.floor(baselineMetrics.sampledClearanceMeters * 100) / 100,
  maximumP95SteeringRateRadPerSecond: Math.ceil(baselineMetrics.steering.p95RateRadPerSecond * 100) / 100,
  maximumSteeringRateRadPerSecond: Math.ceil(baselineMetrics.steering.maxRateRadPerSecond * 100) / 100,
  maximumSteeringVariationRad: Math.ceil(baselineMetrics.steering.totalVariationRad * 10) / 10,
};
const violations = (metrics: ReturnType<typeof measure>) => referenceRobustnessViolations(metrics, limits);
const protocol = {
  signature, revision: baseline.revision, controller: 'iteration-3 unchanged', fixedTimestepSeconds: FIXED_TIMESTEP_SECONDS,
  execution: 'Two warmup laps then one measured lap; existing swept whole-Kart contact and closure rejection. No physics or controller tuning.',
  clearance: 'Minimum rectangle-to-Barrier sample-chord distance minus 0.12 m half-thickness, at every retained 120 Hz frame. Sampled clearance is not continuous swept-contact validation; the player solver separately checks every step against its physical wall chords.',
  steering: 'Absolute finite-difference front-wheel steering rate at 120 Hz: p95 and maximum; total absolute angle variation over the measured lap penalizes repeated corrections.',
  thresholdRationale: 'Preserve the demonstrated iteration-3 clearance and steering behavior, allowing only 1 cm clearance rounding, 0.01 rad/s rate rounding, and 0.1 rad total-variation rounding. These conservative baseline-relative limits are fixed before main search, not relaxed to admit faster results.',
  limits, budget, fixedBaselineAndSeedExecutions: 3, starts: ['iteration-3', 'iteration-3 unsmoothed', 'centreline'], passesPerStart: 3,
  amplitudeMetersByPass: [0.3, 0.2, 0.1], changesPerTurn: 'Positive/negative smooth lateral bumps at shared setup and Apex stations.',
  stopRule: 'At most 400 trial proposals plus three fixed baseline/seed executions; at most three passes per start; stop a start after a complete pass with no accepted improvement. Earlier Turns are revisited each pass.',
};
writeFileSync(join(output, 'geometry-protocol.json'), JSON.stringify({ protocol, baseline: baselineMetrics }, null, 2) + '\n');
console.log(`Geometry protocol fixed: baseline ${baseline.lapSeconds.toFixed(6)} s; budget ${budget}.`);

function perturb(source: Vector2D[], center: number, radius: number, amplitude: number): Vector2D[] {
  return source.map((point, index) => {
    const sample = circuit.samples[index], length = circuit.totalLengthMeters;
    const relative = ((sample.distanceMeters - center + length * 1.5) % length) - length * 0.5;
    if (Math.abs(relative) >= radius) return { ...point };
    const delta = amplitude * (1 + Math.cos(Math.PI * relative / radius)) * 0.5;
    return { x: point.x + sample.normal.x * delta, z: point.z + sample.normal.z * delta };
  });
}
const seeds = [baselineProposal,
  iteration3.unsmoothed,
  { name: 'Circuit Centreline', positions: circuit.samples.map(sample => sample.center) }];
const candidates: object[] = [];
const seedEvidence: object[] = [];
const seedTraversals: { proposal: ReferenceProposal; replay: ReferenceReplay; metrics: ReturnType<typeof measure> }[] = [];
const retained: { proposal: ReferenceProposal; replay: ReferenceReplay; metrics: ReturnType<typeof measure> }[] = [];
let evaluated = 0, best = { proposal: baselineProposal, replay: baseline, metrics: baselineMetrics };
const passes: object[] = [];
for (const [seedIndex, seed] of seeds.entries()) {
  if (evaluated >= budget) break;
  const seedReplay = seedIndex === 0 ? baseline : executeReferenceProposal(circuit, seed);
  let current = { proposal: seed, replay: baseline, metrics: baselineMetrics }, admissible = false;
  if ('frames' in seedReplay) {
    const metrics = seedIndex === 0 ? baselineMetrics : measure(seedReplay);
    current = { proposal: seed, replay: seedReplay, metrics };
    admissible = violations(metrics).length === 0;
    seedEvidence.push({ ...metrics, feasible: true, rejectedBy: violations(metrics) });
    seedTraversals.push(current);
  } else seedEvidence.push({ name: seed.name, feasible: false, reason: seedReplay.reason });
  // A rejected seed may still yield admissible neighbors; only qualifying executed
  // candidates become a coordinate-search incumbent, never a merely fast rejection.
  for (let pass = 0; pass < 3 && evaluated < budget; pass++) {
    let improvements = 0;
    for (const turn of circuit.turns) {
      if (evaluated >= budget) break;
      const previous = circuit.turns[(turn.number + circuit.turns.length - 2) % circuit.turns.length];
      const gap = (turn.apexDistanceMeters - previous.apexDistanceMeters + circuit.totalLengthMeters) % circuit.totalLengthMeters;
      for (const [location, center, radius] of [
        ['setup', turn.apexDistanceMeters - gap * 0.5, Math.min(12, gap * 0.55)],
        ['apex', turn.apexDistanceMeters, Math.min(12, (turn.exitDistanceMeters - turn.entryDistanceMeters) * 0.65)],
      ] as const) {
        const basis = current;
        for (const sign of [-1, 1]) {
          if (evaluated >= budget) break;
          const amplitude = [0.3, 0.2, 0.1][pass] * sign;
          const proposal = { name: `start ${seedIndex + 1} pass ${pass + 1} T${turn.number} ${location} ${amplitude}m`, positions: perturb(basis.proposal.positions, center, radius, amplitude) };
          const replay = executeReferenceProposal(circuit, proposal); evaluated++;
          if (!('frames' in replay)) { candidates.push({ name: proposal.name, basis: basis.proposal.name, feasible: false, reason: replay.reason }); continue; }
          const metrics = measure(replay), rejectedBy = violations(metrics);
          const accepted = rejectedBy.length === 0 && (!admissible || replay.lapSeconds < current.replay.lapSeconds - FIXED_TIMESTEP_SECONDS * 0.5);
          candidates.push({ ...metrics, basis: basis.proposal.name, feasible: true, rejectedBy, accepted });
          if (accepted) { current = { proposal, replay, metrics }; admissible = true; improvements++; }
          if (rejectedBy.length === 0 && replay.lapSeconds < best.replay.lapSeconds - FIXED_TIMESTEP_SECONDS * 0.5) best = { proposal, replay, metrics };
        }
      }
    }
    passes.push({ start: seed.name, pass: pass + 1, improvements, incumbent: current.proposal.name, lapSeconds: current.replay.lapSeconds, admissible });
    console.log(`Geometry start ${seedIndex + 1}, pass ${pass + 1}: ${evaluated} evaluated, ${improvements} accepted; best ${best.replay.lapSeconds.toFixed(6)} s.`);
    if (improvements === 0) break;
  }
  if (admissible && !retained.some(item => item.proposal.name === current.proposal.name)) retained.push(current);
}
function details(replay: ReferenceReplay) {
  return circuit.turns.map(turn => {
    const apex = referenceApex(circuit, replay, turn.number), entry = referenceStateAtDistance(replay, turn.entryDistanceMeters), exit = referenceStateAtDistance(replay, turn.exitDistanceMeters);
    const pose = (kart: typeof entry) => ({ stationMeters: kart.lapDistanceMeters, position: kart.position, speedKph: kart.speedKph });
    return { number: turn.number, geometricApexStationMeters: turn.apexDistanceMeters, entry: pose(entry), apex: { ...pose(apex.frame.kart), insideTireTarget: apex.target }, exit: pose(exit) };
  });
}
const finalists = [...seedTraversals, ...retained.filter(item => !seedTraversals.some(seed => seed.proposal.name === item.proposal.name))];
if (!finalists.some(item => item.proposal.name === best.proposal.name)) finalists.push(best);
const artifacts = finalists.map(item => ({ proposal: item.proposal, metrics: { ...item.metrics, turns: details(item.replay) }, initialState: item.replay.initialState, commands: item.replay.commands, rejectedBy: violations(item.metrics), repeatedReplay: repeatReferenceTape(circuit, item.replay) }));
const bestArtifact = artifacts.find(item => item.proposal.name === best.proposal.name)!;
const report = { protocol, seeds: seedEvidence, baseline: artifacts[0].metrics, search: { evaluated, budget, stoppedBy: evaluated >= budget ? 'evaluation budget' : 'pass limits or no accepted improvement', passes },
  selected: { name: best.proposal.name, lapSeconds: best.replay.lapSeconds, improvementSeconds: baseline.lapSeconds - best.replay.lapSeconds, repeatedReplay: bestArtifact.repeatedReplay,
    qualifiesForAdoption: best.replay.lapSeconds < baseline.lapSeconds - FIXED_TIMESTEP_SECONDS * 0.5 && bestArtifact.repeatedReplay.clean }, candidates,
  retained: artifacts.map(({ proposal, metrics, rejectedBy, repeatedReplay }) => ({ name: proposal.name, metrics, rejectedBy, repeatedReplay })),
  productionReferenceChanged: false, elapsedSeconds: (performance.now() - started) / 1000 };
writeFileSync(join(output, 'geometry-evidence.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(output, 'geometry-candidates.json'), JSON.stringify({ protocol, candidates: artifacts }) + '\n');
writeFileSync(join(output, 'geometry-candidates.sha256'), createHash('sha256').update(JSON.stringify({ protocol, candidates: artifacts }) + '\n').digest('hex') + '\n');
console.log(JSON.stringify({ selected: report.selected, evaluated, seconds: report.elapsedSeconds }, null, 2));
