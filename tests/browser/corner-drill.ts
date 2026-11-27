import { createSimulationSession } from '../../src/simulation/session';
import { preloadRendererAssets } from '../../src/render/assets';
import { createCircuitRenderer } from '../../src/render/scene';
import { createHudView } from '../../src/ui/hud';
import { driveDrillVariant } from '../drill-driver';

async function boot(): Promise<void> {
  const assets = await preloadRendererAssets();
  const session = createSimulationSession();
  session.selectDrillTarget('T1-T3');
  const renderer = createCircuitRenderer(document.querySelector<HTMLCanvasElement>('#viewport')!, session.getSnapshot(), assets);
  const hud = createHudView(document.querySelector<HTMLElement>('#hud-root')!, { onReset: () => { session.reset(); render(); } });
  function render(): void { const snapshot = session.getSnapshot(); renderer.render(snapshot); hud.update(snapshot); }
  render();
  document.querySelector('#run')!.addEventListener('click', () => {
    session.selectDrillTarget('T1-T3'); session.reset();
    const card = driveDrillVariant(session, 0.85, 0.9);
    render();
    document.querySelector('#result')!.textContent = `${card.isClean ? 'CLEAN' : 'CONTACT'} · ${card.coachingCategory} · ${card.deltaToBenchmarkSeconds.toFixed(3)}s vs reference`;
  });
}

void boot();
