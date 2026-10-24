// Change only replay steering through portable public records, then observe the
// production canvas at identical replay position/time. No scene-graph access.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.APEX_BITE_PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.APEX_BITE_GHOST_STEERING_EVIDENCE ?? join(tmpdir(), 'apex-bite-ghost-steering');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(process.env.APEX_BITE_GHOST_STEERING_URL ?? 'http://127.0.0.1:5186/tests/browser/racing-guidance.html');
  await page.waitForFunction(() => window.guidanceReview);
  for (const camera of ['Chase Cam', 'Helmet Cam']) {
    await page.evaluate(camera => {
      guidanceReview.ghostScenario('personal-best'); guidanceReview.ghostScenario('separated');
      guidanceReview.ghostMode('Personal Best'); guidanceReview.mode('Off'); guidanceReview.view(camera);
    }, camera);
    const result = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const before = guidanceReview.read().snapshot, pose = before.ghost.personalBestPose;
      const state = before.camera;
      const camera = new THREE.PerspectiveCamera(state.settings.fieldOfViewDegrees, innerWidth / innerHeight, .1, 300);
      camera.position.set(state.position.x, state.position.y, state.position.z);
      camera.lookAt(state.lookAt.x, state.lookAt.y, state.lookAt.z); camera.rotateZ(state.rollRad); camera.updateMatrixWorld();
      const project = (forward, height, right) => {
        const c = Math.cos(pose.headingRad), s = Math.sin(pose.headingRad);
        const p = new THREE.Vector3(pose.position.x + forward*c - right*s, height, pose.position.z + forward*s + right*c).project(camera);
        return { x:(p.x+1)*innerWidth/2, y:(1-p.y)*innerHeight/2 };
      };
      const region = [];
      // The wheel and gripping forearms sit above the front tires. Observe this
      // physical region rather than count all changes to a steering tire.
      for (const x of [.05,.4]) for (const y of [.4,.82]) for (const z of [-.25,.25]) region.push(project(x,y,z));
      const wheelBox={left:Math.min(...region.map(p=>p.x)),right:Math.max(...region.map(p=>p.x)),top:Math.min(...region.map(p=>p.y)),bottom:Math.max(...region.map(p=>p.y))};
      const records = JSON.parse(guidanceReview.portableRecords());
      const current = records.records.find(record => record.revision.handling === before.trainingData.revision.handling && record.revision.circuit === before.trainingData.revision.circuit);
      const capture = steer => {
        current.personalBestGhostFrames.forEach(frame => { frame.steerAngleRad = steer; });
        guidanceReview.importRecords(JSON.stringify(records));
        return { pixels: guidanceReview.capturePixels(), snapshot: guidanceReview.read().snapshot };
      };
      const left = capture(-.35), right = capture(.35);
      let changedPixels = 0, wheelPixels = 0;
      for (let y = 0; y < left.pixels.height; y++) for (let x = 0; x < left.pixels.width; x++) {
        const i=(y*left.pixels.width+x)*4;
        if (Math.max(...[0,1,2].map(c=>Math.abs(left.pixels.data[i+c]-right.pixels.data[i+c]))) <= 2) continue;
        changedPixels++;
        if(x>=wheelBox.left&&x<=wheelBox.right&&y>=wheelBox.top&&y<=wheelBox.bottom) wheelPixels++;
      }
      const spatial = pose => ({ position:pose.position, headingRad:pose.headingRad, speedKph:pose.speedKph });
      return { changedPixels, wheelPixels, wheelBox, separationMeters:Math.hypot(pose.position.x-before.kart.position.x,pose.position.z-before.kart.position.z),
        publicSteering:[left.snapshot.ghost.personalBestPose.steerAngleRad,right.snapshot.ghost.personalBestPose.steerAngleRad],
        poseUnchanged:JSON.stringify(spatial(left.snapshot.ghost.personalBestPose))===JSON.stringify(spatial(right.snapshot.ghost.personalBestPose)),
        playerUnchanged:JSON.stringify(left.snapshot.kart)===JSON.stringify(right.snapshot.kart),
        clockUnchanged:left.snapshot.lap.currentLapSeconds===right.snapshot.lap.currentLapSeconds };
    });
    results.push({camera,...result});
    await page.screenshot({path:join(output,camera==='Chase Cam'?'ghost-steering-chase.png':'ghost-steering-helmet.png')});
    assert(result.separationMeters>3.5,'Ghost must actually be visible and separated');
    assert(result.poseUnchanged&&result.playerUnchanged&&result.clockUnchanged,'Steering changes must preserve replay spatial state, player and clock');
    assert.deepEqual(result.publicSteering,[-.35,.35]);
    assert(result.wheelPixels>20,`${camera}: recorded steering must visibly move ghost wheel/hands`);
  }
  assert.equal(errors.length,0);
} finally {
  await writeFile(join(output,'ghost-steering-check.json'),JSON.stringify({browser:browser.version(),results,errors},null,2));
  await browser.close();
}
console.log(`PASS: ${results.length} both-camera ghost steering comparisons`);
