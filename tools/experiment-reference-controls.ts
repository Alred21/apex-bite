/** Bounded offline reference-driver experiment; never installs the winner. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildK1TorontoCircuit } from '../src/simulation/circuit';
import { executeReferenceProposal, referenceRecipeSignature, referenceApex, referenceStateAtDistance, cloneKartState, DEFAULT_REFERENCE_DRIVER, type ReferenceReplay, type ReferenceProposal, type ReferenceDriverSettings } from '../src/simulation/reference-lap';
import { FIXED_TIMESTEP_SECONDS } from '../src/simulation/kart-parameters';
import { stepKartOnCircuit } from '../src/simulation/kart-world';
import type { Vector2D } from '../src/simulation/types';
import { envelopeClearance } from './reference-evidence-helpers';
import type geometryBundle from '../docs/iteration-4-geometry/geometry-candidates.json';

const argument = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const budget = Number(argument('--budget', '144'));
if (!Number.isInteger(budget) || budget < 1 || budget > 144) throw new Error('Control experiment budget must be an integer from 1 to 144.');
const source = argument('--geometry', 'docs/iteration-4-geometry');
const bytes = readFileSync(join(source, 'geometry-candidates.json'), 'utf8');
const sourceHash = createHash('sha256').update(bytes).digest('hex');
if (sourceHash !== readFileSync(join(source, 'geometry-candidates.sha256'), 'utf8').trim()) throw new Error('Geometry candidate bundle hash mismatch.');
const bundle: typeof geometryBundle = JSON.parse(bytes);
const output = argument('--output', 'docs/iteration-4-controls');
if (!output) throw new Error('An output directory is required.');
mkdirSync(output, { recursive: true });
const circuit = buildK1TorontoCircuit(), started = performance.now();
if (referenceRecipeSignature(circuit) !== bundle.protocol.signature) throw new Error('Comparison dynamics/Circuit/default-driver signature changed.');
const limits = bundle.protocol.limits;
const inputBaseline = bundle.candidates[0];
const inputGeometry = [...bundle.candidates].filter(candidate => candidate.rejectedBy.length === 0 && candidate.repeatedReplay.clean).sort((a, b) => a.metrics.lapSeconds - b.metrics.lapSeconds)[0];
const geometries = [{ id: 'baseline', source: inputBaseline }, { id: 'improved geometry', source: inputGeometry }];
const protocol = {
  sourceGeometrySha256: sourceHash, signature: bundle.protocol.signature, revision: bundle.protocol.revision,
  limits, clearance: bundle.protocol.clearance, steering: bundle.protocol.steering, thresholdRationale: bundle.protocol.thresholdRationale,
  fixedTimestepSeconds: FIXED_TIMESTEP_SECONDS, defaultDriver: DEFAULT_REFERENCE_DRIVER,
  settingsGrid: { corneringAccelerationMps2: [5.2, 5.6, 6.0, 6.4], brakingScale: [1, 0.9, 1.1], lookaheadScale: [1, 1.15, 1.3], topSpeedFraction: [0.96, 1] },
  budget, fixedBaselineExecutions: 2,
  stopRule: 'One complete fixed grid: at most 72 controller settings on each of two preserved geometries, or earlier explicit budget. No adaptive expansion.',
  playerPhysicsChanged: false, execution: 'Two warmup laps then one measured lap; existing swept whole-Kart contact and closure rejection. Player physics unchanged; only declared reference-driver settings vary.',
};
writeFileSync(join(output, 'control-protocol.json'), JSON.stringify(protocol, null, 2) + '\n');
function measure(replay: ReferenceReplay) {
  const angles = replay.frames.map(frame => frame.kart.steerAngleRad);
  const rates = angles.slice(1).map((angle, index) => Math.abs(angle - angles[index]) / FIXED_TIMESTEP_SECONDS);
  const sorted = [...rates].sort((a, b) => a - b);
  return { name: replay.name, lapSeconds: replay.lapSeconds, sampledClearanceMeters: envelopeClearance(circuit, replay),
    steering: { p95RateRadPerSecond: sorted[Math.floor(sorted.length * 0.95)], maxRateRadPerSecond: Math.max(...rates), totalVariationRad: rates.reduce((sum, rate) => sum + rate * FIXED_TIMESTEP_SECONDS, 0) },
    closure: replay.closure, complexes: replay.evidence[0].complexes };
}
function violations(metrics: ReturnType<typeof measure>) {
  return [metrics.sampledClearanceMeters < limits.minimumSampledClearanceMeters ? 'sampled clearance' : '',
    metrics.steering.p95RateRadPerSecond > limits.maximumP95SteeringRateRadPerSecond ? '95th-percentile steering rate' : '',
    metrics.steering.maxRateRadPerSecond > limits.maximumSteeringRateRadPerSecond ? 'peak steering rate' : '',
    metrics.steering.totalVariationRad > limits.maximumSteeringVariationRad ? 'steering total variation' : ''].filter(Boolean);
}
function repeat(replay: ReferenceReplay) {
  let kart = cloneKartState(replay.initialState), maximumContacts = 0;
  for (let lap = 0; lap < 12; lap++) for (const command of replay.commands) {
    kart = stepKartOnCircuit(circuit, kart, command); maximumContacts = Math.max(maximumContacts, kart.barrierContactCount);
  }
  const progressedLaps = (kart.unwrappedDistanceMeters - replay.initialState.unwrappedDistanceMeters) / circuit.totalLengthMeters;
  return { laps: 12, maximumContacts, progressedLaps, clean: maximumContacts === 0 && Math.abs(progressedLaps - 12) < 0.01 };
}
const baselineExecutions = geometries.map(geometry => {
  const proposal = { ...geometry.source.proposal, driver: { ...DEFAULT_REFERENCE_DRIVER } };
  const replay = executeReferenceProposal(circuit, proposal);
  if (!('frames' in replay)) throw new Error(`Preserved geometry cannot execute: ${replay.reason}`);
  if (Math.abs(replay.lapSeconds - geometry.source.metrics.lapSeconds) > 1e-9) throw new Error('Default controller did not reproduce frozen geometry baseline.');
  const metrics = measure(replay), repeatedReplay = repeat(replay);
  if (violations(metrics).length || !repeatedReplay.clean) throw new Error('Preserved baseline no longer satisfies its declared gates.');
  return { geometry: geometry.id, proposal, replay, metrics, repeatedReplay };
});
const bestByGeometry = [...baselineExecutions];
const candidates: object[] = [];
let evaluated = 0;
console.log(`Control grid fixed: baseline ${baselineExecutions[0].replay.lapSeconds.toFixed(6)} s; geometry ${baselineExecutions[1].replay.lapSeconds.toFixed(6)} s; budget ${budget}.`);
search: for (const corneringAccelerationMps2 of protocol.settingsGrid.corneringAccelerationMps2)
for (const brakingScale of protocol.settingsGrid.brakingScale)
for (const lookaheadScale of protocol.settingsGrid.lookaheadScale)
for (const topSpeedFraction of protocol.settingsGrid.topSpeedFraction) {
  const settings: ReferenceDriverSettings = { corneringAccelerationMps2, brakingScale, lookaheadScale, topSpeedFraction };
  for (const [index, geometry] of geometries.entries()) {
    if (evaluated >= budget) break search;
    const name = `${geometry.id}: lateral ${corneringAccelerationMps2}, brake ${brakingScale}, lookahead ${lookaheadScale}, top ${topSpeedFraction}`;
    const proposal = { name, positions: geometry.source.proposal.positions, driver: settings };
    const replay = executeReferenceProposal(circuit, proposal); evaluated++;
    if (!('frames' in replay)) { candidates.push({ name, geometry: geometry.id, settings, feasible: false, reason: replay.reason }); continue; }
    const metrics = measure(replay), rejectedBy = violations(metrics);
    let repeatedReplay: ReturnType<typeof repeat> | null = null;
    if (!rejectedBy.length && replay.lapSeconds < bestByGeometry[index].replay.lapSeconds - FIXED_TIMESTEP_SECONDS * 0.5) {
      repeatedReplay = repeat(replay);
      if (repeatedReplay.clean) bestByGeometry[index] = { geometry: geometry.id, proposal, replay, metrics, repeatedReplay };
      else rejectedBy.push('twelve-lap replay');
    }
    candidates.push({ ...metrics, geometry: geometry.id, settings, feasible: true, rejectedBy, repeatedReplay });
  }
  if (evaluated % 24 === 0) console.log(`Control trials ${evaluated}: baseline geometry best ${bestByGeometry[0].replay.lapSeconds.toFixed(6)} s; improved geometry best ${bestByGeometry[1].replay.lapSeconds.toFixed(6)} s.`);
}
const selected = [...bestByGeometry].sort((a, b) => a.replay.lapSeconds - b.replay.lapSeconds)[0];
function turns(replay: ReferenceReplay) {
  return circuit.turns.map(turn => {
    const apex = referenceApex(circuit, replay, turn.number);
    const pose = (kart: ReferenceReplay['initialState']) => ({ stationMeters: kart.lapDistanceMeters, position: kart.position, speedKph: kart.speedKph });
    return { number: turn.number, geometricApexStationMeters: turn.apexDistanceMeters,
      entry: pose(referenceStateAtDistance(replay, turn.entryDistanceMeters)), apex: { ...pose(apex.frame.kart), insideTireTarget: apex.target }, exit: pose(referenceStateAtDistance(replay, turn.exitDistanceMeters)) };
  });
}
const describe = (item: typeof selected) => ({ ...item.metrics, settings: item.proposal.driver, turns: turns(item.replay), repeatedReplay: item.repeatedReplay });
const report = { protocol, search: { evaluated, budget, stoppedBy: evaluated < 144 ? 'evaluation budget' : 'fixed grid exhausted' },
  comparisons: { baseline: describe(baselineExecutions[0]), geometryOnly: describe(baselineExecutions[1]), controllerOnly: describe(bestByGeometry[0]), combined: describe(bestByGeometry[1]) },
  selected: { ...describe(selected), geometry: selected.geometry, improvementSeconds: baselineExecutions[0].replay.lapSeconds - selected.replay.lapSeconds,
    qualifiesForAdoption: selected.replay.lapSeconds < baselineExecutions[0].replay.lapSeconds - FIXED_TIMESTEP_SECONDS * 0.5 && selected.repeatedReplay.clean },
  candidates, productionReferenceChanged: false, elapsedSeconds: (performance.now() - started) / 1000 };
writeFileSync(join(output, 'control-evidence.json'), JSON.stringify(report, null, 2) + '\n');
const adoption = { protocol, proposal: selected.proposal, metrics: report.selected, initialState: selected.replay.initialState, commands: selected.replay.commands, points: selected.replay.points, closure: selected.replay.closure };
writeFileSync(join(output, 'control-candidate.json'), JSON.stringify(adoption) + '\n');
writeFileSync(join(output, 'control-candidate.sha256'), createHash('sha256').update(JSON.stringify(adoption) + '\n').digest('hex') + '\n');

// Actual achieved trajectories, not the requested proposal. Details use the same scale
// mapping and show entry, measured inside-tire Apex, and exit for each retained Turn.
function overlay(file: string, title: string, start = 0, end = circuit.totalLengthMeters) {
  const samples = circuit.samples.filter(sample => sample.distanceMeters >= start && sample.distanceMeters <= end);
  const vertices = samples.flatMap(sample => [sample.leftBarrier, sample.rightBarrier]);
  const minX = Math.min(...vertices.map(p => p.x)) - 4, maxX = Math.max(...vertices.map(p => p.x)) + 4;
  const minZ = Math.min(...vertices.map(p => p.z)) - 4, maxZ = Math.max(...vertices.map(p => p.z)) + 4;
  const scale = Math.min(1120 / (maxX - minX), 670 / (maxZ - minZ));
  const xy = (p: Vector2D) => ({ x: 40 + (p.x - minX) * scale, y: 110 + (p.z - minZ) * scale });
  const path = (points: Vector2D[], color: string, width: number) => `<polyline fill="none" stroke="${color}" stroke-width="${width}" points="${points.map(p => { const q = xy(p); return `${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ')}"/>`;
  const trajectory = (replay: ReferenceReplay) => replay.points.filter(p => p.distanceMeters >= start && p.distanceMeters <= end).map(p => p.position);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840"><rect width="1200" height="840" fill="#101722"/><g fill="#e7eef7" font-family="sans-serif"><text x="35" y="40" font-size="24">${title}</text><text x="35" y="68" font-size="15">Orange: iteration 3 · Blue: geometry only · Teal: selected controls + geometry</text></g>`;
  svg += path(samples.map(s => s.leftBarrier), '#738293', 4) + path(samples.map(s => s.rightBarrier), '#738293', 4);
  svg += path(trajectory(baselineExecutions[0].replay), '#f3ac54', 2.5) + path(trajectory(baselineExecutions[1].replay), '#7ebeff', 2) + path(trajectory(selected.replay), '#4ce1c0', 2);
  for (const turn of report.selected.turns.filter(turn => turn.geometricApexStationMeters >= start && turn.geometricApexStationMeters <= end)) {
    for (const [label, pose, color] of [['E', turn.entry, '#7ebeff'], ['A', { position: turn.apex.insideTireTarget }, '#ffb1df'], ['X', turn.exit, '#d1b0ff']] as const) {
      const q = xy(pose.position);
      svg += `<circle cx="${q.x}" cy="${q.y}" r="3" fill="${color}"/><text x="${q.x + 5}" y="${q.y - 5}" fill="${color}" font-family="sans-serif" font-size="12">${label}${turn.number}</text>`;
    }
  }
  svg += `<text x="35" y="815" fill="#e7eef7" font-family="sans-serif" font-size="15">E: entry · A: actual inside-tire Apex · X: exit | ${report.comparisons.baseline.lapSeconds.toFixed(3)}s → ${report.selected.lapSeconds.toFixed(3)}s · unchanged physics</text></svg>`;
  writeFileSync(join(output, file), svg);
}
overlay('control-line.svg', 'Full Circuit: measured geometry and control comparison');
overlay('control-hairpin.svg', 'T3 hairpin: achieved path and actual Apex', circuit.turns[1].exitDistanceMeters, circuit.turns[3].entryDistanceMeters);
overlay('control-linked.svg', 'T6–T7–T8: achieved connected-Turn compromise', circuit.turns[5].entryDistanceMeters - 8, circuit.turns[7].exitDistanceMeters + 5);
console.log(JSON.stringify({ selected: report.selected.name, seconds: report.selected.lapSeconds, improvementSeconds: report.selected.improvementSeconds, evaluated, elapsedSeconds: report.elapsedSeconds }, null, 2));
