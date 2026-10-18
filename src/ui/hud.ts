import { SessionSnapshot } from '../simulation/types';

export interface HudView {
  update(snapshot: SessionSnapshot): void;
}

export function createHudView(root: HTMLElement): HudView {
  root.innerHTML = `
    <div></div>
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

  function update(snapshot: SessionSnapshot): void {
    const { kart } = snapshot;
    speedEl.textContent = kart.speedKph.toFixed(1);
    throttleBar.style.width = `${Math.round(kart.throttleInput * 100)}%`;
    brakeBar.style.width = `${Math.round(kart.brakeInput * 100)}%`;
    scrubBar.style.width = `${Math.round(kart.axleScrub * 100)}%`;

    trailPill.classList.toggle('active-trail', kart.isTrailBraking);
    scrubBar.classList.toggle('high-scrub', kart.axleScrub > 0.25);
  }

  return { update };
}
