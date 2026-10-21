import { writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { createSimulationSession } from '../src/simulation/session';
import { buildReferenceLap, executeReferenceProposal, referenceApex, referenceStateAtDistance, type ReferenceReplay } from '../src/simulation/reference-lap';
import { pathMetric } from '../src/simulation/path-distance';
import type { Vector2D } from '../src/simulation/types';
import { evidenceProposal, envelopeClearance } from './reference-evidence-helpers';

const started = performance.now(), session = createSimulationSession();
const snapshot = session.getSnapshot(), coldSessionMs = performance.now() - started;
const circuit = snapshot.circuit, reference = session.getReferenceReplay();
const warmStart = performance.now();
for (let index = 0; index < 20; index++) createSimulationSession().getSnapshot();
const cachedSessionMeanMs = (performance.now() - warmStart) / 20;
const lookupStart = performance.now();
for (let index = 0; index < 1000; index++) buildReferenceLap(circuit);
const cachedLookupMeanMs = (performance.now() - lookupStart) / 1000;
const baselineName = reference.evidence.find((candidate) => candidate.turnPlacement && !candidate.turnPlacement.family)!.basisCandidate!;
const execute = (name: string) => {
  const result = executeReferenceProposal(circuit, { name, positions: evidenceProposal(circuit, reference.evidence, name) });
  if (!('frames' in result)) throw new Error(`${name}: ${result.reason}`);
  return result;
};
const centreline = execute('Conservative centerline'), baseline = execute(baselineName);
const chosen = reference.evidence.find((candidate) => candidate.name === reference.name)!;
const unsmoothed = execute(chosen.basisCandidate!);
const describe = (replay: ReferenceReplay) => ({ name: replay.name, lapSeconds: replay.lapSeconds,
  pathLengthMeters: pathMetric(circuit.totalLengthMeters, replay.points.map((point) => point.position)).lengthMeters,
  complexes: replay.evidence.find((candidate) => candidate.name === replay.name)!.complexes,
  sampledWholeKartSurfaceClearanceMeters: envelopeClearance(circuit, replay), closure: replay.closure });
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
  const first = reference.frames.findIndex((frame) => frame.kart.position.x === snapshot.kart.position.x && frame.kart.position.z === snapshot.kart.position.z);
  let index = first;
  while (!snapshot.drill.lastExecutionCard && index < reference.commands.length) snapshot = session.step(1 / 120, reference.commands[index++]);
  const card = snapshot.drill.lastExecutionCard;
  if (!card || !card.isClean || Math.abs(card.deltaToBenchmarkSeconds) > 1e-6 || card.apexProximityCm !== 0) throw new Error(`Drill mismatch: ${target.id}`);
  return { target: target.id, seconds: card.segmentTimeSeconds, referenceSeconds: card.benchmarkTimeSeconds, apexProximityCm: card.apexProximityCm, isClean: card.isClean };
});
const repeater = createSimulationSession({ referenceReplay: true });
let contacts = 0;
for (let lap = 0; lap < 12; lap++) for (const command of reference.commands) contacts = Math.max(contacts, repeater.step(1 / 120, command).kart.barrierContactCount);
const repeated = repeater.getSnapshot();
if (repeated.timeTrial.completedLaps.length !== 12 || contacts) throw new Error('Twelve-lap replay did not remain clean.');
const evidence = {
  historicalIteration2LapSeconds: 45.791666666666664,
  comparisonProtocol: 'Same current 120 Hz player dynamics, physical path-distance lookahead, two warmup laps, swept whole-Kart validation. Historical iteration-2 time is separate from its re-executed final-protocol baseline.',
  comparisons: [centreline, baseline, unsmoothed, reference].map(describe),
  candidates: { count: reference.evidence.length, feasible: reference.evidence.filter((candidate) => candidate.feasible).length, rejected: reference.evidence.filter((candidate) => !candidate.feasible).map((candidate) => ({ name: candidate.name, reason: candidate.reason })) },
  turns, drills, repeatedReplay: { contacts, status: repeated.timeTrial.status, completedLaps: repeated.timeTrial.completedLaps.map((lap) => ({ seconds: lap.seconds, isClean: lap.isClean })) },
  performance: { cpu: cpus()[0].model, platform: `${platform()} ${arch()}`, runtime: process.version, coldSessionMs, cachedSessionMeanMs, cachedLookupMeanMs, note: 'CLI CPU timings; browser startup/frame timing is measured separately during integrated acceptance. Offline search measured 8.71 s before precomputation.' },
};
writeFileSync('docs/iteration-3-reference-line-evidence.json', JSON.stringify(evidence, null, 2) + '\n');

