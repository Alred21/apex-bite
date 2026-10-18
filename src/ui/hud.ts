import { DrillTargetId, PracticeMode, SessionSnapshot } from '../simulation/types';

export interface HudCallbacks {
  onToggleCamera?: () => void;
  onToggleRacingLine?: () => void;
  onCycleGhostMode?: () => void;
  onToggleMode?: () => void;
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
          <button type="button" class="hud-btn" id="hud-btn-reset" title="Instant Reset to Flying Entry / Flying Start (R)">
            RESET [R]
          </button>
          <button type="button" class="hud-btn" id="hud-btn-camera" title="Switch Camera View (C or V)">
            CAM [C]: <strong id="hud-camera-label">Chase Cam</strong>
          </button>
          <button type="button" class="hud-btn" id="hud-btn-line" title="Toggle Dynamic Racing Line (L)">
            LINE [L]: <strong id="hud-line-label">ON</strong>
          </button>
          <button type="button" class="hud-btn" id="hud-btn-ghost" title="Cycle Ghost Kart Mode (G)">
            GHOST [G]: <strong id="hud-ghost-label">Track Record</strong>
          </button>
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
          <div class="delta-value" id="hud-delta-text">+0.000s vs 24.499s REC</div>
        </div>

        <div class="sector-splits-row">
          <div class="sector-chip">S1 <strong id="hud-s1">--.---</strong></div>
          <div class="sector-chip">S2 <strong id="hud-s2">--.---</strong></div>
          <div class="sector-chip">S3 <strong id="hud-s3">--.---</strong></div>
        </div>

        <div class="records-row">
          <span>LAST: <strong id="hud-last-lap">--.---</strong></span>
          <span>PB: <strong id="hud-pb-lap">--.---</strong></span>
          <span>REC: <strong id="hud-rec-lap">24.499s</strong></span>
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
          <span class="exec-category-badge" id="hud-exec-category">Optimal Pass</span>
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
            <span class="exec-metric-sub">Inside Front Tire</span>
          </div>
          <div class="exec-metric">
            <span class="exec-metric-label">ENTRY / MIN / EXIT</span>
            <strong class="exec-metric-val exec-speeds" id="hud-exec-speeds">-- / -- / --</strong>
            <span class="exec-metric-sub" id="hud-exec-target-speeds">Target km/h</span>
          </div>
        </div>

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

    <dialog id="hud-data-dialog" class="hud-dialog" closedby="any" aria-labelledby="hud-dialog-title">
      <form method="dialog" class="dialog-content">
        <h2 id="hud-dialog-title">Portable Training Data (JSON)</h2>
        <p class="dialog-desc">Copy your Personal Bests & Ghost replays, or paste exported JSON below to restore:</p>
        <textarea id="hud-data-textarea" rows="8" spellcheck="false"></textarea>
        <div class="dialog-actions">
          <button type="button" class="hud-btn" id="hud-btn-import-apply">Import JSON</button>
          <button type="submit" class="hud-btn">Close</button>
        </div>
      </form>
    </dialog>
  `;

  const speedEl = root.querySelector<HTMLElement>('#hud-speed-kph')!;
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
  const execInsightEl = root.querySelector<HTMLElement>('#hud-exec-insight')!;

  const turnBadge = root.querySelector<HTMLElement>('#hud-turn-badge')!;
  const minimapCanvas = root.querySelector<HTMLCanvasElement>('#hud-minimap-canvas')!;
  const minimapCtx = minimapCanvas.getContext('2d')!;

  const dataDialog = root.querySelector<HTMLDialogElement>('#hud-data-dialog')!;
  const dataTextarea = root.querySelector<HTMLTextAreaElement>('#hud-data-textarea')!;
  const importApplyBtn = root.querySelector<HTMLButtonElement>('#hud-btn-import-apply')!;

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
    dataDialog.showModal();
    dataBtn.blur();
  });

  importApplyBtn.addEventListener('click', () => {
    if (dataTextarea.value.trim()) {
      callbacks.onImportData?.(dataTextarea.value.trim());
      dataDialog.close();
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
    const { kart, camera, lap, ghost, drill, mode } = snapshot;
    speedEl.textContent = kart.speedKph.toFixed(1);
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
    lineLabel.textContent = snapshot.racingLine.visible ? 'ON' : 'OFF';
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
          card.coachingCategory === 'Optimal Pass' ? 'cat-optimal' : 'cat-warn'
        }`;
        execTimeEl.textContent = `${card.segmentTimeSeconds.toFixed(3)}s`;
        const dSign = card.deltaToBenchmarkSeconds >= 0 ? '+' : '';
        execDeltaEl.textContent = `${dSign}${card.deltaToBenchmarkSeconds.toFixed(3)}s vs ${card.benchmarkTimeSeconds.toFixed(3)}s Target`;
        execApexEl.textContent = `${card.apexProximityCm.toFixed(0)} cm`;
        execApexEl.style.color =
          card.apexProximityCm <= 50 ? 'var(--accent-green)' : 'var(--accent-amber)';
        execSpeedsEl.textContent = `${card.entrySpeedKph.toFixed(1)} / ${card.minApexSpeedKph.toFixed(1)} / ${card.exitSpeedKph.toFixed(1)}`;
        execTargetSpeedsEl.textContent = `Target: ${card.targetEntrySpeedKph.toFixed(1)} / ${card.targetMinApexSpeedKph.toFixed(1)} / ${card.targetExitSpeedKph.toFixed(1)} km/h`;
        execInsightEl.textContent = card.coachingInsight;
      } else {
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
        lap.lapNumber === 0 ? 'FLYING START' : `LAP ${lap.lapNumber}`;
      cleanBadge.textContent = lap.isClean ? 'CLEAN LAP' : 'DIRTY (WALL CONTACT)';
      cleanBadge.className = `clean-badge ${lap.isClean ? 'clean-ok' : 'clean-dirty'}`;
      lapTimer.textContent = `${lap.currentLapSeconds.toFixed(3)}s`;
      lastLapEl.textContent = formatSeconds(lap.lastLapSeconds);
      pbLapEl.textContent = formatSeconds(lap.personalBestSeconds);
      recLapEl.textContent = '24.499s';
    }

    // Time-Delta Bar: negative = ahead (green), positive = behind (red)
    const delta = lap.timeDeltaSeconds;
    const signStr = delta >= 0 ? '+' : '';
    deltaText.textContent = `${signStr}${delta.toFixed(3)}s vs 24.499s REC`;
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

