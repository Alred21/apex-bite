// Real public Session inputs and canvas output; no private fade-helper assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const evidence = process.env.APEX_BITE_GHOST_EVIDENCE ?? join(tmpdir(), 'apex-bite-ghost-evidence');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(process.env.APEX_BITE_GHOST_URL ?? 'http://127.0.0.1:5178/tests/browser/racing-guidance.html');
  await page.waitForFunction(() => Boolean(window.guidanceReview));
  for (const camera of ['Chase Cam', 'Helmet Cam']) {
    for (const scenario of ['coincident', 'partial', 'side', 'personal-best', 'both', 'separated', 'reverse']) {
      await page.evaluate(({ camera, scenario }) => {
        guidanceReview.view(camera); guidanceReview.ghostMode('Reference Lap'); guidanceReview.ghostScenario(scenario);
      }, { camera, scenario });
      const result = await page.evaluate(({ scenario }) => {
        const mode = scenario === 'personal-best' ? 'Personal Best' : scenario === 'both' ? 'Both' : 'Reference Lap';
        const before = JSON.stringify(guidanceReview.read().snapshot), records = guidanceReview.portableRecords();
        const compare = (first, second) => {
          guidanceReview.ghostMode(first); const on = guidanceReview.capturePixels();
          guidanceReview.ghostMode(second); const off = guidanceReview.capturePixels();
          let changedPixels = 0, maxDifference = 0;
          for (let i = 0; i < on.data.length; i += 4) {
            let difference = 0;
            for (let channel = 0; channel < 3; channel++) difference = Math.max(difference, Math.abs(on.data[i + channel] - off.data[i + channel]));
            if (difference > 2) changedPixels++; maxDifference = Math.max(maxDifference, difference);
          }
          return { changedPixels, maxDifference };
        };
        const difference = compare(mode, 'Off');
        const independent = scenario === 'both' ? compare('Both', 'Reference Lap') : null;
        guidanceReview.ghostMode(mode); guidanceReview.capturePixels();
        const snapshot = guidanceReview.read().snapshot;
        const distance = pose => pose ? Math.hypot(pose.position.x - snapshot.kart.position.x, pose.position.z - snapshot.kart.position.z) : null;
        return { ...difference, independent, snapshotUnchanged: before === JSON.stringify(snapshot), recordsUnchanged: records === guidanceReview.portableRecords(),
          mode, referenceDistanceMeters: distance(snapshot.ghost.trackRecordPose), personalBestDistanceMeters: distance(snapshot.ghost.personalBestPose),
          driveDirection: snapshot.kart.driveDirection, headingRad: snapshot.kart.headingRad, diagnostics: guidanceReview.read().diagnostics };
      }, { scenario });
      results.push({ camera, scenario, ...result });
      if (scenario === 'coincident' || (camera === 'Helmet Cam' && ['partial', 'separated', 'both'].includes(scenario))) {
        await page.screenshot({ path: join(evidence, `${camera === 'Chase Cam' ? 'chase' : 'helmet'}-${scenario}.png`) });
      }
      assert(result.snapshotUnchanged && result.recordsUnchanged, 'Rendering/mode cycling must preserve Session snapshots and portable records');
      if (scenario === 'both') {
        assert(result.personalBestDistanceMeters < 0.05 && result.referenceDistanceMeters > 3.5, 'Both fixture must have only PB overlapping');
        assert.equal(result.independent.changedPixels, 0, 'Overlapping PB must not tint separated Reference Lap');
        assert(result.changedPixels > 100, 'Separated Reference Lap remains visible with Both selected');
      } else if (scenario === 'separated') {
        assert(result.referenceDistanceMeters > 3.5 && result.changedPixels > 100, 'Separated ghost must remain readable');
      } else {
        const distance = scenario === 'personal-best' ? result.personalBestDistanceMeters : result.referenceDistanceMeters;
        assert(distance < 2.2, 'Fixture must actually intersect the player vicinity');
        assert.equal(result.changedPixels, 0, 'Overlapping Ghost must not tint or obstruct the player/view');
        if (scenario === 'reverse') assert.equal(result.driveDirection, 'Reverse', 'Reverse fixture must actually reverse');
      }
    }
  }
  for (const camera of ['Chase Cam', 'Helmet Cam']) {
    await page.evaluate(camera => { guidanceReview.view(camera); guidanceReview.ghostScenario('coincident'); }, camera);
    const sweep = await page.evaluate(() => {
      const frames = [];
      for (let step = 0; step < 80; step++) {
        guidanceReview.ghostStep(8);
        const snapshot = guidanceReview.read().snapshot, pose = snapshot.ghost.trackRecordPose;
        const distance = Math.hypot(pose.position.x - snapshot.kart.position.x, pose.position.z - snapshot.kart.position.z);
        const on = guidanceReview.capturePixels(); guidanceReview.ghostMode('Off'); const off = guidanceReview.capturePixels();
        let changedPixels = 0, differenceSum = 0;
        for (let i = 0; i < on.data.length; i += 4) {
          let difference = 0;
          for (let channel = 0; channel < 3; channel++) difference = Math.max(difference, Math.abs(on.data[i + channel] - off.data[i + channel]));
          if (difference > 2) changedPixels++; differenceSum += difference;
        }
        guidanceReview.ghostMode('Reference Lap');
        frames.push({ distance, changedPixels, differenceSum });
        if (distance > 4) break;
      }
      const a = guidanceReview.capturePixels(), b = guidanceReview.capturePixels();
      return { frames, identicalPausedPixels: a.data.every((value, index) => value === b.data[index]) };
    });
    results.push({ camera, scenario: 'fade through separation', ...sweep });
    assert(sweep.frames.filter(frame => frame.distance <= 2.2).every(frame => frame.changedPixels === 0));
    assert(sweep.frames.some(frame => frame.distance > 2.3 && frame.distance < 3.5 && frame.changedPixels > 0), 'Fade band must visibly restore the ghost');
    assert(sweep.frames.some(frame => frame.distance >= 3.5 && frame.changedPixels > 100), 'Separated ghost must return fully');
    assert(sweep.identicalPausedPixels, 'Paused/repeated snapshots must not flicker');
  }
  assert.equal(errors.length, 0, 'Browser must have no errors');
} finally {
  await writeFile(join(evidence, 'ghost-overlap-check.json'), JSON.stringify({ browser: await browser.version(), errors, results }, null, 2));
  await browser.close();
}
console.log(`PASS: ${results.length} both-camera Ghost presentation cases`);
