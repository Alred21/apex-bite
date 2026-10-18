import { SessionSnapshot } from '../simulation/types';

export interface HudCallbacks {
  onToggleCamera?: () => void;
  onToggleRacingLine?: () => void;
  onCycleGhostMode?: () => void;
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
          <span>REC: <strong>24.499s</strong></span>
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

    <div></div>

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
      minimapCtx.fillStyle =
        kart.currentTurn === t.number ? '#ef4444' : 'rgba(15, 23, 42, 0.9)';
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
    const { kart, camera, lap, ghost } = snapshot;
    speedEl.textContent = kart.speedKph.toFixed(1);
    throttleBar.style.width = `${Math.round(kart.throttleInput * 100)}%`;
    brakeBar.style.width = `${Math.round(kart.brakeInput * 100)}%`;
    scrubBar.style.width = `${Math.round(kart.axleScrub * 100)}%`;

    trailPill.classList.toggle('active-trail', kart.isTrailBraking);
    scrubBar.classList.toggle('high-scrub', kart.axleScrub > 0.25);

    cameraLabel.textContent = camera.mode;
    lineLabel.textContent = snapshot.racingLine.visible ? 'ON' : 'OFF';
    ghostLabel.textContent = ghost.mode;

    lapBadge.textContent =
      lap.lapNumber === 0 ? 'FLYING START' : `LAP ${lap.lapNumber}`;
    cleanBadge.textContent = lap.isClean ? 'CLEAN LAP' : 'DIRTY (WALL CONTACT)';
    cleanBadge.className = `clean-badge ${lap.isClean ? 'clean-ok' : 'clean-dirty'}`;

    lapTimer.textContent = `${lap.currentLapSeconds.toFixed(3)}s`;

    // Time-Delta Bar: negative = ahead (green, left/right fill), positive = behind (red)
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

    lastLapEl.textContent = formatSeconds(lap.lastLapSeconds);
    pbLapEl.textContent = formatSeconds(lap.personalBestSeconds);

    turnBadge.textContent = kart.currentTurn
      ? `TURN ${kart.currentTurn} (S${kart.currentSector})`
      : `SECTOR ${kart.currentSector}`;

    drawMinimap(snapshot);
  }

  return { update };
}
