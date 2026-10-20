/** Reproduce the ticket-27 review artifact. Run with npm run evidence:hairpin. */
import { writeFileSync } from 'node:fs';
import { createSimulationSession } from '../src/simulation/session';
import { executeReferenceProposal, referenceApex, type ReferenceReplay } from '../src/simulation/reference-lap';
import { offsetComplex, placeTurn } from '../src/simulation/reference-proposals';
import { CORNER_COMPLEXES } from '../src/simulation/corner-complexes';
import type { Vector2D } from '../src/simulation/types';

const session = createSimulationSession({ referenceReplay: true });
const reference = session.getReferenceReplay();
const circuit = session.getSnapshot().circuit;
const turn = circuit.turns[2];
const selectedEvidence = reference.evidence.find((candidate) => candidate.name === reference.name)!;
const baselineName = reference.evidence.find((candidate) => candidate.turnPlacement?.turnNumber === 3)!.basisCandidate!;
function positionsFor(name: string): Vector2D[] {
  if (name === 'Conservative centerline') return circuit.samples.map((sample) => sample.center);
  const item = reference.evidence.find((candidate) => candidate.name === name)!;
  const positions = positionsFor(item.basisCandidate!);
  if (item.adjustment) return offsetComplex(circuit, positions, CORNER_COMPLEXES.findIndex((complex) => complex.id === item.adjustment!.complexId), item.adjustment.offsetMeters, item.adjustment.phaseMeters);
  const placement = item.turnPlacement!;
  return placeTurn(circuit, positions, placement.turnNumber, { apexShiftMeters: placement.requestedApexDistanceMeters - circuit.turns[placement.turnNumber - 1].apexDistanceMeters, entryWidthUse: placement.widthUse, apexWidthUse: placement.widthUse, exitWidthUse: placement.widthUse * 0.55 });
}
function execute(name: string): ReferenceReplay {
  const result = executeReferenceProposal(circuit, { name, positions: positionsFor(name) });
  if (!('frames' in result)) throw new Error(result.reason!);
  return result;
}
const baseline = execute(baselineName);
const lateEvidence = reference.evidence.filter((candidate) => candidate.feasible && candidate.turnPlacement?.turnNumber === 3 && candidate.turnPlacement.requestedApexDistanceMeters > turn.apexDistanceMeters + 2)
  .sort((a, b) => a.lapSeconds! - b.lapSeconds!)[0];
const late = execute(lateEvidence.name);
const pointSegmentDistance = (point: Vector2D, a: Vector2D, b: Vector2D) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
};
function envelopeClearance(replay: ReferenceReplay) {
  let minimum = Infinity;
  for (const frame of replay.frames) {
    const kart = frame.kart;
    if (kart.lapDistanceMeters < turn.entryDistanceMeters - 13 || kart.lapDistanceMeters > turn.exitDistanceMeters + 14) continue;
    const corners = [[0.88, 0.45], [0.88, -0.45], [-0.80, -0.45], [-0.80, 0.45]].map(([forward, lateral]) => ({
      x: kart.position.x + Math.cos(kart.headingRad) * forward - Math.sin(kart.headingRad) * lateral,
      z: kart.position.z + Math.sin(kart.headingRad) * forward + Math.cos(kart.headingRad) * lateral,
    }));
    for (const sample of circuit.samples) for (const side of ['leftBarrier', 'rightBarrier'] as const) {
      const a = sample[side], b = circuit.samples[(sample.index + 1) % circuit.samples.length][side];
      if (Math.hypot(a.x - kart.position.x, a.z - kart.position.z) > 4) continue;
      for (let i = 0; i < corners.length; i++) {
        const first = corners[i], next = corners[(i + 1) % corners.length];
        minimum = Math.min(minimum, pointSegmentDistance(first, a, b), pointSegmentDistance(a, first, next), pointSegmentDistance(b, first, next));
      }
    }
  }
  // Physical Barrier centre segments have 0.12m half-thickness.
  return minimum - 0.12;
}
const rows = [baseline, reference, late].map((replay) => {
  const apex = referenceApex(circuit, replay, 3);
  const complex = replay.evidence.find((candidate) => candidate.name === replay.name)!.complexes!.find((complex) => complex.id === 'T2-T3')!;
  return { name: replay.name, lapSeconds: replay.lapSeconds, complexSeconds: complex.seconds, turnSeconds: complex.turns.find((turn) => turn.number === 3)!.seconds,
    exitSpeedKph: complex.exitSpeedKph, apexStationMeters: apex.frame.kart.lapDistanceMeters, insideTireBarrierDistanceMeters: apex.clearanceMeters, sampledWholeKartSurfaceClearanceMeters: envelopeClearance(replay), closure: replay.closure };
});
// A retained tape is repeated through the public Session without resetting the Kart.
let barrierContacts = 0;
for (let lap = 0; lap < 12; lap++) for (const command of reference.commands) barrierContacts = Math.max(barrierContacts, session.step(1 / 120, command).kart.barrierContactCount);
const evidence = { selected: selectedEvidence, comparisons: rows, repeatedReplay: { barrierContacts, completedLaps: session.getSnapshot().timeTrial.completedLaps.length, status: session.getSnapshot().timeTrial.status }, candidates: reference.evidence.filter((candidate) => candidate.turnPlacement?.turnNumber === 3) };
writeFileSync('docs/iteration-3-hairpin-evidence.json', JSON.stringify(evidence, null, 2) + '\n');

