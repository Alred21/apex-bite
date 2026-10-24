import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('compares reference controls on preserved and improved geometry without replacing the live reference', () => {
  const output = mkdtempSync(join(tmpdir(), 'apex-controls-'));
  const before = readFileSync('src/simulation/reference-recipe.ts', 'utf8');
  try {
    execFileSync('node_modules/.bin/vite-node', ['tools/generate-reference.ts', '--', '--control-experiment', '--budget', '4', '--output', output], { timeout: 120000 });
    const report = JSON.parse(readFileSync(join(output, 'control-evidence.json'), 'utf8'));
    expect(report.search.evaluated).toBe(4);
    expect(report.comparisons.baseline.lapSeconds).toBeCloseTo(41.558333, 5);
    expect(report.comparisons.geometryOnly.lapSeconds).toBeCloseTo(41.316667, 5);
    expect(new Set(report.candidates.map(candidate => candidate.geometry)).size).toBe(2);
    const fasterButAbrupt = report.candidates.find(candidate => candidate.geometry === 'baseline' && candidate.settings.topSpeedFraction === 1);
    expect(fasterButAbrupt.lapSeconds).toBeLessThan(report.comparisons.baseline.lapSeconds);
    expect(fasterButAbrupt.rejectedBy).toContain('peak steering rate');
    expect(report.protocol.limits.minimumSampledClearanceMeters).toBe(0.28);
    expect(report.selected.repeatedReplay.clean).toBe(true);
    expect(readFileSync('src/simulation/reference-recipe.ts', 'utf8')).toBe(before);
  } finally { rmSync(output, { recursive: true, force: true }); }
}, 120000);
