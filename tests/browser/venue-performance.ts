import { createHudView } from '../../src/ui/hud';
import { createCircuitRenderer } from '../../src/render/scene';
import { createKartAudio } from '../../src/audio/kart-audio';
import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../../src/simulation/session';

// QA-only playback of the documented executable Reference Lap, never player assistance.
const moduleStarted = performance.now();
const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const constructionStarted = performance.now();
const session = createSimulationSession({ referenceReplay: true });
const startup = {
  coldSessionWithReferenceMs: performance.now() - constructionStarted,
  functionalPreflightMs: 0,
  rendererConstructionMs: 0,
  firstRenderAndHudCpuMs: 0,
  navigationToFirstFrameMs: 0,
  moduleToFirstFrameMs: 0,
};
const replay = session.getReferenceReplay();
const preflightStarted = performance.now();
const checks: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  checks.push(message);
}
// Create a genuine current PB/Ghost through public inputs before measuring both Ghost Karts.
for (const command of replay.commands) session.step(FIXED_TIMESTEP_SECONDS, command);
check(session.getSnapshot().lap.personalBestSeconds !== null, 'Reference playback earns a Clean Lap PB');
const portable = session.exportTrainingDataJson();
session.importTrainingDataJson(JSON.stringify({ version: 1, personalBestSeconds: 31,
  bestSectorSplits: [10, 12, 9], personalBestGhostFrames: [], drillPersonalBests: { T3: 4.25 } }));
