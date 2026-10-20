import type { SimulationSession } from '../src/simulation/session';
import { analogReferenceCommand } from './analog-driver';

/** An ordinary analog test driver observing only public Session snapshots. */
export function driveReference(session: SimulationSession, maxSteps: number, speedScale = 1, stopOnLapNumber?: number) {
  let snap = session.getSnapshot();
  for (let tick = 0; tick < maxSteps; tick++) {
    snap = session.step(1 / 120, analogReferenceCommand(snap, speedScale));
    if (stopOnLapNumber !== undefined && snap.lap.lapNumber >= stopOnLapNumber) break;
    if (snap.timeTrial.status === 'Finished') break;
  }
  return snap;
}
