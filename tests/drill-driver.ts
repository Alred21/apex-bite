import type { SimulationSession } from '../src/simulation/session';
import { FIXED_TIMESTEP_SECONDS } from '../src/simulation/session';
import { analogReferenceCommand } from './analog-driver';

/** Ordinary analog driver; variations are visible inputs, never injected Kart state. */
export function driveDrillVariant(session: SimulationSession, speedScale: number, turn2Offset = 0, steeringOscillation = 0) {
  let snapshot = session.getSnapshot();
  const runNumber = snapshot.drill.runNumber;
  for (let tick = 0; tick < 8000; tick++) {
    const distanceToTurn2 = snapshot.kart.lapDistanceMeters - snapshot.circuit.turns[1].apexDistanceMeters;
    const offset = turn2Offset * Math.exp(-((distanceToTurn2 / 6) ** 2));
    snapshot = session.step(FIXED_TIMESTEP_SECONDS, analogReferenceCommand(snapshot, speedScale, {
      lateralOffsetMeters: offset,
      steeringAdjustment: steeringOscillation * Math.sin(tick * Math.PI / 12),
    }));
    if (snapshot.drill.lastExecutionCard?.runNumber === runNumber) return snapshot.drill.lastExecutionCard;
  }
  throw new Error('Driver did not complete the Corner Drill.');
}