const start = turn.entryDistanceMeters - 13, end = turn.exitDistanceMeters + 14;
const samples = circuit.samples.filter((sample) => sample.distanceMeters >= start && sample.distanceMeters <= end);
const all = samples.flatMap((sample) => [sample.leftBarrier, sample.rightBarrier]);
const minX = Math.min(...all.map((point) => point.x)), maxX = Math.max(...all.map((point) => point.x));
const minZ = Math.min(...all.map((point) => point.z)), maxZ = Math.max(...all.map((point) => point.z));
const scale = Math.min(940 / (maxX - minX), 590 / (maxZ - minZ));
const xy = (point: Vector2D) => ({ x: 70 + (point.x - minX) * scale, y: 125 + (point.z - minZ) * scale });
const points = (path: Vector2D[]) => path.map((point) => { const p = xy(point); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
const path = (replay: ReferenceReplay) => replay.frames.filter((frame) => frame.kart.lapDistanceMeters >= start && frame.kart.lapDistanceMeters <= end).map((frame) => frame.kart.position);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="990" viewBox="0 0 1120 990"><rect width="1120" height="990" fill="#101722"/><g fill="#e7eef7" font-family="system-ui,sans-serif"><text x="40" y="42" font-size="26">T3 hairpin — achieved placement comparison</text><text x="40" y="70" font-size="15">Same Circuit, 120 Hz player dynamics and 45 km/h limiter. +Z points down; +X points right.</text></g>`;
const poly = (ps: Vector2D[], color: string, width: number, dash = '') => `<polyline points="${points(ps)}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
svg += poly(samples.map((s) => s.leftBarrier), '#a6b1bf', 5) + poly(samples.map((s) => s.rightBarrier), '#a6b1bf', 5);
svg += poly(samples.map((s) => s.center), '#8c96a3', 2, '5 7') + poly(path(baseline), '#f3ac54', 3) + poly(path(late), '#c49aff', 3, '8 6') + poly(path(reference), '#4ce1c0', 4);
const marker = (point: Vector2D, label: string, color: string, dx: number, dy: number) => {
  const p = xy(point);
  return `<circle cx="${p.x}" cy="${p.y}" r="6" fill="${color}" stroke="#101722" stroke-width="2"/><path d="M${p.x} ${p.y} L${p.x + dx} ${p.y + dy}" stroke="${color}"/><text x="${p.x + dx + 4}" y="${p.y + dy - 7}" fill="${color}" font-family="system-ui,sans-serif" font-size="14">${label}</text>`;
};
for (const [distance, label, dx, dy] of [[turn.entryDistanceMeters - 3, 'Entry setup', -105, 28], [turn.exitDistanceMeters + 4, 'Open exit', -105, -20]] as const) {
  const frame = reference.frames.reduce((best, frame) => Math.abs(frame.kart.lapDistanceMeters - distance) < Math.abs(best.kart.lapDistanceMeters - distance) ? frame : best);
  svg += marker(frame.kart.position, `${label} ${distance.toFixed(1)} m`, '#4ce1c0', dx, dy);
}
const apex = referenceApex(circuit, reference, 3), lateApex = referenceApex(circuit, late, 3);
svg += marker(apex.target, `Selected tire Apex ${apex.frame.kart.lapDistanceMeters.toFixed(2)} m`, '#4ce1c0', -260, 30);
svg += marker(lateApex.target, `Later tire Apex ${lateApex.frame.kart.lapDistanceMeters.toFixed(2)} m`, '#c49aff', -260, -35);
const anchor = samples.reduce((best, sample) => Math.abs(sample.distanceMeters - turn.apexDistanceMeters) < Math.abs(best.distanceMeters - turn.apexDistanceMeters) ? sample : best);
svg += marker(anchor.center, `Diagram anchor ${turn.apexDistanceMeters.toFixed(2)} m`, '#e7eef7', -290, -70);
svg += `<g font-family="system-ui,sans-serif" font-size="15"><text x="40" y="765" fill="#8c96a3">Dashed gray: Circuit Centreline</text><text x="350" y="765" fill="#f3ac54">Orange: iteration 2 achieved</text><text x="650" y="765" fill="#4ce1c0">Teal: selected achieved</text><text x="650" y="791" fill="#c49aff">Purple dashed: later-Apex alternative</text><text x="40" y="820" fill="#e7eef7" font-family="monospace" xml:space="preserve">Candidate                       Lap          T2–T3        T3          T3 exit       Tire Apex station</text>`;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  svg += `<text x="40" y="${850 + i * 28}" fill="${['#f3ac54', '#4ce1c0', '#c49aff'][i]}" font-family="monospace" xml:space="preserve">${['Iteration 2 baseline', 'Selected entry/apex/exit', 'Later-Apex alternative'][i].padEnd(30)} ${row.lapSeconds.toFixed(3)} s     ${row.complexSeconds.toFixed(3)} s     ${row.turnSeconds.toFixed(3)} s    ${row.exitSpeedKph.toFixed(2)} km/h    ${row.apexStationMeters.toFixed(2)} m</text>`;
}
svg += `<text x="40" y="958" fill="#e7eef7">Later clipping improves this Turn/exit but loses whole-lap time. Selection uses the complete achieved lap.</text></g></svg>`;
writeFileSync('docs/iteration-3-hairpin.svg', svg);
console.log(JSON.stringify({ comparisons: rows, repeatedReplay: evidence.repeatedReplay }, null, 2));
