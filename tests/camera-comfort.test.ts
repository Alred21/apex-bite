import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

describe('Camera comfort through SimulationSession', () => {
  it('retains adjustable field of view and fully disabled motion across reset and view changes', () => {
    const session = createSimulationSession();
    session.setCameraSettings({ fieldOfViewDegrees: 76, motionStrength: 0 });
    for (let i = 0; i < 35; i++) session.step(1 / 120, { throttle: 1, steer: 0.25 });
    const before = session.getSnapshot();
    expect(before.camera.settings).toEqual({ fieldOfViewDegrees: 76, motionStrength: 0 });
    expect(before.camera.rollRad).toBe(0);
    const helmet = session.toggleCamera();
    expect(helmet.camera.mode).toBe('Helmet Cam');
    expect(helmet.camera.settings).toEqual(before.camera.settings);
    expect(helmet.kart).toEqual(before.kart);
    const reset = session.reset();
    expect(reset.camera.settings).toEqual(before.camera.settings);
    expect(reset.camera.rollRad).toBe(0);
  });

  it('places Helmet Cam at a seated adult eye height while retaining a clear forward sightline', () => {
    const session = createSimulationSession();
    session.setCameraSettings({ motionStrength: 0 });
    const snapshot = session.toggleCamera();
    expect(snapshot.camera.position.y).toBeGreaterThanOrEqual(0.95);
    expect(snapshot.camera.position.y).toBeLessThanOrEqual(1.05);
    expect(snapshot.camera.lookAt.y).toBeLessThan(snapshot.camera.position.y);
    // A gentle downward angle leaves the track ahead rather than the lap in view.
    const distance = Math.hypot(snapshot.camera.lookAt.x - snapshot.camera.position.x,
      snapshot.camera.lookAt.z - snapshot.camera.position.z);
    expect((snapshot.camera.position.y - snapshot.camera.lookAt.y) / distance).toBeLessThan(0.3);
  });

  it('adds bounded feedback without changing Kart motion, Ghost Karts or portable records', () => {
    const still = createSimulationSession();
    const feedback = createSimulationSession();
    still.setCameraSettings({ motionStrength: 0 });
    feedback.setCameraSettings({ motionStrength: 1 });
    for (let i = 0; i < 40; i++) {
      const input = { throttle: 1, steer: 0.25 };
      still.step(1 / 120, input);
      feedback.step(1 / 120, input);
    }
    const a = still.getSnapshot();
    const b = feedback.getSnapshot();
    expect(b.kart).toEqual(a.kart);
    expect(b.ghost).toEqual(a.ghost);
    expect(b.lap).toEqual(a.lap);
    expect(feedback.exportTrainingDataJson()).toBe(still.exportTrainingDataJson());
    expect(Math.abs(b.camera.rollRad)).toBeGreaterThan(0.0001);
    expect(Math.abs(b.camera.rollRad)).toBeLessThan(Math.PI / 90);
    expect(Math.hypot(
      b.camera.position.x - a.camera.position.x,
      b.camera.position.y - a.camera.position.y,
      b.camera.position.z - a.camera.position.z,
    )).toBeLessThan(0.15);
    expect(feedback.getSnapshot().camera).toEqual(b.camera);
    feedback.setCameraSettings({ motionStrength: 0 });
    expect(feedback.getSnapshot().camera).toEqual(a.camera);
  });

  it('keeps settings finite and starts view switches and resets without inherited camera feedback', () => {
    const session = createSimulationSession();
    expect(session.setCameraSettings({ fieldOfViewDegrees: 400, motionStrength: 3 }).camera.settings)
      .toEqual({ fieldOfViewDegrees: 90, motionStrength: 1 });
    expect(session.setCameraSettings({ fieldOfViewDegrees: Number.NaN, motionStrength: Number.NaN }).camera.settings)
      .toEqual({ fieldOfViewDegrees: 90, motionStrength: 1 });
    for (let i = 0; i < 30; i++) session.step(1 / 120, { throttle: 1, steer: 0.3 });
    expect(Math.abs(session.getSnapshot().camera.rollRad)).toBeGreaterThan(0);
    expect(session.toggleCamera().camera.rollRad).toBe(0);
    for (let i = 0; i < 30; i++) session.step(1 / 120, { throttle: 1, steer: 0.3 });
    expect(session.reset().camera.rollRad).toBe(0);
    expect(session.setCameraSettings({ fieldOfViewDegrees: 10, motionStrength: -3 }).camera.settings)
      .toEqual({ fieldOfViewDegrees: 50, motionStrength: 0 });
  });

  it('lets a Barrier-contact camera impulse settle instead of shaking continuously', () => {
    const session = createSimulationSession();
    session.setCameraSettings({ motionStrength: 1 });
    let snapshot = session.getSnapshot();
    for (let i = 0; i < 600 && !snapshot.kart.barrierContact; i++) {
      snapshot = session.step(1 / 120, { throttle: 1 });
    }
    expect(snapshot.kart.barrierContact).toBe(true);
    expect(snapshot.camera.position.y).toBeGreaterThan(2.101);
    const impactHeight = snapshot.camera.position.y;
    for (let i = 0; i < 120; i++) snapshot = session.step(1 / 120, { brake: 1 });
    expect(snapshot.camera.position.y).toBeLessThan(impactHeight - 0.001);
    expect(snapshot.camera.position.y).toBeLessThan(2.101);
  });
});
