import { SessionSnapshot } from '../simulation/types';

export interface HudCallbacks {
  onToggleCamera?: () => void;
}

export interface HudView {
  update(snapshot: SessionSnapshot): void;
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
        </div>
      </div>

      <div></div>

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
  `;

  const speedEl = root.querySelector<HTMLElement>('#hud-speed-kph')!;
  const throttleBar = root.querySelector<HTMLElement>('#hud-throttle-bar')!;
  const brakeBar = root.querySelector<HTMLElement>('#hud-brake-bar')!;
  const scrubBar = root.querySelector<HTMLElement>('#hud-scrub-bar')!;
  const trailPill = root.querySelector<HTMLElement>('#hud-trail-pill')!;
  const cameraBtn = root.querySelector<HTMLButtonElement>('#hud-btn-camera')!;
  const cameraLabel = root.querySelector<HTMLElement>('#hud-camera-label')!;
  const turnBadge = root.querySelector<HTMLElement>('#hud-turn-badge')!;
  const minimapCanvas = root.querySelector<HTMLCanvasElement>('#hud-minimap-canvas')!;
  const minimapCtx = minimapCanvas.getContext('2d')!;

  cameraBtn.addEventListener('click', () => {
    callbacks.onToggleCamera?.();
    cameraBtn.blur();
  });

  function drawMinimap(snapshot: SessionSnapshot): void {
    const { circuit, kart } = snapshot;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);

    // Map world bounds (-48..52 x, -44..36 z) into canvas coordinates
    const scale = 1.85;
    const offsetX = w * 0.48;
    const offsetZ = h * 0.54;
    const toX = (x: number): number => offsetX + x * scale;
    const toY = (z: number): number => offsetZ + z * scale;

    // Draw Circuit loop outline
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

    // Start/Finish line tick
    const s0 = circuit.samples[0];
    minimapCtx.beginPath();
    minimapCtx.moveTo(toX(s0.leftBarrier.x), toY(s0.leftBarrier.z));
    minimapCtx.lineTo(toX(s0.rightBarrier.x), toY(s0.rightBarrier.z));
    minimapCtx.lineWidth = 3;
    minimapCtx.strokeStyle = '#facc15';
    minimapCtx.stroke();

    // Numbered Turns 1..11
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
    const { kart, camera } = snapshot;
    speedEl.textContent = kart.speedKph.toFixed(1);
    throttleBar.style.width = `${Math.round(kart.throttleInput * 100)}%`;
    brakeBar.style.width = `${Math.round(kart.brakeInput * 100)}%`;
    scrubBar.style.width = `${Math.round(kart.axleScrub * 100)}%`;

    trailPill.classList.toggle('active-trail', kart.isTrailBraking);
    scrubBar.classList.toggle('high-scrub', kart.axleScrub > 0.25);

    cameraLabel.textContent = camera.mode;
    turnBadge.textContent = kart.currentTurn
      ? `TURN ${kart.currentTurn} (S${kart.currentSector})`
      : `SECTOR ${kart.currentSector}`;

    drawMinimap(snapshot);
  }

  return { update };
}
