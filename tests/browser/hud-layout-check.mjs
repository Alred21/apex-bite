import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.APEX_BITE_HUD_EVIDENCE ?? join(tmpdir(), 'apex-bite-hud-evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.APEX_BITE_CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.APEX_BITE_TEST_URL ?? 'http://127.0.0.1:5198');
  await page.waitForFunction(() => parseFloat(document.querySelector('#hud-speed-kph').textContent) > 0);
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => document.querySelector('#hud-camera-label').textContent === 'Helmet Cam');
  await page.screenshot({ path: join(output, 'helmet-hud.png') });
  const bounds = await page.locator('.hud-bottom-cluster').boundingBox();
  assert(bounds.x >= 1440 * 0.7, 'Helmet telemetry must leave the centre-lower hands and wheel clear');
  for (const selector of ['#hud-throttle-bar', '#hud-brake-bar', '#hud-speed-kph', '#hud-line-guidance', '#hud-trail-pill', '#hud-scrub-bar']) {
    const visible = selector.endsWith('-bar') ? page.locator(selector).locator('..') : page.locator(selector);
    assert(await visible.isVisible(), `${selector} remains available in Helmet Cam`);
  }
  await page.keyboard.press('KeyR');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => parseFloat(document.querySelector('#hud-speed-kph').textContent) < 0.01);
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#hud-drive-direction').textContent === 'REVERSE');
  assert(await page.locator('#hud-drive-direction').isVisible(), 'REVERSE remains visible in compact telemetry');
  await page.keyboard.up('Space');
  await page.setViewportSize({ width: 1280, height: 800 });
  const shortBounds = await page.locator('.hud-bottom-cluster').boundingBox();
  assert(shortBounds.x >= 1280 * 0.7 && shortBounds.y + shortBounds.height <= 800, 'Compact telemetry fits shorter view');
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => document.querySelector('#hud-camera-label').textContent === 'Chase Cam');
  const chase = await page.locator('.hud-bottom-cluster').boundingBox();
  assert(chase.x < 1280 * 0.5 && chase.x + chase.width > 1280 * 0.5, 'Chase telemetry stays centred');
  assert.equal(errors.length, 0);
  await writeFile(join(output, 'hud-layout-result.json'), JSON.stringify({ passed: true, bounds, shortBounds, chase, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, bounds, shortBounds, chase, errors }, null, 2));
} finally { await browser.close(); }
