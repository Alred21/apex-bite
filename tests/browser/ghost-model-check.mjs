// Public Session replay plus production canvas pixels; no mesh/rig introspection.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.APEX_BITE_GHOST_EVIDENCE ?? join(tmpdir(), 'apex-bite-ghost-model');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.APEX_BITE_GHOST_URL ?? 'http://127.0.0.1:5185/tests/browser/racing-guidance.html');
  await page.waitForFunction(() => window.guidanceReview);
  for (const camera of ['Chase Cam', 'Helmet Cam']) {
    for (const mode of ['Reference Lap', 'Personal Best']) {
      await page.evaluate(({ camera, mode }) => {
        guidanceReview.view(camera); guidanceReview.mode('Off');
        if (mode === 'Personal Best') guidanceReview.ghostScenario('personal-best');
        guidanceReview.ghostScenario('separated');
        guidanceReview.ghostMode(mode);
      }, { camera, mode });
      const result = await page.evaluate(async mode => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const before = guidanceReview.read().snapshot, records = guidanceReview.portableRecords();
        const state = before.camera, pose = mode === 'Reference Lap' ? before.ghost.trackRecordPose : before.ghost.personalBestPose;
        const camera = new THREE.PerspectiveCamera(state.settings.fieldOfViewDegrees, innerWidth / innerHeight, .1, 300);
        camera.position.set(state.position.x, state.position.y, state.position.z);
        camera.lookAt(state.lookAt.x, state.lookAt.y, state.lookAt.z); camera.rotateZ(state.rollRad); camera.updateMatrixWorld();
        const project = (forward, height, right) => {
          const c = Math.cos(pose.headingRad), s = Math.sin(pose.headingRad);
          const p = new THREE.Vector3(pose.position.x + forward * c - right * s, height, pose.position.z + forward * s + right * c).project(camera);
          return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
        };
        // A seated adult's helmet occupies this region above the seat. The old
        // box-only ghost has no pixels here; this assertion is independent of mesh layout.
        const helmet = project(-.326, 1.02, 0);
        const corners = [];
        for (const x of [-1, 1]) for (const y of [0, 1.3]) for (const z of [-.6, .6]) corners.push(project(x, y, z));
        const box = { left: Math.min(...corners.map(p => p.x)) - 4, right: Math.max(...corners.map(p => p.x)) + 4,
          top: Math.min(...corners.map(p => p.y)) - 4, bottom: Math.max(...corners.map(p => p.y)) + 4 };
        const on = guidanceReview.capturePixels(), onDiagnostics = guidanceReview.read().diagnostics;
        guidanceReview.ghostMode('Off');
        const off = guidanceReview.capturePixels(), offDiagnostics = guidanceReview.read().diagnostics;
        guidanceReview.ghostMode(mode); guidanceReview.capturePixels();
        let helmetPixels = 0, outsideGhostPixels = 0, changedPixels = 0;
        for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
          const i = (y * on.width + x) * 4;
          if (Math.max(...[0, 1, 2].map(c => Math.abs(on.data[i + c] - off.data[i + c]))) <= 2) continue;
          changedPixels++;
          if (Math.abs(x - helmet.x) <= 12 && Math.abs(y - helmet.y) <= 12) helmetPixels++;
          if (x < box.left || x > box.right || y < box.top || y > box.bottom) outsideGhostPixels++;
        }
        return { helmet, helmetPixels, outsideGhostPixels, changedPixels, onDiagnostics, offDiagnostics,
          separationMeters: Math.hypot(pose.position.x - before.kart.position.x, pose.position.z - before.kart.position.z),
          snapshotUnchanged: JSON.stringify(before) === JSON.stringify(guidanceReview.read().snapshot),
          recordsUnchanged: records === guidanceReview.portableRecords() };
      }, mode);
      results.push({ camera, mode, ...result });
      await page.screenshot({ path: join(evidence, `${camera === 'Chase Cam' ? 'chase' : 'helmet'}-${mode === 'Reference Lap' ? 'reference' : 'personal-best'}.png`) });
      assert(result.separationMeters > 3.5, 'Fixture must show a separated ghost');
      assert(result.helmet.x > 12 && result.helmet.x < 1428 && result.helmet.y > 12 && result.helmet.y < 888, 'Driver region must be on screen');
      assert(result.helmetPixels > 8, `${camera} ${mode}: visible ghost must include its seated helmeted driver`);
      assert.equal(result.outsideGhostPixels, 0, 'Ghost appearance must not tint the player or cast a physical shadow');
      assert(result.snapshotUnchanged && result.recordsUnchanged, 'Rendering must preserve replay states and training records');
    }
  }
  assert.equal(errors.length, 0, 'Browser must have no errors');
} finally {
  await writeFile(join(evidence, 'ghost-model-check.json'), JSON.stringify({ browser: await browser.version(), viewport: [1440, 900], dpr: 1, quality: 'Balanced', results, errors }, null, 2));
  await browser.close();
}
console.log(`PASS: ${results.length} both-camera current-model Ghost cases`);
