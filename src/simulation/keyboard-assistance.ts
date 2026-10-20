import type { DriverInput, KeyboardAssistanceSettings } from './types';
import type { KartCommand } from './kart-dynamics';
import { MAX_KART_SPEED_MPS, MAX_STEER_ANGLE_RAD, MAX_TIRE_ACCEL_MPS2, WHEELBASE_METERS } from './kart-parameters';

const finite = (value: number | undefined): number => Number.isFinite(value) ? value! : 0;
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));
const approach = (value: number, target: number, amount: number): number =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);

/** Translates digital keys into commands; analog commands remain immediate. */
export function createKeyboardAssistance() {
  let throttle = 0;
  let brake = 0;
  let steer = 0;
  let steeringFromKeyboard = true;
  const settings: KeyboardAssistanceSettings = { steeringSensitivity: 1 };

  function setSettings(next: Partial<KeyboardAssistanceSettings>): void {
    if (Number.isFinite(next.steeringSensitivity)) {
      settings.steeringSensitivity = clamp(next.steeringSensitivity!, 0.5, 1.75);
    }
  }

  function reset(): void {
    throttle = brake = steer = 0;
    steeringFromKeyboard = true;
  }

  function step(input: DriverInput, speedMps: number, dt: number): KartCommand {
    throttle = approach(throttle, input.keys?.up ? 1 : 0, dt / (input.keys?.up ? 0.3 : 0.1));
    brake = approach(brake, input.keys?.down ? 1 : 0, dt / (input.keys?.down ? 0.22 : 0.08));
    if (!input.keys?.up && (input.throttle !== undefined || finite(input.gamepad?.throttle) > 0)) throttle = 0;
    if (!input.keys?.down && (input.brake !== undefined || finite(input.gamepad?.brake) > 0)) brake = 0;
    const commandThrottle = input.throttle !== undefined && !input.keys?.up
      ? clamp(finite(input.throttle)) : clamp(Math.max(throttle, finite(input.throttle), finite(input.gamepad?.throttle)));
    const commandBrake = input.fullBrake || input.keys?.space ? 1
      : input.brake !== undefined && !input.keys?.down ? clamp(finite(input.brake))
      : clamp(Math.max(brake, finite(input.brake), finite(input.gamepad?.brake)));

    const keyDirection = (input.keys?.right ? 1 : 0) - (input.keys?.left ? 1 : 0);
    const rawGamepad = finite(input.gamepad?.steer);
    const deadzone = Number.isFinite(input.gamepad?.deadzone) ? clamp(input.gamepad!.deadzone!) : 0.06;
    const gamepadSteer = Math.abs(rawGamepad) > deadzone ? rawGamepad : 0;
    if (input.steer !== undefined || (!keyDirection &&
      (Math.abs(gamepadSteer) > 0 || (!steeringFromKeyboard && input.gamepad?.steer !== undefined)))) {
      steeringFromKeyboard = false;
      steer = clamp(input.steer !== undefined ? finite(input.steer) : gamepadSteer, -1, 1);
    } else if (keyDirection) {
      steeringFromKeyboard = true;
      const speedRatio = Math.min(1, speedMps / MAX_KART_SPEED_MPS);
      // A held button cannot unlock steering beyond this speed-based limit.
      // Lower speeds naturally permit tight Turns; braking remains the driver's job.
      const angleLimit = Math.atan(WHEELBASE_METERS * MAX_TIRE_ACCEL_MPS2 * 0.9 / Math.max(0.1, speedMps ** 2));
      const limit = Math.min(1, angleLimit / MAX_STEER_ANGLE_RAD);
      const reversing = steer * keyDirection < 0;
      const rate = (0.85 + 0.9 * (1 - speedRatio)) * settings.steeringSensitivity * (reversing ? 1.7 : 1);
      steer = clamp(approach(steer, keyDirection * limit, rate * dt), -limit, limit);
    } else {
      steer = approach(steer, 0, 3.8 * settings.steeringSensitivity * dt);
    }
    return { throttle: commandThrottle, brake: commandBrake, steer };
  }
  return { step, reset, setSettings, getSettings: () => ({ ...settings }) };
}
