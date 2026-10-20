import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Ticket #4: Helmet Cam & Chase Cam Switching, Cockpit Telemetry & Mini-Map Pose', () => {
  it('toggles instantaneously between Chase Cam and Helmet Cam mid-corner without disturbing Kart physics', () => {
    const session = createSimulationSession();
    expect(session.getSnapshot().camera.mode).toBe('Chase Cam');

    // Accelerate and steer into Turn 1
    for (let i = 0; i < 140; i++) {
      session.step(1 / 120, { keys: { up: true, right: true } });
    }
    const beforeToggle = session.getSnapshot();
    expect(beforeToggle.camera.mode).toBe('Chase Cam');
    expect(beforeToggle.camera.position.y).toBeGreaterThan(1.8);

    // Toggle to Helmet Cam
    const helmetSnap = session.toggleCamera();
    expect(helmetSnap.camera.mode).toBe('Helmet Cam');
    expect(helmetSnap.camera.position.y).toBeGreaterThan(0.95);
    expect(helmetSnap.camera.position.y).toBeLessThan(1.05);

    // Distance from Kart center in Helmet Cam must be within the driver seat (< 0.35m)
    const seatOffset = Math.hypot(
      helmetSnap.camera.position.x - helmetSnap.kart.position.x,
      helmetSnap.camera.position.z - helmetSnap.kart.position.z,
    );
    expect(seatOffset).toBeLessThan(0.35);

    // Kart velocity, position, and steering wheel angle remain untouched on camera toggle
    expect(helmetSnap.kart.speedKph).toBe(beforeToggle.kart.speedKph);
    expect(helmetSnap.kart.position).toEqual(beforeToggle.kart.position);
    expect(helmetSnap.kart.steeringWheelAngleRad).toBeCloseTo(
      helmetSnap.kart.steerAngleRad * 2.2,
      4,
    );

    // Toggle back to Chase Cam
    const chaseSnap = session.toggleCamera();
    expect(chaseSnap.camera.mode).toBe('Chase Cam');
  });
});
