import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.APEX_BITE_INTEGRATION_EVIDENCE ?? join(tmpdir(), 'apex-bite-integration-evidence');
const base = process.env.APEX_BITE_TEST_URL ?? 'http://127.0.0.1:5196';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.APEX_BITE_CHROMIUM_EXECUTABLE ? undefined : 'chrome', executablePath: process.env.APEX_BITE_CHROMIUM_EXECUTABLE, headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 936 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${base}/tests/browser/recovery.html`);
  await page.waitForFunction(() => window.recoveryHarness);
  await page.bringToFront();
  await page.locator('#hud-btn-audio').click();
  const initial = await page.evaluate(() => {
    const { snapshot } = window.recoveryHarness.read();
    return { pb: snapshot.lap.personalBestSeconds, reference: snapshot.racingLine.benchmarkLapSeconds, mode: snapshot.ghost.mode };
  });
  assert(initial.pb > initial.reference && initial.mode === 'Both', 'Real slower PB gives independent Ghost clocks');
  const sample = async (camera, frames) => page.evaluate(async ({ camera, frames }) => {
    const h = window.recoveryHarness;
    h.view(camera);
    const intervals = []; let last = performance.now(), accumulated = 0;
    const advance = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now; accumulated += dt;
      const ticks = Math.floor(accumulated * 120 + 1e-9); accumulated -= ticks / 120;
      h.drive(ticks, 0.9);
    };
    const warm = performance.now();
    while (performance.now() - warm < 4000) advance(await new Promise(resolve => requestAnimationFrame(resolve)));
    const publicPose = () => {
      const { snapshot } = h.read(), { kart, ghost } = snapshot;
      const distance = pose => pose ? Math.hypot(pose.position.x - kart.position.x, pose.position.z - kart.position.z) : null;
      return { mode: ghost.mode, referenceDistanceMeters: distance(ghost.trackRecordPose), personalBestDistanceMeters: distance(ghost.personalBestPose), speedKph: kart.speedKph, contacts: kart.barrierContactCount };
    };
    const renderModes = () => {
      const calls = {};
      for (const mode of ['Off', 'Reference Lap', 'Personal Best', 'Both']) { h.ghost(mode); calls[mode] = h.diagnostics().calls; }
      return calls;
    };
    const startPose = publicPose(), startCalls = renderModes(), start = h.diagnostics();
    let maximumCalls = 0, minimumCalls = Infinity, maxAudioRms = 0;
    last = performance.now();
    for (let index = 0; index < frames; index++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve));
      intervals.push(now - last); advance(now);
      const diagnostics = h.diagnostics();
      maximumCalls = Math.max(maximumCalls, diagnostics.calls); minimumCalls = Math.min(minimumCalls, diagnostics.calls);
      maxAudioRms = Math.max(maxAudioRms, diagnostics.audio.outputLevel);
    }
    const end = h.diagnostics(), endPose = publicPose(), endCalls = renderModes();
    const sorted = [...intervals].sort((a,b) => a-b), mean = intervals.reduce((a,b) => a+b, 0) / intervals.length;
    const p = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
    return { camera, frames, meanMs: mean, averageFps: 1000 / mean, medianMs: p(.5), p95Ms: p(.95), p99Ms: p(.99), maxMs: sorted.at(-1), over25ms: intervals.filter(value => value > 25).length, over50ms: intervals.filter(value => value > 50).length, start, end, startPose, endPose, startCalls, endCalls, minimumCalls, maximumCalls, maxAudioRms };
  }, { camera, frames });
  // Establish meaningful separation using only the ordinary public-input driver.
  await page.evaluate(() => { window.recoveryHarness.drive(300, 0.9); });
  const separated = [];
  for (const camera of ['Chase Cam', 'Helmet Cam']) {
    const result = await sample(camera, 600); separated.push(result);
    assert(result.startPose.referenceDistanceMeters > 0 && result.startPose.personalBestDistanceMeters > 0, `${camera} Ghosts are separated from player`);
    assert(result.startCalls['Reference Lap'] > result.startCalls.Off || result.endCalls['Reference Lap'] > result.endCalls.Off, `${camera} Reference Ghost geometry actually renders`);
    assert(result.startCalls['Personal Best'] > result.startCalls.Off || result.endCalls['Personal Best'] > result.endCalls.Off, `${camera} PB Ghost geometry actually renders`);
    assert.equal(result.endPose.contacts, 0);
    await page.screenshot({ path: join(output, camera === 'Chase Cam' ? 'integration-chase.png' : 'integration-helmet.png') });
  }
  await writeFile(join(output, 'integration-separated.json'), JSON.stringify({ capturedAt: new Date().toISOString(), browser: await browser.version(), initial, separated, errors }, null, 2));
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const fov of [50, 90, 64]) {
    await page.evaluate(fov => { window.recoveryHarness.settings({ fieldOfViewDegrees: fov }); window.recoveryHarness.drive(12, .9); }, fov);
    if (fov !== 64) await page.screenshot({ path: join(output, `integration-helmet-fov${fov}.png`) });
  }
  await page.evaluate(() => { window.recoveryHarness.reset(); window.recoveryHarness.view('Helmet Cam'); window.recoveryHarness.step(900, { brake: 1 }); });
  for (const [code, name, ticks] of [['KeyA', 'left', 120], ['KeyD', 'right', 240]]) {
    await page.keyboard.down(code); await page.evaluate(ticks => { window.recoveryHarness.step(ticks); }, ticks); await page.keyboard.up(code);
    await page.screenshot({ path: join(output, `integration-helmet-${name}.png`) });
  }
  await page.evaluate(() => { window.recoveryHarness.reset(); window.recoveryHarness.step(900, { brake: 1 }); window.recoveryHarness.step(1); });
  await page.keyboard.down('Space');
  for (let frame = 0; frame < 30; frame++) { await page.evaluate(() => { window.recoveryHarness.step(6); }); await page.waitForTimeout(50); }
  const reverse = await page.evaluate(() => window.recoveryHarness.step(0)); await page.keyboard.up('Space');
  assert.equal(reverse.kart.driveDirection, 'Reverse'); assert(reverse.kart.speedKph <= 8 + 1e-9); assert.equal(reverse.lap.timeDeltaSeconds, null);
  await page.screenshot({ path: join(output, 'integration-reverse.png') });
  const cards = [];
  for (const target of ['T3', 'T6-T7-T8']) {
    const card = await page.evaluate(target => window.recoveryHarness.drill(target).drill.lastExecutionCard, target); cards.push(card);
    assert(card.isClean && Math.abs(card.deltaToBenchmarkSeconds) < .025);
    await page.screenshot({ path: join(output, `integration-drill-${target}.png`) });
  }
  await page.locator('#hud-btn-data').click();
  const records = await page.locator('#hud-data-textarea').inputValue();
  await page.goto(base);
  await page.locator('#hud-btn-data').click();
  assert(await page.locator('#hud-data-textarea').isVisible(), 'Normal Data import field is visible');
  // Paste the portable JSON through the actual public form; avoid IME typing a large tape.
  await page.locator('#hud-data-textarea').evaluate((textarea, json) => { textarea.value = json; textarea.dispatchEvent(new Event('input', { bubbles: true })); }, records);
  await page.locator('#hud-btn-import-apply').click();
  assert((await page.locator('#hud-data-feedback').textContent()).includes('Import complete'));
  await page.locator('#hud-data-dialog button[type="submit"]').click(); await page.waitForFunction(() => document.activeElement === document.body);
  await page.keyboard.press('KeyG'); await page.keyboard.press('KeyG');
  await page.keyboard.press('KeyR'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1100); await page.keyboard.up('KeyW');
  await page.screenshot({ path: join(output, 'integration-normal-app-chase.png') });
  await page.keyboard.press('KeyC'); await page.waitForFunction(() => document.querySelector('#hud-camera-label').textContent === 'Helmet Cam');
  await page.screenshot({ path: join(output, 'integration-normal-app-helmet.png') });
  assert.equal(errors.length, 0);
  const report = { capturedAt: new Date().toISOString(), browser: await browser.version(), viewport: [1920,936], dpr: 2, scenario: 'Production scene/HUD/audio; actual slower clean PB; ordinary public .9-speed driver; 4s warmup then 600 rAF frames per view. Mode call comparisons at identical snapshots establish actual separated Ghost draw load.', initial, separated, reverse: { speedKph: reverse.kart.speedKph, direction: reverse.kart.driveDirection, delta: reverse.lap.timeDeltaSeconds }, cards, dataImport: true, fovReviewed: [50,90,64], errors };
  await writeFile(join(output, 'integration-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, cameras: separated.map(({ camera, averageFps, p95Ms, startCalls, endCalls }) => ({ camera, averageFps, p95Ms, startCalls, endCalls })), errors }, null, 2));
} finally { await browser.close(); }
