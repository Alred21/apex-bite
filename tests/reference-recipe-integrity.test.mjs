import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('refuses to publish a Reference Lap when tuned settings change without validated recipe content', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'apex-reference-integrity-'));
  try {
    cpSync('src/simulation', join(isolated, 'simulation'), { recursive: true });
    const path = join(isolated, 'simulation/reference-recipe.ts');
    const text = readFileSync(path, 'utf8');
    const match = text.match(/export const REFERENCE_RECIPE: ReferenceRecipe = (.*);/);
    const recipe = JSON.parse(match[1]);
    recipe.driver.lookaheadScale = 1.1;
    writeFileSync(path, text.replace(match[1], JSON.stringify(recipe)));
    writeFileSync(join(isolated, 'check.ts'), "import { createSimulationSession } from './simulation/session';\ncreateSimulationSession();\n");
    let error = '';
    try { execFileSync(resolve('node_modules/.bin/vite-node'), [join(isolated, 'check.ts')], { cwd: isolated, timeout: 30000, stdio: 'pipe' }); }
    catch (failure) { error = String(failure.stderr); }
    expect(error).toContain('Reference recipe content or dynamics are out of date');
  } finally { rmSync(isolated, { recursive: true, force: true }); }
});
