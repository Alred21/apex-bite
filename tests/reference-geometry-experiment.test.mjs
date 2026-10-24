import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('exports a bounded geometry comparison without replacing the live Reference Lap', () => {
  const output = mkdtempSync(join(tmpdir(), 'apex-geometry-'));
  const before = readFileSync('src/simulation/reference-recipe.ts', 'utf8');
  try {
    execFileSync('node_modules/.bin/vite-node', ['tools/generate-reference.ts', '--', '--geometry-experiment', '--budget', '4', '--output', output], { timeout: 120000 });
    const report = JSON.parse(readFileSync(join(output, 'geometry-evidence.json'), 'utf8'));
    expect(report.protocol.controller).toBe('iteration-3 unchanged');
    expect(report.search.evaluated).toBeLessThanOrEqual(4);
    expect(report.search.stoppedBy).toBe('evaluation budget');
    expect(report.baseline.lapSeconds).toBeCloseTo(41.558333, 5);
    expect(report.baseline.turns).toHaveLength(11);
    expect(report.baseline.complexes).toHaveLength(5);
    expect(report.baseline.sampledClearanceMeters).toBeGreaterThan(0.2);
    expect(report.candidates.some((candidate) => candidate.name.includes('pass 1'))).toBe(true);
    expect(readFileSync('src/simulation/reference-recipe.ts', 'utf8')).toBe(before);
  } finally { rmSync(output, { recursive: true, force: true }); }
}, 120000);
