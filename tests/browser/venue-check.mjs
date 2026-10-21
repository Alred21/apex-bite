// Run the existing production QA harness in a visible hardware-rendered browser.
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const evidence = process.env.APEX_BITE_QA_EVIDENCE ?? join(tmpdir(), 'apex-bite-production-evidence');
const url = process.env.APEX_BITE_QA_URL ?? 'http://127.0.0.1:5196/tests/browser/venue-performance.html';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: process.env.APEX_BITE_CHROMIUM_EXECUTABLE ? undefined : 'chrome', executablePath: process.env.APEX_BITE_CHROMIUM_EXECUTABLE, headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 936 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const started = performance.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.bringToFront();
  await page.waitForFunction(() => {
    const speed = document.querySelector('#hud-speed-kph');
    return speed && parseFloat(speed.textContent) > 0;
  }, null, { timeout: 120000 });
  const startup = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
      navigationToFirstObservedHudMs: performance.now(),
      viewport: [innerWidth, innerHeight], devicePixelRatio,
      gpu: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      userAgent: navigator.userAgent,
    };
  });
  startup.browser = await browser.version();
  startup.launcherNavigationToReadyMs = performance.now() - started;
  console.log('Production ready', JSON.stringify(startup));
  await writeFile(join(evidence, 'cold-navigation.json'), JSON.stringify(startup, null, 2));
  await page.locator('#sample').click();
  const deadline = performance.now() + 15 * 60 * 1000;
  let finalReport = null;
  while (performance.now() < deadline && !finalReport) {
    if (errors.length) throw new Error(errors.join('\n'));
    const status = await page.evaluate(() => ({
      report: document.querySelector('#report')?.textContent ?? '',
      lap: document.querySelector('#hud-lap-badge')?.textContent,
      camera: document.querySelector('#hud-camera-label')?.textContent,
      hidden: document.hidden,
    }));
    if (status.hidden || status.report.startsWith('INVALID')) throw new Error('Benchmark became hidden/invalid.');
    if (status.report.trim().startsWith('{')) {
      const candidate = JSON.parse(status.report);
      if (candidate.results?.status === 'Finished') finalReport = candidate;
    }
    console.log('Benchmark progress', JSON.stringify({ elapsedSeconds: Math.round((performance.now() - started) / 1000), lap: status.lap, camera: status.camera }));
    if (!finalReport) await new Promise(resolve => setTimeout(resolve, 30000));
  }
  if (!finalReport) throw new Error('Timed out before genuine twelve-lap report.');
  await writeFile(join(evidence, 'iteration-3-performance.json'), JSON.stringify({ ...finalReport, browserVersion: startup.browser, startup: { ...finalReport.startup, navigation: startup }, launcherErrors: errors }, null, 2));
  await page.screenshot({ path: join(evidence, 'results-after-measurement.png') });
  console.log('Complete', JSON.stringify({ completedLaps: finalReport.results.completedLaps.length, wallSeconds: finalReport.wallSeconds, barrierContacts: finalReport.barrierContacts, timing: finalReport.allMeasuredAfterWarmup }));
} finally {
  await browser.close();
}
