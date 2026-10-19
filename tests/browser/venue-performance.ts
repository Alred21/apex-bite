import { createHudView } from '../../src/ui/hud';
import { createCircuitRenderer } from '../../src/render/scene';
import { createKartAudio } from '../../src/audio/kart-audio';
import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../../src/simulation/session';

// QA-only playback of the documented executable Reference Lap, never player assistance.
const session = createSimulationSession({ referenceReplay: true });
const replay = session.getReferenceReplay();
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
for (const id of ['T3', 'T1-T3', 'T6-T7-T8'] as const) {
  const entry = session.selectDrillTarget(id);
  const first = replay.frames.findIndex((frame) => frame.kart.position.x === entry.kart.position.x && frame.kart.position.z === entry.kart.position.z);
  let card = entry.drill.lastExecutionCard;
  for (let i = first; i >= 0 && i < replay.commands.length && !card; i++) {
    card = session.step(FIXED_TIMESTEP_SECONDS, replay.commands[i]).drill.lastExecutionCard;
  }
  check(Boolean(card?.isClean && card.coachingCategory === 'Matched Reference' && Math.abs(card.deltaToBenchmarkSeconds) < 0.025), `${id} shares Reference Lap timing and measured coaching`);
}
session.setPracticeMode('Time Trial');
session.reset();
session.cycleGhostMode(); session.cycleGhostMode();
check(session.getSnapshot().ghost.mode === 'Both', 'Both current Ghost Karts selected');
const restored = createSimulationSession();
restored.importTrainingDataJson(session.exportTrainingDataJson());
check(restored.getSnapshot().trainingData.legacy.length === 1 && restored.getSnapshot().lap.personalBestSeconds !== null && restored.getSnapshot().drill.personalBests.T3 !== undefined, 'Current/legacy lap, Ghost and drill records round trip together');
check(portable.length > 0, 'PB portable export produced');

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const renderer = createCircuitRenderer(canvas, session.getSnapshot());
renderer.setGraphicsQuality('Balanced');
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
const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  return { frames: values.length, averageFps: 1000 * values.length / values.reduce((a, b) => a + b, 0),
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
  anchor.download = 'iteration-2-performance-2026-10-19.json'; anchor.click();
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
  renderer.render(snapshot); hud.update(snapshot);
  if (driving) {
    const sample = lapSamples[lapSamples.length - 1];
    sample.end = renderer.getDiagnostics();
    sample.maxCalls = Math.max(sample.maxCalls, sample.end.calls); sample.minCalls = Math.min(sample.minCalls, sample.end.calls);
    if (snapshot.timeTrial.status === 'Finished' && !completed) finish(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