check(session.getSnapshot().trainingData.legacy.length === 1, 'Legacy import preserves current PB separately');
session.cycleGhostMode(); session.cycleGhostMode();
const drillEvidence: Array<Record<string, unknown>> = [];
for (const target of session.getSnapshot().drill.availableTargets) {
  const entry = session.selectDrillTarget(target.id);
  const first = replay.frames.findIndex((frame) => frame.kart.position.x === entry.kart.position.x && frame.kart.position.z === entry.kart.position.z);
  check(first >= 0, `${target.id} Flying Entry comes from the selected Reference Lap`);
  let snapshot = entry;
  let maxReferenceGhostErrorMeters = 0, maxPersonalBestGhostErrorMeters = 0;
  for (let i = first; i < replay.commands.length && snapshot.drill.lastExecutionCard?.runNumber !== entry.drill.runNumber; i++) {
    const referenceGhost = snapshot.ghost.trackRecordPose, personalBestGhost = snapshot.ghost.personalBestPose;
    if (!referenceGhost || !personalBestGhost) throw new Error(`${target.id} Ghost Kart missing during replay`);
    maxReferenceGhostErrorMeters = Math.max(maxReferenceGhostErrorMeters, Math.hypot(referenceGhost!.position.x - snapshot.kart.position.x, referenceGhost!.position.z - snapshot.kart.position.z));
    maxPersonalBestGhostErrorMeters = Math.max(maxPersonalBestGhostErrorMeters, Math.hypot(personalBestGhost!.position.x - snapshot.kart.position.x, personalBestGhost!.position.z - snapshot.kart.position.z));
    snapshot = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[i]);
  }
  const card = snapshot.drill.lastExecutionCard;
  check(Boolean(card?.targetId === target.id && card.runNumber === entry.drill.runNumber && card.isClean && card.coachingCategory === 'Matched Reference' && Math.abs(card.deltaToBenchmarkSeconds) < 0.025), `${target.id} shares Reference Lap timing and measured coaching`);
  check(Boolean(card?.turnApexProximities.every((apex) => apex.distanceCm !== null && apex.distanceCm < 0.001)), `${target.id} reaches every actual selected Apex target`);
  check(maxReferenceGhostErrorMeters < 1e-6 && maxPersonalBestGhostErrorMeters < 0.15, `${target.id} Reference and Personal Best Ghost timing stays aligned`);
  drillEvidence.push({ id: target.id, seconds: card!.segmentTimeSeconds, benchmarkSeconds: card!.benchmarkTimeSeconds, deltaSeconds: card!.deltaToBenchmarkSeconds, apexProximities: card!.turnApexProximities, entrySpeedKph: card!.entrySpeedKph, minimumSpeedKph: card!.minApexSpeedKph, exitSpeedKph: card!.exitSpeedKph, coaching: card!.coachingCategory, maxReferenceGhostErrorMeters, maxPersonalBestGhostErrorMeters });
}
session.setPracticeMode('Time Trial');
session.reset();
check(session.getSnapshot().ghost.mode === 'Both', 'Both current Ghost Karts selected');
const restored = createSimulationSession();
restored.importTrainingDataJson(session.exportTrainingDataJson());
check(restored.getSnapshot().trainingData.legacy.length === 1 && restored.getSnapshot().lap.personalBestSeconds !== null && restored.getSnapshot().drill.personalBests.T3 !== undefined, 'Current/legacy lap, Ghost and drill records round trip together');
check(portable.length > 0, 'PB portable export produced');
check(Object.keys(restored.getSnapshot().drill.personalBests).length === 16, 'All sixteen drill records round trip');
startup.functionalPreflightMs = performance.now() - preflightStarted;

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const rendererStarted = performance.now();
const renderer = createCircuitRenderer(canvas, session.getSnapshot());
renderer.setGraphicsQuality('Balanced');
startup.rendererConstructionMs = performance.now() - rendererStarted;
const audio = createKartAudio();
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, { getAudioState: () => audio.getState() });
const output = document.querySelector<HTMLElement>('#report')!;
const button = document.querySelector<HTMLButtonElement>('#sample')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
type Diagnostics = ReturnType<typeof renderer.getDiagnostics>;
const lapSamples: Array<{ lap: number; camera: string; intervalsMs: number[]; start: Diagnostics; end: Diagnostics; maxCalls: number; minCalls: number }> = [];
const longTasks: Array<{ startTime: number; duration: number }> = [];
try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: false }); } catch { /* Optional browser support. */ }
let started: number | null = null;
let driving = false;
let completed = false;
let commandIndex = 0;
let last = performance.now();
let accumulator = 0;
let result = '';
let maximumAudioRms = 0;
let droppedWallSeconds = 0;
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  return { frames: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length, averageFps: 1000 * values.length / values.reduce((a, b) => a + b, 0),
    medianMs: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: Math.max(...values),
    over16_7ms: values.filter((v) => v > 16.7).length, over25ms: values.filter((v) => v > 25).length,
    over50ms: values.filter((v) => v > 50).length, over100ms: values.filter((v) => v > 100).length };
}
button.addEventListener('click', () => {
  if (started !== null) return;
  session.reset();
  started = performance.now(); last = started; driving = true;
  button.disabled = true;
  void audio.toggle();
  output.textContent = 'Running 12 real-time laps (~9 minutes). Lap 1 warms the scene; lap 2 measures Chase Cam; lap 3 measures Helmet Cam; laps 4–12 return to Chase Cam for accumulation comparison. Keep this page visible.';
});
download.addEventListener('click', () => {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([result], { type: 'application/json' }));
  anchor.download = `iteration-3-performance-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});
function finish(now: number): void {
  const snapshot = session.getSnapshot();
  driving = false; completed = true;
  check(snapshot.timeTrial.status === 'Finished' && snapshot.timeTrial.completedLaps.length === 12, 'Real-time playback finishes exactly twelve laps');
  check(snapshot.timeTrial.completedLaps.every((lap) => lap.isClean), 'All twelve real-time laps are clean');
  check(snapshot.kart.barrierContactCount === 0, 'No Barrier contacts during accumulation run');
  const frozen = JSON.stringify(snapshot.timeTrial);
  for (let i = 0; i < 240; i++) session.step(FIXED_TIMESTEP_SECONDS, { throttle: 1, steer: 1 });
  check(JSON.stringify(session.getSnapshot().timeTrial) === frozen, 'Results stay frozen after further inputs');
  const records = session.exportTrainingDataJson();
  session.setCameraSettings({ fieldOfViewDegrees: 72, motionStrength: 0 });
  session.setKeyboardAssistance({ steeringSensitivity: 0.8 });
  const settings = session.getSnapshot();
  session.toggleRacingLine(); session.toggleRacingLine(); session.toggleRacingLine();
  const restarted = session.reset();
  check(restarted.timeTrial.completedLaps.length === 0 && restarted.timeTrial.lapLimit === 12 && restarted.lap.personalBestSeconds !== null, 'Restart clears results and retains PB and default twelve-lap limit');
  check(JSON.stringify(restarted.camera.settings) === JSON.stringify(settings.camera.settings) && JSON.stringify(restarted.keyboardAssistance) === JSON.stringify(settings.keyboardAssistance), 'Driving/view settings survive results restart');
  check(session.exportTrainingDataJson() === records, 'Restart and display settings preserve current and legacy portable records');
  session.setTimeTrialLapLimit(null);
  check(session.getSnapshot().timeTrial.lapLimit === null, 'Unlimited practice remains explicit after results');
  const gl = canvas.getContext('webgl2'); const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  result = JSON.stringify({ capturedAt: new Date().toISOString(), scenario: 'Production renderer/HUD/audio, exact public ReferenceReplay commands at 120 Hz; 12 uninterrupted real-time laps; Full Racing Line and Both Ghost Karts. Lap 1 warmup, lap 2 warmed Chase, lap 3 warmed Helmet, laps 4–12 Chase.',
    startup, drillEvidence, reference: session.getSnapshot().racingLine.reference, trainingRevision: snapshot.trainingData.revision,
    quality: renderer.getGraphicsQuality(), userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio,
    drawingBuffer: [canvas.width, canvas.height], effectivePixelRatio: canvas.width / innerWidth,
    gpu: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'Unavailable',
    wallSeconds: (now - started!) / 1000, droppedWallSeconds, referenceLapSeconds: replay.lapSeconds,
    allMeasuredAfterWarmup: distribution(lapSamples.slice(1).flatMap((lap) => lap.intervalsMs)),
    laps: lapSamples.map(({ intervalsMs, ...lap }) => ({ ...lap, ...distribution(intervalsMs) })),
    results: snapshot.timeTrial, barrierContacts: snapshot.kart.barrierContactCount,
    ghostsAtFinish: { mode: snapshot.ghost.mode, reference: Boolean(snapshot.ghost.trackRecordPose), personalBest: Boolean(snapshot.ghost.personalBestPose) },
    audio: { maximumRms: maximumAudioRms, finalState: audio.getState() }, longTasks: longTasks.filter((task) => task.startTime >= started!), errors, functionalChecks: checks,
  }, null, 2);
  output.textContent = result; download.disabled = false;
}
function frame(now: number): void {
  const interval = now - last; last = now;
  if (driving && document.hidden) {
    driving = false; output.textContent = 'INVALID: page became hidden. Reload and rerun.';
  }
  if (driving) {
    const before = session.getSnapshot();
    const lap = before.timeTrial.completedLaps.length + 1;
    const desiredCamera = lap === 3 ? 'Helmet Cam' : 'Chase Cam';
    if (before.camera.mode !== desiredCamera) session.toggleCamera();
    if (!lapSamples[lap - 1]) lapSamples.push({ lap, camera: desiredCamera, intervalsMs: [], start: renderer.getDiagnostics(), end: renderer.getDiagnostics(), maxCalls: 0, minCalls: Infinity });
    const sample = lapSamples[lap - 1];
    sample.intervalsMs.push(interval);
    accumulator += Math.min(interval / 1000, 0.1);
    droppedWallSeconds += Math.max(0, interval / 1000 - 0.1);
    while (accumulator >= FIXED_TIMESTEP_SECONDS && session.getSnapshot().timeTrial.status !== 'Finished') {
      session.step(FIXED_TIMESTEP_SECONDS, replay.commands[commandIndex % replay.commands.length]);
      commandIndex++; accumulator -= FIXED_TIMESTEP_SECONDS;
    }
  }
  const snapshot = session.getSnapshot();
  audio.update(snapshot, driving);
  maximumAudioRms = Math.max(maximumAudioRms, audio.getState().outputLevel);
  const renderStarted = performance.now();
  renderer.render(snapshot); hud.update(snapshot);
  if (startup.navigationToFirstFrameMs === 0) {
    startup.firstRenderAndHudCpuMs = performance.now() - renderStarted;
    startup.navigationToFirstFrameMs = performance.now();
    startup.moduleToFirstFrameMs = performance.now() - moduleStarted;
  }
  if (driving) {
    const sample = lapSamples[lapSamples.length - 1];
    sample.end = renderer.getDiagnostics();
    sample.maxCalls = Math.max(sample.maxCalls, sample.end.calls); sample.minCalls = Math.min(sample.minCalls, sample.end.calls);
    if (snapshot.timeTrial.status === 'Finished' && !completed) finish(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
