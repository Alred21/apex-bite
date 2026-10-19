import { createSimulationSession } from '../../src/simulation/session';
import { createCircuitRenderer } from '../../src/render/scene';
import { createHudView } from '../../src/ui/hud';
import { driveDrillVariant } from '../drill-driver';

const session = createSimulationSession();
session.selectDrillTarget('T1-T3');
const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot());
const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, { onReset: () => { session.reset(); render(); } });
function render(): void { const snapshot = session.getSnapshot(); renderer.render(snapshot); hud.update(snapshot); }
render();
document.querySelector('#run')!.addEventListener('click', () => {
  session.selectDrillTarget('T1-T3'); session.reset();
  const card = driveDrillVariant(session, 0.85, 0.9);
  render();
  document.querySelector('#result')!.textContent = `${card.isClean ? 'CLEAN' : 'CONTACT'} · ${card.coachingCategory} · ${card.deltaToBenchmarkSeconds.toFixed(3)}s vs reference`;
});
