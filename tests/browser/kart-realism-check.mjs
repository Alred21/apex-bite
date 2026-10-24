// Observe the physical binnacle controls through the existing presentation canvas.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.APEX_BITE_KART_EVIDENCE ?? join(tmpdir(), 'apex-bite-kart-realism');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let result;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.APEX_BITE_KART_URL ?? 'http://127.0.0.1:5187/tests/browser/kart-presentation.html');
  await page.waitForFunction(() => window.presentationReview);
  await page.locator('#helmet').click();
  result = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const before = presentationReview.diagnostics().snapshot;
    const canvas = document.querySelector('canvas'), copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const context = copy.getContext('2d'); context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let blueControlPixels = 0;
    // The isolated display is within this broad fixed-framing region. The
    // blue physical mode button must remain distinct from its green speed readout.
    for (let y = 510; y < 635; y++) for (let x = 610; x < 830; x++) {
      const i = (y * copy.width + x) * 4;
      if (pixels[i + 2] > 70 && pixels[i + 2] > pixels[i] * 1.45 && pixels[i + 2] > pixels[i + 1] * 1.15) blueControlPixels++;
    }
    return { blueControlPixels, snapshotUnchanged: JSON.stringify(before) === JSON.stringify(presentationReview.diagnostics().snapshot) };
  });
  await page.screenshot({ path: join(output, 'helmet-controls.png') });
  assert(result.blueControlPixels > 10, 'Helmet Cam shows the distinct physical mode button beside the speed display');
  assert(result.snapshotUnchanged, 'Presentation inspection leaves public driving state unchanged');
  assert.equal(errors.length, 0);
  console.log('PASS: readable physical binnacle controls in Helmet Cam');
} finally {
  await writeFile(join(output, 'kart-realism-check.json'), JSON.stringify({ browser: browser.version(), viewport: [1440, 900], result, errors }, null, 2));
  await browser.close();
}
