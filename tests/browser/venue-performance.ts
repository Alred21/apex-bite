import { createHudView } from '../../src/ui/hud';
import { createCircuitRenderer } from '../../src/render/scene';
import { createSimulationSession, FIXED_TIMESTEP_SECONDS } from '../../src/simulation/session';

const session = createSimulationSession();
session.setTimeTrialLapLimit(null);
const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const root = document.querySelector<HTMLElement>('#hud-root')!;
const renderer = createCircuitRenderer(canvas, session.getSnapshot());
const hud = createHudView(root, {
  initialGraphicsQuality: renderer.getGraphicsQuality(),
  onSelectGraphicsQuality: (quality) => renderer.setGraphicsQuality(quality),
  onToggleCamera: () => { session.toggleCamera(); },
  onToggleRacingLine: () => { session.toggleRacingLine(); },
});
const output = document.querySelector<HTMLElement>('#report')!;
const button = document.querySelector<HTMLButtonElement>('#sample')!;
let samplingStarted: number | null = null;
let intervals: number[] = [];
let last = performance.now();
let accumulator = 0;
let driving = false;

button.addEventListener('click', () => {
  session.reset();
  driving = true;
  intervals = [];
  samplingStarted = performance.now();
  button.disabled = true;
  output.textContent = 'Warming up 2 seconds, then measuring 10 seconds…';
});

function driveOneStep(): void {
  const snapshot = session.getSnapshot();
  const points = snapshot.racingLine.points;
  const n = points.length;
  const index = Math.floor(snapshot.kart.lapProgress * n) % n;
  const look = points[(index + 2) % n];
  const center = snapshot.circuit.samples[(index + 2) % n].center;
  const heading = Math.atan2(look.position.z * 0.75 + center.z * 0.25 - snapshot.kart.position.z, look.position.x * 0.75 + center.x * 0.25 - snapshot.kart.position.x);
  const error = Math.atan2(Math.sin(heading - snapshot.kart.headingRad), Math.cos(heading - snapshot.kart.headingRad));
  const target = Math.min(points[index].targetSpeedMps, look.targetSpeedMps, points[(index + 8) % n].targetSpeedMps) * 0.96;
  const speedError = target - snapshot.kart.speedMps;
  session.step(FIXED_TIMESTEP_SECONDS, {
    steer: Math.max(-1, Math.min(1, error * 3.2)),
    throttle: speedError > -0.1 ? 1 : 0,
    brake: speedError < -0.25 ? Math.min(0.85, -speedError * 0.55) : 0,
  });
}
function frame(now: number): void {
  const interval = now - last;
  last = now;
  if (driving) {
    accumulator += Math.min(interval / 1000, 0.1);
    while (accumulator >= FIXED_TIMESTEP_SECONDS) {
      driveOneStep(); accumulator -= FIXED_TIMESTEP_SECONDS;
    }
  }
  const snapshot = session.getSnapshot();
  renderer.render(snapshot); hud.update(snapshot);
  if (samplingStarted !== null) {
    const elapsed = now - samplingStarted;
    if (document.hidden) {
      output.textContent = 'Sample cancelled because the page became hidden. Keep this tab visible and rerun.';
      samplingStarted = null; button.disabled = false;
    } else if (elapsed >= 2000) {
      intervals.push(interval);
      if (elapsed >= 12000) {
        const sorted = [...intervals].sort((a, b) => a - b);
        const percentile = (p: number): number => Number(sorted[Math.floor((sorted.length - 1) * p)].toFixed(2));
        const gl = canvas.getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        output.textContent = JSON.stringify({
          quality: renderer.getGraphicsQuality(), camera: snapshot.camera.mode,
          userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
          devicePixelRatio, drawingBuffer: [canvas.width, canvas.height],
          effectivePixelRatio: Number((canvas.width / innerWidth).toFixed(2)),
          gpu: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'Unavailable',
          frames: intervals.length, averageFps: Number((1000 * intervals.length / intervals.reduce((a, b) => a + b, 0)).toFixed(1)),
          medianMs: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
          frameIntervalsOver25ms: intervals.filter((value) => value > 25).length,
          barrierContacts: snapshot.kart.barrierContactCount,
          scenario: '2 s warmup + 10 s public-input driving, actual renderer and HUD, Ghost Kart and Racing Line enabled',
        }, null, 2);
        samplingStarted = null; button.disabled = false;
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
