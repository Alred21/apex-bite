// Observe the rendered wheel's yellow centre marker, never its scene graph.
// Inputs and snapshots pass through the existing public Session browser seam.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.APEX_BITE_STEERING_EVIDENCE ?? join(tmpdir(), 'apex-bite-steering');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], samples = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(process.env.APEX_BITE_STEERING_URL ?? 'http://127.0.0.1:5184/tests/browser/racing-guidance.html');
  await page.waitForFunction(() => Boolean(window.guidanceReview));
  await page.evaluate(() => {
    guidanceReview.scenario('stopped'); guidanceReview.ghostMode('Off'); guidanceReview.mode('Off');
    guidanceReview.view('Helmet Cam');
  });
  for (const [name, steer] of [['centre', 0], ['left', -1], ['right', 1], ['return-centre', 0], ['reverse-left', -1], ['reverse-right', 1]]) {
    const sample = await page.evaluate(({ name, steer }) => {
      if (name.startsWith('reverse')) guidanceReview.scenario('reverse');
      guidanceReview.view('Helmet Cam');
      guidanceReview.ghostStep(120, { steer, brake: 1 });
      const snapshot = guidanceReview.read().snapshot;
      const pixels = guidanceReview.capturePixels();
      // This fixed-viewport crop isolates the wheel marker below the dash and
      // above the nose decal. Deliberately broad colour bounds tolerate lighting.
      let count = 0, xTotal = 0;
      for (let y = 640; y < 775; y++) for (let x = 500; x < 940; x++) {
        const i = (y * pixels.width + x) * 4;
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
        if (r > 90 && g > 90 && b < g * 0.5 && r > g * 0.7 && r < g * 1.2) { count++; xTotal += x; }
      }
      return { name, steer, markerPixels: count, markerX: count ? xTotal / count : null, kart: snapshot.kart };
    }, { name, steer });
    samples.push(sample);
    await page.screenshot({ path: join(evidence, `helmet-${name}.png`) });
    if (name === 'left' || name === 'right') {
      await page.evaluate(() => { guidanceReview.view('Chase Cam'); guidanceReview.capturePixels(); });
      await page.screenshot({ path: join(evidence, `chase-${name}.png`) });
    }
  }
  assert.equal(errors.length, 0, 'Browser must have no errors');
  assert(samples.every(s => s.markerPixels > 30), 'The visible wheel marker must be present in every sample');
  const centre = samples[0].markerX;
  assert(Math.abs(samples[3].markerX - centre) < 3, 'Releasing steering returns the visible marker to centre');
  for (const sample of samples.filter(s => s.steer !== 0)) {
    assert.equal(Math.sign(sample.kart.steerAngleRad), sample.steer, `${sample.name}: public steering matches input`);
    if (sample.name.startsWith('reverse')) assert.equal(sample.kart.driveDirection, 'Reverse');
    assert((sample.markerX - centre) * sample.steer > 40,
      `${sample.name}: wheel marker must move toward the commanded side (centre ${centre.toFixed(1)}, marker ${sample.markerX.toFixed(1)})`);
  }
  console.log(`PASS: ${samples.length} rendered steering/return/reverse samples; both-camera images saved`);
} finally {
  await writeFile(join(evidence, 'steering-direction.json'), JSON.stringify({ browser: browser.version(), errors, samples }, null, 2));
  await browser.close();
}
