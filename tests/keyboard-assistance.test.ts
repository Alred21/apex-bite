import { describe, expect, it } from 'vitest';
import { createSimulationSession } from '../src/simulation/session';

const DT = 1 / 120;

describe('Keyboard Assistance through SimulationSession', () => {
  it('ramps keyboard pedals while retaining immediate analog pedals and emergency braking', () => {
    const keyboard = createSimulationSession();
    const first = keyboard.step(DT, { keys: { up: true } });
    expect(first.kart.throttleInput).toBeGreaterThan(0);
    expect(first.kart.throttleInput).toBeLessThan(0.1);
    let held = first;
    for (let i = 0; i < 35; i++) held = keyboard.step(DT, { keys: { up: true } });
    expect(held.kart.throttleInput).toBe(1);
    const firstBrake = keyboard.step(DT, { keys: { down: true } });
    expect(firstBrake.kart.brakeInput).toBeGreaterThan(0);
    expect(firstBrake.kart.brakeInput).toBeLessThan(0.1);
    expect(keyboard.step(DT, { keys: { space: true } }).kart.brakeInput).toBe(1);
    const analog = createSimulationSession();
    expect(analog.step(DT, { gamepad: { throttle: 0.7, steer: 0.4 } }).kart.throttleInput).toBe(0.7);
    expect(analog.step(DT, { gamepad: { brake: 0.6, steer: 0 } }).kart.brakeInput).toBe(0.6);
  });

  it('makes short corrections small and never unlocks full steering during a fast held key', () => {
    const tapping = createSimulationSession();
    let tap = tapping.getSnapshot();
    for (let i = 0; i < 6; i++) tap = tapping.step(DT, { keys: { up: true, right: true } });
    expect(Math.abs(tap.kart.steerAngleRad)).toBeLessThan(0.05);
    for (let i = 0; i < 12; i++) tap = tapping.step(DT, {});
    expect(tap.kart.steerAngleRad).toBe(0);

    const holding = createSimulationSession();
    let fastSamples = 0;
    for (let i = 0; i < 100; i++) {
      const snapshot = holding.step(DT, { keys: { up: true, right: true } });
      if (snapshot.kart.speedKph > 30) {
        fastSamples++;
        expect(Math.abs(snapshot.kart.steerAngleRad)).toBeLessThan(0.18);
      }
    }
    expect(fastSamples).toBeGreaterThan(20);
  });

  it('adjusts keyboard sensitivity while preserving analog response and settings across reset', () => {
    const gentle = createSimulationSession();
    const responsive = createSimulationSession();
    gentle.setKeyboardAssistance({ steeringSensitivity: 0.5 });
    responsive.setKeyboardAssistance({ steeringSensitivity: 1.5 });
    let a = gentle.getSnapshot();
    let b = responsive.getSnapshot();
    for (let i = 0; i < 6; i++) {
      a = gentle.step(DT, { keys: { right: true } });
      b = responsive.step(DT, { keys: { right: true } });
    }
    expect(b.kart.steerAngleRad).toBeGreaterThan(a.kart.steerAngleRad * 2);
    gentle.reset();
    responsive.reset();
    expect(gentle.getSnapshot().keyboardAssistance.steeringSensitivity).toBe(0.5);
    for (let i = 0; i < 15; i++) {
      const input = { gamepad: { throttle: 0.6, steer: 0.3 } };
      a = gentle.step(DT, input);
      b = responsive.step(DT, input);
    }
    expect(a.kart).toEqual(b.kart);
    expect(gentle.setKeyboardAssistance({ steeringSensitivity: Number.NaN }).keyboardAssistance.steeringSensitivity).toBe(0.5);
  });

  it('reverses predictably, releases held controls, and accepts neutral analog input immediately', () => {
    const session = createSimulationSession();
    for (let i = 0; i < 6; i++) session.step(DT, { keys: { left: true, up: true } });
    expect(session.getSnapshot().kart.steerAngleRad).toBeLessThan(0);
    for (let i = 0; i < 12; i++) session.step(DT, { keys: { right: true, up: true } });
    expect(session.getSnapshot().kart.steerAngleRad).toBeGreaterThan(0);
    session.releaseDriverInputs();
    const released = session.step(DT, {});
    expect(released.kart.steerAngleRad).toBe(0);
    expect(released.kart.throttleInput).toBe(0);
    expect(released.kart.brakeInput).toBe(0);
    session.step(DT, { gamepad: { steer: 0.8, throttle: 0.7 } });
    const neutral = session.step(DT, { gamepad: { steer: 0, throttle: 0, brake: 0 } });
    expect(neutral.kart.steerAngleRad).toBe(0);
    expect(neutral.kart.throttleInput).toBe(0);
    expect(neutral.kart.brakeInput).toBe(0);
  });

  it('keeps keyboard response consistent when a neutral gamepad is connected', () => {
    const keyboardOnly = createSimulationSession();
    const connectedPad = createSimulationSession();
    for (let tick = 0; tick < 24; tick++) {
      const keys = tick < 12 ? { up: true, right: true } : {};
      const a = keyboardOnly.step(DT, { keys });
      const b = connectedPad.step(DT, { keys, gamepad: { steer: 0, throttle: 0, brake: 0 } });
      expect(b.kart).toEqual(a.kart);
    }
  });
});