function overlay(file: string, title: string, start = 0, end = circuit.totalLengthMeters, detail = false) {
  const samples = circuit.samples.filter((sample) => sample.distanceMeters >= start && sample.distanceMeters <= end);
  const relevant = turns.filter((turn) => turn.geometricApexStationMeters >= start && turn.geometricApexStationMeters <= end);
  const vertices = samples.flatMap((sample) => [sample.leftBarrier, sample.rightBarrier]);
  const minX = Math.min(...vertices.map((point) => point.x)) - 6, maxX = Math.max(...vertices.map((point) => point.x)) + 6;
  const minZ = Math.min(...vertices.map((point) => point.z)) - 5, maxZ = Math.max(...vertices.map((point) => point.z)) + 5;
  const scale = Math.min(1100 / (maxX - minX), 660 / (maxZ - minZ));
  const dx = (1200 - (maxX - minX) * scale) * 0.5, dy = 110 + (660 - (maxZ - minZ) * scale) * 0.5;
  const xy = (point: Vector2D) => ({ x: dx + (point.x - minX) * scale, y: dy + (point.z - minZ) * scale });
  const toPoints = (points: Vector2D[]) => points.map((point) => { const p = xy(point); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  const poly = (points: Vector2D[], color: string, width: number, dash = '') => `<polyline points="${toPoints(start === 0 && end === circuit.totalLengthMeters ? [...points, points[0]] : points)}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  const trajectory = (replay: ReferenceReplay) => replay.frames.filter((frame) => frame.kart.lapDistanceMeters >= start && frame.kart.lapDistanceMeters <= end).map((frame) => frame.kart.position);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1180" viewBox="0 0 1200 1180"><rect width="1200" height="1180" fill="#101722"/><g font-family="system-ui,sans-serif" fill="#e7eef7"><text x="35" y="42" font-size="25">${title}</text><text x="35" y="70" font-size="14">Observed player dynamics. Grey: Circuit Centreline · Orange: iteration 2 re-executed · Teal: selected iteration 3</text></g>`;
  svg += poly(samples.map((sample) => sample.leftBarrier), '#7a8796', detail ? 5 : 3) + poly(samples.map((sample) => sample.rightBarrier), '#7a8796', detail ? 5 : 3);
  svg += poly(samples.map((sample) => sample.center), '#929ba6', 1.5, '4 5') + poly(trajectory(baseline), '#f3ac54', 2) + poly(trajectory(reference), '#4ce1c0', 3);
  const marker = (point: Vector2D, label: string, color: string, offX: number, offY: number) => {
    const p = xy(point);
    return `<circle cx="${p.x}" cy="${p.y}" r="${detail ? 4.5 : 3}" fill="${color}"/><text x="${p.x + offX}" y="${p.y + offY}" fill="${color}" font-family="system-ui,sans-serif" font-size="${detail ? 13 : 10}">${label}</text>`;
  };
  if (!detail) svg += marker(circuit.samples[0].center, 'Start / Finish', '#e7eef7', -100, 15);
  for (const row of relevant) {
    svg += marker(row.entry.position, `E${row.number}`, '#7ebeff', -20, -7);
    svg += marker(row.apex.position, `A${row.number}`, '#ffb1df', 6, 14);
    svg += marker(row.exit.position, `X${row.number}`, '#d1b0ff', 6, -7);
    const anchor = sampleAt(row.geometricApexStationMeters), inside = circuit.turns[row.number - 1].direction === 'Right' ? 1 : -1;
    const p = xy({ x: anchor.center.x - anchor.normal.x * inside * (detail ? 5 : 6.5), z: anchor.center.z - anchor.normal.z * inside * (detail ? 5 : 6.5) });
    if (!detail && row.number === 2) { p.x -= 85; p.y += 8; }
    if (!detail && row.number === 10) { p.x -= 65; p.y += 75; }
    svg += `<rect x="${p.x - 20}" y="${p.y - 17}" width="40" height="24" rx="5" fill="#101722" stroke="#566273"/><text x="${p.x}" y="${p.y}" text-anchor="middle" fill="#e7eef7" font-family="system-ui,sans-serif" font-size="15">T${row.number}</text>`;
  }
  if (detail) for (const turn of circuit.turns) {
    const previous = circuit.turns[(turn.number + 9) % 11];
    const station = (previous.apexDistanceMeters + turn.apexDistanceMeters) * 0.5;
    if (station < start || station > end || turn.number === 1) continue;
    const kart = referenceStateAtDistance(reference, station);
    svg += marker(kart.position, `Shared exit/setup ${station.toFixed(1)}m`, '#e7eef7', 9, 17);
  }
  svg += `<g font-family="system-ui,sans-serif" fill="#e7eef7" font-size="14"><text x="35" y="795">E: existing Turn entry gate · A: actual inside-tire clipping point · X: existing Turn exit gate</text><text x="35" y="822">Shared setup stations can precede entry gates. The actual Apex is neither a diagram pin nor the minimum-speed point.</text></g>`;
  const label = 'Turn   Entry km/h   Geometric / achieved Apex station    Clip centre offset   Exit km/h';
  svg += `<g font-family="monospace" fill="#e7eef7" font-size="13" xml:space="preserve"><text x="35" y="860" xml:space="preserve">${label}</text>`;
  relevant.forEach((row, index) => {
    const line = `T${row.number}`.padEnd(7) + row.entry.speedKph.toFixed(2).padEnd(13) + `${row.geometricApexStationMeters.toFixed(2)} / ${row.apex.station.toFixed(2)} m`.padEnd(39) + `${row.apex.centerOffsetMeters.toFixed(2)} m`.padEnd(21) + row.exit.speedKph.toFixed(2);
    svg += `<text x="35" y="${888 + index * 21}" xml:space="preserve">${line}</text>`;
  });
  svg += `</g><text x="35" y="1150" fill="#4ce1c0" font-family="system-ui,sans-serif" font-size="14">Final protocol: centreline ${centreline.lapSeconds.toFixed(3)}s · iteration 2 ${baseline.lapSeconds.toFixed(3)}s · selected ${reference.lapSeconds.toFixed(3)}s. No global-optimum claim.</text></svg>`;
  writeFileSync(file, svg);
}
overlay('docs/iteration-3-reference-line.svg', 'Full Circuit — fixed achieved Racing Line and all eleven Turns');
overlay('docs/iteration-3-reference-hairpin.svg', 'T3 hairpin — actual Apex and shared exit/setup placement', circuit.turns[1].exitDistanceMeters, circuit.turns[3].entryDistanceMeters, true);
overlay('docs/iteration-3-reference-linked.svg', 'T6–T7–T8 — connected-Turn compromises', circuit.turns[5].entryDistanceMeters - 8, circuit.turns[7].exitDistanceMeters + 5, true);
console.log(JSON.stringify({ comparisons: evidence.comparisons.map((row) => ({ name: row.name, seconds: row.lapSeconds, clearance: row.sampledWholeKartSurfaceClearanceMeters })), performance: evidence.performance, completedLaps: repeated.timeTrial.completedLaps.length, drills: drills.length }, null, 2));

overlay('docs/iteration-3-reference-late-apex.svg', 'T10 hairpin — a selected Late Apex with whole-lap validation', circuit.turns[8].exitDistanceMeters, circuit.turns[10].entryDistanceMeters, true);
