import { CameraSettings, DrillTargetId, KeyboardAssistanceSettings, PracticeMode, SessionSnapshot } from '../simulation/types';
import { GraphicsQuality } from '../render/graphics';
import type { KartAudioState } from '../audio/kart-audio';

export interface HudCallbacks {
  getAudioState?: () => KartAudioState;
  onToggleAudio?: () => void;
  onAudioVolume?: (volume: number) => void;
  initialGraphicsQuality?: GraphicsQuality;
  onSelectGraphicsQuality?: (quality: GraphicsQuality) => void;
  onToggleCamera?: () => void;
  onSetCameraSettings?: (settings: Partial<CameraSettings>) => void;
  onSetKeyboardAssistance?: (settings: Partial<KeyboardAssistanceSettings>) => void;
  onToggleRacingLine?: () => void;
  onCycleGhostMode?: () => void;
  onToggleMode?: () => void;
  onSelectTimeTrialLapLimit?: (lapLimit: number | null) => void;
  onSelectDrillTarget?: (targetId: DrillTargetId) => void;
  onReset?: () => void;
  onExportData?: () => string;
  onImportData?: (json: string) => void;
}

export interface HudView {
  update(snapshot: SessionSnapshot): void;
}

function formatSeconds(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '--.---';
  return `${sec.toFixed(3)}s`;
}

