import type { SessionSnapshot } from '../simulation/types';

export interface KartAudioState {
  status: 'Off' | 'Running' | 'Muted' | 'Paused' | 'Unavailable' | 'Closed';
  volume: number;
  outputLevel: number;
}

export interface KartAudio {
  toggle(): Promise<void>;
  setVolume(volume: number): void;
  setActive(active: boolean): void;
  reset(): void;
  update(snapshot: SessionSnapshot, active: boolean): void;
  getState(): KartAudioState;
  dispose(): void;
}

const PREFERENCE_KEY = 'apex-bite:audio-settings';

/** One lazy Web Audio graph per page. Updates/reset/contacts never create nodes. */
export function createKartAudio(): KartAudio {
  let volume = 0.35;
  let muted = false;
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? 'null');
    if (stored && typeof stored.volume === 'number' && Number.isFinite(stored.volume)) {
      volume = Math.max(0, Math.min(1, stored.volume));
      muted = stored.muted === true;
    }
  } catch { /* Optional preferences must not prevent driving. */ }

  let context: AudioContext | null = null;
  let active = true;
  let unavailable = false;
  let disposed = false;
  let suspensionTimer: ReturnType<typeof setTimeout> | null = null;
  let transitionPending = false;
  let lastTick: number | null = null;
  let lastContactCount: number | null = null;
  let lastSpeed = 0;
  let previousPosition: { x: number; z: number } | null = null;
  let previousMode: string | null = null;
  let graph: ReturnType<typeof buildGraph> | null = null;

  function savePreference(): void {
    try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ volume, muted })); }
    catch { /* Keep the active setting when storage is unavailable. */ }
  }

  function buildGraph(ctx: AudioContext) {
    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 6; limiter.ratio.value = 8;
    limiter.attack.value = 0.003; limiter.release.value = 0.12;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(limiter); limiter.connect(analyser); analyser.connect(ctx.destination);
    const nodes: AudioNode[] = [master, limiter, analyser];
    const sources: Array<OscillatorNode | AudioBufferSourceNode> = [];

    function tone(type: OscillatorType, frequency: number) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type; oscillator.frequency.value = frequency;
      const gain = ctx.createGain(); gain.gain.value = 0;
      oscillator.connect(gain); gain.connect(master); oscillator.start();
      nodes.push(oscillator, gain); sources.push(oscillator);
      return { oscillator, gain };
    }
    const motor = tone('sine', 90);
    const motorHarmonic = tone('triangle', 240);
    const motorWhine = tone('sine', 620);
    const tireSqueal = tone('sine', 1100);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 19026;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    function filteredNoise(type: BiquadFilterType, frequency: number, q: number) {
      const source = ctx.createBufferSource(); source.buffer = noise; source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = type;
      filter.frequency.value = frequency; filter.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = 0;
      source.connect(filter); filter.connect(gain); gain.connect(master); source.start();
      nodes.push(source, filter, gain); sources.push(source);
      return { filter, gain };
    }
    const tire = filteredNoise('bandpass', 1500, 0.65);
    const impact = filteredNoise('lowpass', 520, 0.6);
    return { master, analyser, samples: new Float32Array(512), motor, motorHarmonic,
      motorWhine, tireSqueal, tire, impact, nodes, sources };
  }

  function fade(parameter: AudioParam, value: number, seconds = 0.04): void {
    if (context) parameter.setTargetAtTime(value, context.currentTime, seconds);
  }

  function cancelSuspension(): void {
    if (suspensionTimer !== null) clearTimeout(suspensionTimer);
    suspensionTimer = null;
  }

  function reconcilePlayback(): void {
    if (!context || !graph || disposed) return;
    cancelSuspension();
    const shouldRun = active && !muted && volume > 0;
    fade(graph.master.gain, shouldRun ? volume : 0, 0.015);
    if (!shouldRun) {
      graph.impact.gain.gain.cancelScheduledValues(context.currentTime);
      graph.impact.gain.gain.setValueAtTime(0, context.currentTime);
      // One bounded timer permits the master fade to finish before suspension.
      suspensionTimer = setTimeout(() => {
        suspensionTimer = null;
        if (context?.state === 'running') {
          void context.suspend().then(() => {
            if (context && active && !muted && volume > 0 && !disposed) return context.resume();
          }).catch(() => {});
        }
      }, 65);
    } else if (context.state === 'suspended' && !transitionPending) {
      transitionPending = true;
      void context.resume().catch(() => {}).finally(() => { transitionPending = false; });
    }
  }

  async function toggle(): Promise<void> {
    if (disposed) return;
    try {
      unavailable = false;
      if (!context) {
        if (typeof AudioContext === 'undefined') { unavailable = true; return; }
        context = new AudioContext({ latencyHint: 'interactive' });
        graph = buildGraph(context);
        muted = false;
      } else if (muted || context.state !== 'running') {
        muted = false;
      } else {
        muted = true;
      }
      if (!muted && active && volume > 0) await context.resume();
      savePreference(); reconcilePlayback();
    } catch {
      unavailable = true;
      if (context) void context.close().catch(() => {});
      context = null; graph = null;
    }
  }

  function setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    savePreference(); reconcilePlayback();
  }

  function setActive(value: boolean): void {
    if (active === value) return;
    active = value; reconcilePlayback();
  }

  function update(snapshot: SessionSnapshot, isActive: boolean): void {
    setActive(isActive && !(snapshot.mode === 'Time Trial' && snapshot.timeTrial.status === 'Finished'));
    const kart = snapshot.kart;
    const speedMps = Math.abs(kart.speedMps);
    const freshTick = lastTick !== null && snapshot.tick > lastTick;
    const teleported = previousPosition !== null &&
      Math.hypot(kart.position.x - previousPosition.x, kart.position.z - previousPosition.z) > 3;
    const reset = teleported || (previousMode !== null && previousMode !== snapshot.mode) ||
      (lastTick !== null && snapshot.tick < lastTick);
    const newImpact = lastContactCount !== null && kart.barrierContactCount > lastContactCount;
    if (context && graph && !disposed && active && !muted && volume > 0 && context.state === 'running') {
      const speed = Math.min(1, Math.max(0, speedMps / 12.5));
      const load = Math.max(0, Math.min(1, kart.driveDirection === 'Reverse' ? kart.brakeInput : kart.throttleInput));
      const rolling = speed > 0.015 ? Math.sqrt(speed) : 0;
      fade(graph.motor.oscillator.frequency, 85 + speedMps * 31);
      fade(graph.motor.gain.gain, rolling * (0.035 + load * 0.085));
      fade(graph.motorHarmonic.oscillator.frequency, 230 + speedMps * 84);
      fade(graph.motorHarmonic.gain.gain, rolling * (0.009 + load * 0.019));
      fade(graph.motorWhine.oscillator.frequency, 620 + speedMps * 135);
      fade(graph.motorWhine.gain.gain, rolling * (0.004 + load * 0.008));
      const gripUse = Math.max(0, Math.min(1, Math.max(kart.slipRatio, kart.axleScrub)));
      const scrub = Math.max(0, Math.min(1, kart.axleScrub));
      fade(graph.tire.filter.frequency, 850 + speed * 950 + gripUse * 700);
      fade(graph.tire.gain.gain, rolling * (0.006 + Math.max(0, gripUse - 0.25) * 0.09 + scrub * 0.025));
      fade(graph.tireSqueal.oscillator.frequency, 1050 + gripUse * 360 + speed * 160);
      fade(graph.tireSqueal.gain.gain, rolling * Math.max(0, gripUse - 0.55) * 0.03);
      if (reset) {
        graph.impact.gain.gain.cancelScheduledValues(context.currentTime);
        graph.impact.gain.gain.setValueAtTime(0, context.currentTime);
      } else if (newImpact && freshTick && active && !muted && volume > 0) {
        const intensity = Math.max(0.12, Math.min(1,
          (lastSpeed - speedMps) / 5 + Math.max(0, -kart.forwardAccelMps2) / 55));
        const now = context.currentTime;
        graph.impact.gain.gain.cancelScheduledValues(now);
        graph.impact.gain.gain.setValueAtTime(0, now);
        graph.impact.gain.gain.linearRampToValueAtTime(0.035 + intensity * 0.2, now + 0.006);
        graph.impact.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + intensity * 0.1);
        graph.impact.gain.gain.setValueAtTime(0, now + 0.15 + intensity * 0.1);
      }
    }
    // Observe even while silent, so activation/focus/reset cannot replay an old impact.
    lastTick = snapshot.tick; lastContactCount = kart.barrierContactCount;
    lastSpeed = speedMps; previousPosition = { ...kart.position }; previousMode = snapshot.mode;
  }

  function getState(): KartAudioState {
    const status: KartAudioState['status'] = disposed ? 'Closed' : unavailable ? 'Unavailable' :
      !context ? 'Off' : muted || volume === 0 ? 'Muted' : !active || context.state !== 'running' ? 'Paused' : 'Running';
    let outputLevel = 0;
    if (status === 'Running' && graph) {
      graph.analyser.getFloatTimeDomainData(graph.samples);
      outputLevel = Math.sqrt(graph.samples.reduce((sum, sample) => sum + sample * sample, 0) / graph.samples.length);
    }
    return { status, volume, outputLevel };
  }

  function reset(): void {
    lastTick = null; lastContactCount = null; lastSpeed = 0;
    previousPosition = null; previousMode = null;
    if (context && graph) {
      graph.impact.gain.gain.cancelScheduledValues(context.currentTime);
      graph.impact.gain.gain.setValueAtTime(0, context.currentTime);
      for (const gain of [graph.motor.gain, graph.motorHarmonic.gain, graph.motorWhine.gain, graph.tire.gain, graph.tireSqueal.gain]) {
        fade(gain.gain, 0, 0.01);
      }
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true; cancelSuspension();
    if (graph) {
      graph.sources.forEach((source) => source.stop());
      graph.nodes.forEach((node) => node.disconnect());
    }
    if (context) void context.close().catch(() => {});
    graph = null; context = null;
  }

  return { toggle, setVolume, setActive, update, getState, reset, dispose };
}
