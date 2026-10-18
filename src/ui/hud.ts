import { SessionSnapshot } from '../simulation/types';

export interface HudView {
  update(snapshot: SessionSnapshot): void;
}

export function createHudView(root: HTMLElement): HudView {
  root.innerHTML = `
    <div></div>
    <div></div>
    <div class="hud-panel hud-bottom-cluster" aria-label="Driver Cluster">
      <div class="speedometer">
        <div class="speed-value" id="hud-speed-kph">0.0</div>
        <div class="speed-unit">km/h</div>
      </div>
    </div>
  `;

  const speedEl = root.querySelector<HTMLElement>('#hud-speed-kph')!;

  function update(snapshot: SessionSnapshot): void {
    speedEl.textContent = snapshot.kart.speedKph.toFixed(1);
  }

  return { update };
}