export function createHudView(root: HTMLElement, callbacks: HudCallbacks = {}): HudView {
  root.innerHTML = `
    <div class="hud-top-row">
      <div class="hud-panel hud-quick-bar" aria-label="Controls Bar">
        <div class="brand-title">APEX BITE <span class="brand-sub">K1 TORONTO</span></div>
        <div class="quick-actions">
          <button type="button" class="hud-btn" id="hud-btn-mode" title="Switch Practice Mode: Time Trial / Corner Drill (M)">
            MODE [M]: <strong id="hud-mode-label">Time Trial</strong>
          </button>
          <label class="hud-select-wrap" id="hud-drill-select-wrap" title="Select Turn or Corner Complex for Corner Drill">
            <span>DRILL:</span>
            <select id="hud-drill-select" class="hud-select" aria-label="Corner Drill Target">
              <optgroup label="Corner Complexes (5)">
                <option value="T1-T3">T1–T3 Opening Complex</option>
                <option value="T2-T3">T2–T3 Infield into Hairpin</option>
                <option value="T4-T5">T4–T5 North Double-Right</option>
                <option value="T6-T7-T8">T6–T7–T8 Esses & Sweeper</option>
                <option value="T9-T10-T11">T9–T10–T11 Hairpin & Carousel</option>
              </optgroup>
              <optgroup label="Individual Turns (11)">
                <option value="T1">T1 Grid 90 Right</option>
                <option value="T2">T2 Infield Entry Right</option>
                <option value="T3" selected>T3 Center Hairpin Left</option>
                <option value="T4">T4 North-West Right</option>
                <option value="T5">T5 North Crown Right</option>
                <option value="T6">T6 Esses Entry Right</option>
                <option value="T7">T7 Esses Exit Left</option>
                <option value="T8">T8 East Sweeper Right</option>
                <option value="T9">T9 South Infield Right</option>
                <option value="T10">T10 West Hairpin Left</option>
                <option value="T11">T11 Carousel Right</option>
              </optgroup>
            </select>
          </label>
          <label class="hud-select-wrap" id="hud-lap-limit-wrap" title="Changing session length restarts Time Trial from the Flying Start">
            <span>TIMED LAPS:</span>
            <select id="hud-lap-limit" class="hud-select" aria-label="Time Trial length">
              <option value="1">1 lap</option>
              <option value="6">6 laps</option>
              <option value="12" selected>12 laps</option>
              <option value="24">24 laps</option>
              <option value="unlimited">Unlimited practice</option>
            </select>
          </label>
          <button type="button" class="hud-btn" id="hud-btn-results" disabled>RESULTS</button>
          <button type="button" class="hud-btn" id="hud-btn-reset" title="Instant Reset to Flying Entry / Flying Start (R)">
            RESET [R]
          </button>
          <button type="button" class="hud-btn" id="hud-btn-camera" title="Switch Camera View (C or V)">
            CAM [C]: <strong id="hud-camera-label">Chase Cam</strong>
          </button>
          <button type="button" class="hud-btn" id="hud-btn-camera-settings">DRIVING &amp; VIEW</button>
          <button type="button" class="hud-btn" id="hud-btn-line" title="Cycle Racing Line display: Full / Corners Only / Off (L)">
            LINE [L]: <strong id="hud-line-label">Full</strong>
          </button>
          <button type="button" class="hud-btn" id="hud-btn-ghost" title="Cycle Ghost Kart Mode (G)">
            GHOST [G]: <strong id="hud-ghost-label">Reference Lap</strong>
          </button>
          <label class="hud-select-wrap" id="hud-graphics-wrap" title="Performance reduces resolution and disables shadows. Balanced uses compact shadows. High increases resolution and shadow detail.">
            <span>GRAPHICS:</span>
            <select id="hud-graphics-quality" class="hud-select" aria-label="Graphics quality">
              <option>Performance</option><option selected>Balanced</option><option>High</option>
            </select>
          </label>
          <div class="hud-audio-controls" id="hud-audio-controls">
            <button type="button" class="hud-btn" id="hud-btn-audio" title="Enable sound after a click, then toggle mute">SOUND: ENABLE</button>
            <label class="hud-volume-label">VOL <input type="range" id="hud-audio-volume" aria-label="Sound volume" min="0" max="100" step="1" value="35"></label>
            <meter id="hud-audio-meter" min="0" max="1" value="0" aria-label="Audio output level"></meter>
          </div>
          <button type="button" class="hud-btn" id="hud-btn-data" title="Export or Import Training Data JSON">
            DATA JSON
          </button>
        </div>
      </div>

      <div class="hud-panel hud-timing-center" aria-label="Timing and Telemetry">
        <div class="timing-header-row">
          <span class="lap-badge" id="hud-lap-badge">FLYING START</span>
          <span class="clean-badge clean-ok" id="hud-clean-badge">CLEAN LAP</span>
        </div>

        <div class="lap-timer-main" id="hud-lap-timer">0.000s</div>

        <div class="delta-bar-wrap" aria-label="Time-Delta Bar">
          <div class="delta-bar-track">
            <div class="delta-bar-center-tick"></div>
            <div class="delta-bar-fill" id="hud-delta-fill"></div>
          </div>
          <div class="delta-value" id="hud-delta-text">+0.000s vs Reference Lap</div>
        </div>

        <div class="sector-splits-row">
          <div class="sector-chip">S1 <strong id="hud-s1">--.---</strong></div>
          <div class="sector-chip">S2 <strong id="hud-s2">--.---</strong></div>
          <div class="sector-chip">S3 <strong id="hud-s3">--.---</strong></div>
        </div>

        <div class="records-row">
          <span>LAST: <strong id="hud-last-lap">--.---</strong></span>
          <span>PB: <strong id="hud-pb-lap">--.---</strong></span>
          <span>REFERENCE: <strong id="hud-rec-lap">--.---s</strong></span>
          <span title="Reported physical Circuit time; the simulated Circuit dimensions are estimates.">REAL-WORLD BENCHMARK: <strong>24.499s</strong></span>
        </div>
      </div>

      <div class="hud-panel hud-minimap-panel" aria-label="2D Circuit Mini-Map">
        <div class="minimap-header">
          <span>CIRCUIT MAP</span>
          <span id="hud-turn-badge">STRAIGHT</span>
        </div>
        <canvas id="hud-minimap-canvas" width="210" height="175"></canvas>
      </div>
    </div>

    <div class="hud-middle-row">
      <aside class="hud-panel hud-execution-card hidden" id="hud-execution-card" aria-label="Corner Execution Card">
        <div class="exec-card-header">
          <div>
            <div class="exec-card-eyebrow">CORNER EXECUTION CARD</div>
            <div class="exec-card-title" id="hud-exec-title">Turn 3 (Center Hairpin Left)</div>
          </div>
          <span class="exec-category-badge" id="hud-exec-category">Awaiting Pass</span>
        </div>

        <div class="exec-metrics-grid">
          <div class="exec-metric">
            <span class="exec-metric-label">SEGMENT TIME</span>
            <strong class="exec-metric-val" id="hud-exec-time">--.---</strong>
            <span class="exec-metric-sub" id="hud-exec-delta">vs Target</span>
          </div>
          <div class="exec-metric">
            <span class="exec-metric-label">APEX PROXIMITY</span>
            <strong class="exec-metric-val" id="hud-exec-apex">-- cm</strong>
            <span class="exec-metric-sub">Inside Front Tire · Largest Offset</span>
          </div>
          <div class="exec-metric">
            <span class="exec-metric-label">ENTRY / MIN / EXIT</span>
            <strong class="exec-metric-val exec-speeds" id="hud-exec-speeds">-- / -- / --</strong>
            <span class="exec-metric-sub" id="hud-exec-target-speeds">Target km/h</span>
          </div>
        </div>

        <div id="hud-exec-turn-proximities" class="exec-metric-sub"></div>
        <div class="exec-coaching-box" id="hud-exec-insight">
          Complete a pass through the selected Turn or Corner Complex to generate a Coaching Insight.
        </div>
      </aside>
    </div>

    <div class="hud-panel hud-bottom-cluster" aria-label="Driver Cluster">
      <div class="pedal-Cluster">
        <div class="pedal-row">
          <span class="pedal-label">THR</span>
          <div class="pedal-track">
            <div class="pedal-fill pedal-throttle" id="hud-throttle-bar"></div>
          </div>
        </div>
        <div class="pedal-row">
          <span class="pedal-label">BRK</span>
          <div class="pedal-track pedal-brake-track" title="Shaded band indicates optimal Trail Braking window">
            <div class="trail-zone-marker"></div>
            <div class="pedal-fill pedal-brake" id="hud-brake-bar"></div>
          </div>
        </div>
      </div>

      <div class="speedometer">
        <div class="speed-value" id="hud-speed-kph">0.0</div>
        <div class="speed-unit">km/h</div>
      </div>

      <div class="line-guidance" id="hud-line-guidance" aria-label="Racing Line guidance">
        <strong id="hud-guidance-action">Coast</strong>
        <span id="hud-guidance-reason">Prepare for the Turns ahead</span>
      </div>

      <div class="dynamics-indicators">
        <div class="status-pill" id="hud-trail-pill">TRAIL BRAKE</div>
        <div class="scrub-meter-row">
          <span class="pedal-label">AXLE SCRUB</span>
          <div class="pedal-track">
            <div class="pedal-fill pedal-scrub" id="hud-scrub-bar"></div>
          </div>
        </div>
      </div>
    </div>

    <dialog id="hud-camera-dialog" class="hud-dialog" aria-labelledby="hud-camera-settings-title">
      <form method="dialog" class="camera-settings">
        <h2 id="hud-camera-settings-title">Driving and view settings</h2>
        <label for="hud-steering-sensitivity">Keyboard steering sensitivity <output id="hud-steering-sensitivity-value" for="hud-steering-sensitivity">100%</output></label>
        <input id="hud-steering-sensitivity" type="range" min="50" max="175" step="5" value="100" />
        <p class="dialog-desc">Short taps make small corrections. Hold progressively and brake for tight Turns. Sensitivity changes response speed; the steering limit still adapts to speed.</p>
        <p>Adjust both Helmet Cam and Chase Cam. Camera motion adds gentle acceleration, cornering and contact feedback.</p>
        <label for="hud-camera-fov">Vertical field of view <output id="hud-camera-fov-value" for="hud-camera-fov">64°</output></label>
        <input id="hud-camera-fov" type="range" min="50" max="90" step="1" value="64" />
        <label for="hud-camera-motion">Camera motion <output id="hud-camera-motion-value" for="hud-camera-motion">35%</output></label>
        <input id="hud-camera-motion" type="range" min="0" max="100" step="5" value="35" />
        <p class="dialog-desc">Set motion to 0% to fully disable feedback. Your view still follows the Kart. Changes apply immediately and remain when you restart.</p>
        <div class="dialog-actions"><button type="submit" class="hud-btn">Close view settings</button></div>
      </form>
    </dialog>

    <dialog id="hud-results-dialog" class="hud-dialog time-trial-results" aria-labelledby="hud-results-title">
      <h2 id="hud-results-title">Time Trial complete</h2>
      <p id="hud-results-summary"></p>
      <p id="hud-results-best"></p>
      <div class="results-table-wrap" tabindex="0" aria-label="Lap and Sector results">
        <table class="results-table">
          <thead><tr><th scope="col">Lap</th><th scope="col">Time</th><th scope="col">Status</th><th scope="col">S1</th><th scope="col">S2</th><th scope="col">S3</th></tr></thead>
          <tbody id="hud-results-laps"></tbody>
        </table>
      </div>
      <div class="dialog-actions">
        <button type="button" class="hud-btn" id="hud-results-restart">Restart Time Trial [R]</button>
        <button type="button" class="hud-btn" id="hud-results-close">View Circuit</button>
      </div>
    </dialog>

    <dialog id="hud-data-dialog" class="hud-dialog" closedby="any" aria-labelledby="hud-dialog-title">
      <form method="dialog" class="dialog-content">
        <h2 id="hud-dialog-title">Portable Training Data (JSON)</h2>
        <p class="dialog-desc">Inspect current and legacy records below. Copy the JSON to back up every revision, or paste a backup to import. Imported revisions replace matching revisions; other saved revisions are retained.</p>
        <div id="hud-data-records" class="training-records" aria-label="Current and legacy records"></div>
        <label for="hud-data-textarea">Training data JSON</label>
        <textarea id="hud-data-textarea" rows="6" spellcheck="false"></textarea>
        <p id="hud-data-feedback" class="dialog-desc" role="status" aria-live="polite"></p>
        <div class="dialog-actions">
          <button type="button" class="hud-btn" id="hud-btn-export-refresh">Refresh export</button>
          <button type="button" class="hud-btn" id="hud-btn-import-apply">Import JSON</button>
          <button type="submit" class="hud-btn">Close</button>
        </div>
      </form>
    </dialog>
  `;

  // Native dialog close restores its opener, whose focused button suppresses
  // driving keys. Return focus to the Circuit for close, cancel and restart.
  for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog')) {
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]') && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  const audioControls = root.querySelector<HTMLElement>('#hud-audio-controls')!;
  const audioButton = root.querySelector<HTMLButtonElement>('#hud-btn-audio')!;
  const audioVolume = root.querySelector<HTMLInputElement>('#hud-audio-volume')!;
  const audioMeter = root.querySelector<HTMLMeterElement>('#hud-audio-meter')!;
  audioControls.hidden = !callbacks.getAudioState;
  audioButton.addEventListener('click', () => { callbacks.onToggleAudio?.(); audioButton.blur(); });
  audioVolume.addEventListener('input', () => callbacks.onAudioVolume?.(Number(audioVolume.value) / 100));
  audioVolume.addEventListener('keydown', (event) => event.stopPropagation());
  audioVolume.addEventListener('keyup', (event) => event.stopPropagation());

  const cameraDialog = root.querySelector<HTMLDialogElement>('#hud-camera-dialog')!;
  const steeringSensitivity = root.querySelector<HTMLInputElement>('#hud-steering-sensitivity')!;
  const steeringSensitivityValue = root.querySelector<HTMLOutputElement>('#hud-steering-sensitivity-value')!;
  steeringSensitivity.addEventListener('input', () => callbacks.onSetKeyboardAssistance?.({ steeringSensitivity: Number(steeringSensitivity.value) / 100 }));
  const cameraFov = root.querySelector<HTMLInputElement>('#hud-camera-fov')!;
  const cameraMotion = root.querySelector<HTMLInputElement>('#hud-camera-motion')!;
  const cameraFovValue = root.querySelector<HTMLOutputElement>('#hud-camera-fov-value')!;
  const cameraMotionValue = root.querySelector<HTMLOutputElement>('#hud-camera-motion-value')!;
  root.querySelector('#hud-btn-camera-settings')!.addEventListener('click', () => cameraDialog.showModal());
  cameraDialog.addEventListener('keydown', (event) => event.stopPropagation());
  cameraFov.addEventListener('input', () => callbacks.onSetCameraSettings?.({ fieldOfViewDegrees: Number(cameraFov.value) }));
  cameraMotion.addEventListener('input', () => callbacks.onSetCameraSettings?.({ motionStrength: Number(cameraMotion.value) / 100 }));
  const graphicsWrap = root.querySelector<HTMLElement>('#hud-graphics-wrap')!;
  const graphicsSelect = root.querySelector<HTMLSelectElement>('#hud-graphics-quality')!;
  graphicsWrap.hidden = !callbacks.onSelectGraphicsQuality;
  graphicsSelect.value = callbacks.initialGraphicsQuality ?? 'Balanced';
  graphicsSelect.addEventListener('change', () => {
    callbacks.onSelectGraphicsQuality?.(graphicsSelect.value as GraphicsQuality);
    graphicsSelect.blur();
  });

  const lapLimitWrap = root.querySelector<HTMLElement>('#hud-lap-limit-wrap')!;
  const lapLimitSelect = root.querySelector<HTMLSelectElement>('#hud-lap-limit')!;
  const resultsBtn = root.querySelector<HTMLButtonElement>('#hud-btn-results')!;
  const resultsDialog = root.querySelector<HTMLDialogElement>('#hud-results-dialog')!;
  const resultsSummary = root.querySelector<HTMLElement>('#hud-results-summary')!;
  const resultsBest = root.querySelector<HTMLElement>('#hud-results-best')!;
  const resultsLaps = root.querySelector<HTMLElement>('#hud-results-laps')!;
  let showedFinishedResults = false;
  lapLimitSelect.addEventListener('change', () => {
    callbacks.onSelectTimeTrialLapLimit?.(lapLimitSelect.value === 'unlimited' ? null : Number(lapLimitSelect.value));
    lapLimitSelect.blur();
  });
  resultsBtn.addEventListener('click', () => resultsDialog.showModal());
  root.querySelector('#hud-results-close')!.addEventListener('click', () => resultsDialog.close());
  root.querySelector('#hud-results-restart')!.addEventListener('click', () => {
    callbacks.onReset?.();
    resultsDialog.close();
  });

  const speedEl = root.querySelector<HTMLElement>('#hud-speed-kph')!;
  const guidanceEl = root.querySelector<HTMLElement>('#hud-line-guidance')!;
  const guidanceAction = root.querySelector<HTMLElement>('#hud-guidance-action')!;
  const guidanceReason = root.querySelector<HTMLElement>('#hud-guidance-reason')!;
  const throttleBar = root.querySelector<HTMLElement>('#hud-throttle-bar')!;
  const brakeBar = root.querySelector<HTMLElement>('#hud-brake-bar')!;
  const scrubBar = root.querySelector<HTMLElement>('#hud-scrub-bar')!;
  const trailPill = root.querySelector<HTMLElement>('#hud-trail-pill')!;

  const modeBtn = root.querySelector<HTMLButtonElement>('#hud-btn-mode')!;
  const modeLabel = root.querySelector<HTMLElement>('#hud-mode-label')!;
  const drillSelect = root.querySelector<HTMLSelectElement>('#hud-drill-select')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#hud-btn-reset')!;
  const cameraBtn = root.querySelector<HTMLButtonElement>('#hud-btn-camera')!;
  const cameraLabel = root.querySelector<HTMLElement>('#hud-camera-label')!;
  const lineBtn = root.querySelector<HTMLButtonElement>('#hud-btn-line')!;
  const lineLabel = root.querySelector<HTMLElement>('#hud-line-label')!;
  const ghostBtn = root.querySelector<HTMLButtonElement>('#hud-btn-ghost')!;
  const ghostLabel = root.querySelector<HTMLElement>('#hud-ghost-label')!;
  const dataBtn = root.querySelector<HTMLButtonElement>('#hud-btn-data')!;

  const lapBadge = root.querySelector<HTMLElement>('#hud-lap-badge')!;
  const cleanBadge = root.querySelector<HTMLElement>('#hud-clean-badge')!;
  const lapTimer = root.querySelector<HTMLElement>('#hud-lap-timer')!;
  const deltaFill = root.querySelector<HTMLElement>('#hud-delta-fill')!;
  const deltaText = root.querySelector<HTMLElement>('#hud-delta-text')!;
  const s1El = root.querySelector<HTMLElement>('#hud-s1')!;
  const s2El = root.querySelector<HTMLElement>('#hud-s2')!;
  const s3El = root.querySelector<HTMLElement>('#hud-s3')!;
  const lastLapEl = root.querySelector<HTMLElement>('#hud-last-lap')!;
  const pbLapEl = root.querySelector<HTMLElement>('#hud-pb-lap')!;
  const recLapEl = root.querySelector<HTMLElement>('#hud-rec-lap')!;

  const execCardEl = root.querySelector<HTMLElement>('#hud-execution-card')!;
  const execTitleEl = root.querySelector<HTMLElement>('#hud-exec-title')!;
  const execCategoryEl = root.querySelector<HTMLElement>('#hud-exec-category')!;
  const execTimeEl = root.querySelector<HTMLElement>('#hud-exec-time')!;
  const execDeltaEl = root.querySelector<HTMLElement>('#hud-exec-delta')!;
  const execApexEl = root.querySelector<HTMLElement>('#hud-exec-apex')!;
  const execSpeedsEl = root.querySelector<HTMLElement>('#hud-exec-speeds')!;
  const execTargetSpeedsEl = root.querySelector<HTMLElement>('#hud-exec-target-speeds')!;
  const execTurnProximities = root.querySelector<HTMLElement>('#hud-exec-turn-proximities')!;
  const execInsightEl = root.querySelector<HTMLElement>('#hud-exec-insight')!;

  const turnBadge = root.querySelector<HTMLElement>('#hud-turn-badge')!;
  const minimapCanvas = root.querySelector<HTMLCanvasElement>('#hud-minimap-canvas')!;
  const minimapCtx = minimapCanvas.getContext('2d')!;

  const dataDialog = root.querySelector<HTMLDialogElement>('#hud-data-dialog')!;
  const dataTextarea = root.querySelector<HTMLTextAreaElement>('#hud-data-textarea')!;
  const importApplyBtn = root.querySelector<HTMLButtonElement>('#hud-btn-import-apply')!;
  const exportRefreshBtn = root.querySelector<HTMLButtonElement>('#hud-btn-export-refresh')!;
  const dataRecords = root.querySelector<HTMLElement>('#hud-data-records')!;
  const dataFeedback = root.querySelector<HTMLElement>('#hud-data-feedback')!;
  let latestTrainingData: SessionSnapshot['trainingData'] | null = null;

  function refreshRecordInspection(): void {
    if (!latestTrainingData) return;
    dataRecords.replaceChildren();
    const addRecords = (label: string, records: SessionSnapshot['trainingData']['current']): void => {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = `${label} · ${records.revision.handling} / ${records.revision.circuit}`;
      const details = document.createElement('p');
      const sectors = records.bestSectorSplits.map(formatSeconds).join(' / ');
      const drills = Object.entries(records.drillPersonalBests).map(([id, seconds]) => `${id}: ${formatSeconds(seconds ?? null)}`).join(' · ');
      details.textContent = `Personal Best: ${formatSeconds(records.personalBestSeconds)} · Sectors: ${sectors} · Ghost Kart: ${records.ghostFrameCount} replay frames`;
      const drillDetails = document.createElement('p');
      drillDetails.textContent = `Corner Drill records: ${drills || 'None'}`;
      section.append(heading, details, drillDetails);
      dataRecords.append(section);
    };
    addRecords('Current comparisons', latestTrainingData.current);
    for (const records of latestTrainingData.legacy) addRecords('Legacy · excluded from current comparisons', records);
    if (!latestTrainingData.legacy.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No legacy records.';
      dataRecords.append(empty);
    }
  }

  // Text editing and dialog actions must not trigger driving shortcuts.
  dataDialog.addEventListener('keydown', (event) => event.stopPropagation());

  // Fallback for browsers without <dialog closedby="any"> support (e.g. Safari)
  if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
    dataDialog.addEventListener('click', (event) => {
      if (event.target !== dataDialog) return;
      const rect = dataDialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dataDialog.close();
    });
  }

  modeBtn.addEventListener('click', () => {
    callbacks.onToggleMode?.();
    modeBtn.blur();
  });

  drillSelect.addEventListener('change', () => {
    callbacks.onSelectDrillTarget?.(drillSelect.value as DrillTargetId);
    drillSelect.blur();
  });

  resetBtn.addEventListener('click', () => {
    callbacks.onReset?.();
    resetBtn.blur();
  });

  cameraBtn.addEventListener('click', () => {
    callbacks.onToggleCamera?.();
    cameraBtn.blur();
  });

  lineBtn.addEventListener('click', () => {
    callbacks.onToggleRacingLine?.();
    lineBtn.blur();
  });

  ghostBtn.addEventListener('click', () => {
    callbacks.onCycleGhostMode?.();
    ghostBtn.blur();
  });

  dataBtn.addEventListener('click', () => {
    dataTextarea.value = callbacks.onExportData?.() ?? '';
    dataFeedback.textContent = latestTrainingData?.message ?? '';
    refreshRecordInspection();
    dataDialog.showModal();
    dataBtn.blur();
  });

  exportRefreshBtn.addEventListener('click', () => {
    dataTextarea.value = callbacks.onExportData?.() ?? '';
    dataFeedback.textContent = 'Export refreshed. Copy this JSON to keep all current and legacy records.';
    refreshRecordInspection();
  });

  importApplyBtn.addEventListener('click', () => {
    if (!dataTextarea.value.trim()) {
      dataFeedback.textContent = 'Paste exported training data first.';
      return;
    }
    try {
      callbacks.onImportData?.(dataTextarea.value.trim());
      dataTextarea.value = callbacks.onExportData?.() ?? '';
      dataFeedback.textContent = 'Import complete. Current and legacy records have been retained.';
      // The next HUD update refreshes the inspection from the committed session snapshot.
      latestTrainingData = null;
    } catch (error) {
      dataFeedback.textContent = error instanceof Error ? error.message : 'Import failed. No records were changed.';
    }
  });

  function drawMinimap(snapshot: SessionSnapshot): void {
    const { circuit, kart, ghost } = snapshot;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);

    const scale = 1.85;
    const offsetX = w * 0.48;
    const offsetZ = h * 0.54;
    const toX = (x: number): number => offsetX + x * scale;
    const toY = (z: number): number => offsetZ + z * scale;

    minimapCtx.beginPath();
    circuit.samples.forEach((s, idx) => {
      const px = toX(s.center.x);
      const py = toY(s.center.z);
      if (idx === 0) minimapCtx.moveTo(px, py);
      else minimapCtx.lineTo(px, py);
    });
    minimapCtx.closePath();
    minimapCtx.lineWidth = 7;
    minimapCtx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    minimapCtx.stroke();

    minimapCtx.lineWidth = 2.5;
    minimapCtx.strokeStyle = '#e2e8f0';
    minimapCtx.stroke();

    const s0 = circuit.samples[0];
    minimapCtx.beginPath();
    minimapCtx.moveTo(toX(s0.leftBarrier.x), toY(s0.leftBarrier.z));
    minimapCtx.lineTo(toX(s0.rightBarrier.x), toY(s0.rightBarrier.z));
    minimapCtx.lineWidth = 3;
    minimapCtx.strokeStyle = '#facc15';
    minimapCtx.stroke();

    minimapCtx.font = 'bold 9px Inter, sans-serif';
    minimapCtx.textAlign = 'center';
    minimapCtx.textBaseline = 'middle';
    for (const t of circuit.turns) {
      const tx = toX(t.apexPoint.x);
      const ty = toY(t.apexPoint.z);
      const isDrillHighlighted =
        snapshot.mode === 'Corner Drill' &&
        snapshot.drill.target.turns.includes(t.number);
      minimapCtx.fillStyle =
        kart.currentTurn === t.number
          ? '#ef4444'
          : isDrillHighlighted
            ? '#38bdf8'
            : 'rgba(15, 23, 42, 0.9)';
      minimapCtx.beginPath();
      minimapCtx.arc(tx, ty, 6.5, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.fillStyle = '#f8fafc';
      minimapCtx.fillText(String(t.number), tx, ty + 0.5);
    }

    // Draw Ghost Kart dots if active
    if (ghost.trackRecordPose) {
      minimapCtx.fillStyle = '#facc15';
      minimapCtx.beginPath();
      minimapCtx.arc(
        toX(ghost.trackRecordPose.position.x),
        toY(ghost.trackRecordPose.position.z),
        4.2,
        0,
        Math.PI * 2,
      );
      minimapCtx.fill();
    }
    if (ghost.personalBestPose) {
      minimapCtx.fillStyle = '#22c55e';
      minimapCtx.beginPath();
      minimapCtx.arc(
        toX(ghost.personalBestPose.position.x),
        toY(ghost.personalBestPose.position.z),
        4.2,
        0,
        Math.PI * 2,
      );
      minimapCtx.fill();
    }

    // Live Kart position + heading arrow
    const kx = toX(kart.position.x);
    const ky = toY(kart.position.z);
    minimapCtx.save();
    minimapCtx.translate(kx, ky);
    minimapCtx.rotate(kart.headingRad);
    minimapCtx.fillStyle = '#38bdf8';
    minimapCtx.beginPath();
    minimapCtx.moveTo(7, 0);
    minimapCtx.lineTo(-5, -4.5);
    minimapCtx.lineTo(-5, 4.5);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.restore();
  }

  function update(snapshot: SessionSnapshot): void {
    const needsRecordRefresh = latestTrainingData === null;
    latestTrainingData = snapshot.trainingData;
    if (dataDialog.open && needsRecordRefresh) refreshRecordInspection();
    const { kart, camera, lap, ghost, drill, mode, timeTrial } = snapshot;
    steeringSensitivity.value = String(Math.round(snapshot.keyboardAssistance.steeringSensitivity * 100));
    steeringSensitivityValue.value = `${Math.round(snapshot.keyboardAssistance.steeringSensitivity * 100)}%`;
    const audio = callbacks.getAudioState?.();
    if (audio) {
      const label = audio.status === 'Off' ? 'ENABLE' : audio.status === 'Running' ? 'ON' : audio.status.toUpperCase();
      audioButton.textContent = `SOUND: ${label}`;
      audioButton.setAttribute('aria-pressed', String(audio.status === 'Running'));
      audioVolume.value = String(Math.round(audio.volume * 100));
      audioMeter.value = Math.min(1, audio.outputLevel * 10);
    }
    cameraFov.value = String(camera.settings.fieldOfViewDegrees);
    cameraFovValue.value = `${camera.settings.fieldOfViewDegrees}°`;
    cameraMotion.value = String(Math.round(camera.settings.motionStrength * 100));
    cameraMotionValue.value = camera.settings.motionStrength === 0 ? 'Off' : `${Math.round(camera.settings.motionStrength * 100)}%`;
    lapLimitWrap.hidden = mode !== 'Time Trial';
    lapLimitSelect.value = timeTrial.lapLimit === null ? 'unlimited' : String(timeTrial.lapLimit);
    const finished = mode === 'Time Trial' && timeTrial.status === 'Finished';
    resultsBtn.hidden = mode !== 'Time Trial';
    resultsBtn.disabled = !finished;
    if (finished && !showedFinishedResults) {
      showedFinishedResults = true;
      resultsSummary.textContent = `${timeTrial.completedLaps.length} timed laps · Total ${formatSeconds(timeTrial.totalSeconds)}`;
      resultsBest.textContent = `Best Clean Lap: ${formatSeconds(timeTrial.bestCleanLapSeconds)}`;
      resultsLaps.replaceChildren(...timeTrial.completedLaps.map((completed) => {
        const row = document.createElement('tr');
        const values = [String(completed.lapNumber), formatSeconds(completed.seconds), completed.isClean ? 'Clean' : 'Barrier contact', ...completed.sectorSplits.map(formatSeconds)];
        for (const value of values) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        return row;
      }));
      resultsDialog.showModal();
    } else if (!finished) {
      showedFinishedResults = false;
      if (resultsDialog.open) resultsDialog.close();
    }
    speedEl.textContent = kart.speedKph.toFixed(1);
    const guidance = snapshot.racingLine.guidance;
    guidanceEl.hidden = snapshot.racingLine.displayMode === 'Off';
    guidanceEl.style.color = guidance.cue === 'Red' ? 'var(--accent-red)' : guidance.cue === 'Yellow' ? 'var(--accent-amber)' : 'var(--accent-green)';
    guidanceAction.textContent = `${guidance.action} · up to ${Math.round(guidance.targetSpeedKph)} km/h`;
    guidanceReason.textContent = guidance.reason;
    throttleBar.style.width = `${Math.round(kart.throttleInput * 100)}%`;
    brakeBar.style.width = `${Math.round(kart.brakeInput * 100)}%`;
    scrubBar.style.width = `${Math.round(kart.axleScrub * 100)}%`;

    trailPill.classList.toggle('active-trail', kart.isTrailBraking);
    scrubBar.classList.toggle('high-scrub', kart.axleScrub > 0.25);

    modeLabel.textContent = mode;
    if (drillSelect.value !== drill.target.id) {
      drillSelect.value = drill.target.id;
    }
    cameraLabel.textContent = camera.mode;
    lineLabel.textContent = snapshot.racingLine.displayMode;
    ghostLabel.textContent = ghost.mode;

    if (mode === 'Corner Drill') {
      lapBadge.textContent = `DRILL ${drill.target.id} · RUN #${drill.runNumber}`;
      cleanBadge.textContent = drill.isClean ? 'CLEAN PASS' : 'DIRTY (WALL CONTACT)';
      cleanBadge.className = `clean-badge ${drill.isClean ? 'clean-ok' : 'clean-dirty'}`;
      lapTimer.textContent = `${drill.currentSegmentSeconds.toFixed(3)}s`;

      const drillPb = drill.personalBests[drill.target.id] ?? null;
      pbLapEl.textContent = formatSeconds(drillPb);
      recLapEl.textContent = formatSeconds(drill.target.benchmarkTimeSeconds);
      lastLapEl.textContent = formatSeconds(
        drill.lastExecutionCard?.segmentTimeSeconds ?? null,
      );

      execCardEl.classList.remove('hidden');
      const card = drill.lastExecutionCard;
      if (card) {
        execTitleEl.textContent = `${card.targetLabel} · Run #${card.runNumber}`;
        execCategoryEl.textContent = card.coachingCategory;
        execCategoryEl.className = `exec-category-badge ${
          (card.coachingCategory === 'Matched Reference' || card.coachingCategory === 'Clean Faster Pass') ? 'cat-optimal' : 'cat-warn'
        }`;
        execTimeEl.textContent = `${card.segmentTimeSeconds.toFixed(3)}s`;
        const dSign = card.deltaToBenchmarkSeconds >= 0 ? '+' : '';
        const pbDeltaStr =
          card.deltaToPersonalBestSeconds !== null
            ? ` · ${card.deltaToPersonalBestSeconds >= 0 ? '+' : ''}${card.deltaToPersonalBestSeconds.toFixed(3)}s vs PB`
            : '';
        execDeltaEl.textContent = `${dSign}${card.deltaToBenchmarkSeconds.toFixed(3)}s vs REFERENCE${pbDeltaStr}`;
        execApexEl.textContent = card.apexProximityCm === null ? 'Not observed' : `${card.apexProximityCm.toFixed(0)} cm`;
        execApexEl.style.color =
          card.apexProximityCm !== null && card.apexProximityCm <= 50 ? 'var(--accent-green)' : 'var(--accent-amber)';
        execSpeedsEl.textContent = `${card.entrySpeedKph.toFixed(1)} / ${card.minApexSpeedKph.toFixed(1)} / ${card.exitSpeedKph.toFixed(1)}`;
        execTargetSpeedsEl.textContent = `Target: ${card.targetEntrySpeedKph.toFixed(1)} / ${card.targetMinApexSpeedKph.toFixed(1)} / ${card.targetExitSpeedKph.toFixed(1)} km/h`;
        execTurnProximities.textContent = card.turnApexProximities.map((turn) => `T${turn.turnNumber}: ${turn.distanceCm === null ? 'not observed' : `${turn.distanceCm.toFixed(0)} cm${turn.distanceCm > 50 ? ' · target missed' : ''}`}`).join(' | ');
        execInsightEl.textContent = card.coachingInsight;
      } else {
        execTurnProximities.textContent = '';
        execTitleEl.textContent = `${drill.target.label} (Flying Entry Ready)`;
        execCategoryEl.textContent = 'Awaiting Pass';
        execCategoryEl.className = 'exec-category-badge';
        execTimeEl.textContent = '--.---';
        execDeltaEl.textContent = `Target: ${drill.target.benchmarkTimeSeconds.toFixed(3)}s`;
        execApexEl.textContent = '-- cm';
        execApexEl.style.color = 'var(--text-main)';
        execSpeedsEl.textContent = '-- / -- / --';
        execTargetSpeedsEl.textContent = `Target: ${drill.target.targetEntrySpeedKph.toFixed(1)} / ${drill.target.targetMinApexSpeedKph.toFixed(1)} / ${drill.target.targetExitSpeedKph.toFixed(1)} km/h`;
        execInsightEl.textContent =
          'Drive through the corner exit gate to receive your Corner Execution Card & Coaching Insight. Press [R] anytime for Instant Reset.';
      }
    } else {
      execCardEl.classList.add('hidden');
      lapBadge.textContent =
        finished ? 'TIME TRIAL COMPLETE' : lap.lapNumber === 0 ? 'FLYING START · APPROACH UNCOUNTED' : `LAP ${lap.lapNumber}${timeTrial.lapLimit === null ? ' · UNLIMITED' : ` / ${timeTrial.lapLimit}`}`;
      cleanBadge.textContent = lap.isClean ? 'CLEAN LAP' : 'DIRTY (WALL CONTACT)';
      cleanBadge.className = `clean-badge ${lap.isClean ? 'clean-ok' : 'clean-dirty'}`;
      lapTimer.textContent = `${lap.currentLapSeconds.toFixed(3)}s`;
      lastLapEl.textContent = formatSeconds(lap.lastLapSeconds);
      pbLapEl.textContent = formatSeconds(lap.personalBestSeconds);
      recLapEl.textContent = `${snapshot.racingLine.benchmarkLapSeconds.toFixed(3)}s`;
    }

    // Time-Delta Bar: negative = ahead (green), positive = behind (red)
    const delta = lap.timeDeltaSeconds;
    const signStr = delta >= 0 ? '+' : '';
    const refLabel =
      ghost.mode === 'Personal Best' && lap.personalBestSeconds !== null
        ? `vs ${lap.personalBestSeconds.toFixed(3)}s PB`
        : `vs ${snapshot.racingLine.benchmarkLapSeconds.toFixed(3)}s REFERENCE`;
    deltaText.textContent = `${signStr}${delta.toFixed(3)}s ${refLabel}`;
    deltaText.style.color = delta <= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    const clampedDelta = Math.max(-2.5, Math.min(2.5, delta));
    const pct = Math.abs(clampedDelta / 2.5) * 50;
    deltaFill.style.width = `${pct}%`;
    deltaFill.style.left = clampedDelta <= 0 ? `${50 - pct}%` : '50%';
    deltaFill.style.background =
      clampedDelta <= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

    const activeSplits =
      lap.currentSectorSplits[0] !== null
        ? lap.currentSectorSplits
        : lap.lastSectorSplits;
    s1El.textContent = formatSeconds(activeSplits[0]);
    s2El.textContent = formatSeconds(activeSplits[1]);
    s3El.textContent = formatSeconds(activeSplits[2]);

    turnBadge.textContent = kart.currentTurn
      ? `TURN ${kart.currentTurn} (S${kart.currentSector})`
      : `SECTOR ${kart.currentSector}`;

    drawMinimap(snapshot);
  }

  return { update };
}
export type { PracticeMode };

