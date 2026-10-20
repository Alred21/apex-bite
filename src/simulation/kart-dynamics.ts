import {
  MAX_KART_SPEED_MPS, MAX_STEER_ANGLE_RAD, WHEELBASE_METERS,
  PEAK_LAUNCH_ACCEL_MPS2, MOTOR_DRAG_DECEL_MPS2, MAX_REAR_BRAKE_DECEL_MPS2,
  MAX_TIRE_ACCEL_MPS2,
} from './kart-parameters';
import type { Vector2D } from './types';
import { wrapAngleRad } from './planar-math';

export interface KartCommand { throttle: number; brake: number; steer: number; }

/** All integration state is explicit so a Reference Lap can execute the exact same solver. */
export interface PlanarKartState {
  position: Vector2D;
  headingRad: number;
  speedMps: number;
  velocity: Vector2D;
  yawRateRadPerSecond: number;
}

export function normalizeKartCommand(command: KartCommand): KartCommand {
  const clamp = (value: number, low: number, high: number): number =>
    Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : 0;
  const brake = clamp(command.brake, 0, 1);
  return {
    throttle: brake > 0 ? 0 : clamp(command.throttle, 0, 1),
    brake,
    steer: clamp(command.steer, -1, 1),
  };
}

/**
 * Grip-limited bicycle approximation with rear-only braking and continuous live-axle drag.
 * This is a deliberately small planar model, not a four-wheel suspension simulator.
 */
export function stepKartDynamics(kart: PlanarKartState, rawCommand: KartCommand, dtSeconds: number) {
  const command = normalizeKartCommand(rawCommand);
  const { throttle, brake, steer } = command;
  const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
  const steerAngleRad = steer * MAX_STEER_ANGLE_RAD;
  const demandedLateralAccel = kart.speedMps ** 2 * Math.tan(steerAngleRad) / WHEELBASE_METERS;
  const lateralLoadTransfer = Math.min(1, Math.abs(demandedLateralAccel) / MAX_TIRE_ACCEL_MPS2);
  const insideRearLoad = Math.max(0.12, 0.9 + throttle * 0.08 - brake * 0.48 - lateralLoadTransfer * 0.28);
  const axleScrub = Math.min(1, speedRatio * Math.abs(steer) * insideRearLoad);

  const motorAccel = throttle * PEAK_LAUNCH_ACCEL_MPS2 * (1 - 0.12 * speedRatio ** 2);
  // Braking shifts load away from the rear axle, progressively reducing its available grip.
  const rearLoadFraction = 0.57 - brake * 0.14;
  const rearBrakeLimit = MAX_TIRE_ACCEL_MPS2 * rearLoadFraction;
  const brakeDecel = Math.min(brake * MAX_REAR_BRAKE_DECEL_MPS2 + (1 - throttle) * MOTOR_DRAG_DECEL_MPS2, rearBrakeLimit);
  const rollingDrag = 0.22 * speedRatio ** 2;
  const scrubDrag = kart.speedMps > 0.5 ? axleScrub * 2.2 : 0;
  const longitudinalAccel = motorAccel - (kart.speedMps > 0.001 ? rollingDrag + brakeDecel + scrubDrag : 0);
  const speedMps = Math.max(0, Math.min(MAX_KART_SPEED_MPS, kart.speedMps + longitudinalAccel * dtSeconds));

  // Combined tire budget: drive/braking and turning share the same finite grip.
  const tireLongitudinalDemand = motorAccel - brakeDecel - scrubDrag;
  const lateralBudget = Math.sqrt(Math.max(0, MAX_TIRE_ACCEL_MPS2 ** 2 - tireLongitudinalDemand ** 2));
  const desiredYaw = speedMps > 0.05 ? speedMps * Math.tan(steerAngleRad) / WHEELBASE_METERS / (1 + 0.25 * axleScrub) : 0;
  const yawLimit = speedMps > 0.05 ? lateralBudget / speedMps : 0;
  const yawTarget = Math.max(-yawLimit, Math.min(yawLimit, desiredYaw));
  const response = 1 - Math.exp(-dtSeconds / 0.095);
  const yawRateRadPerSecond = Math.max(-yawLimit, Math.min(yawLimit,
    kart.yawRateRadPerSecond + (yawTarget - kart.yawRateRadPerSecond) * response));
  const headingRad = kart.headingRad + yawRateRadPerSecond * dtSeconds;
  const previousTravelHeading = kart.speedMps > 0.05 ? Math.atan2(kart.velocity.z, kart.velocity.x) : headingRad;
  const neededTravelTurn = wrapAngleRad(headingRad - previousTravelHeading);
  const maximumTravelTurn = speedMps > 0.05 ? lateralBudget / speedMps * dtSeconds : Math.PI;
  const travelTurn = Math.max(-maximumTravelTurn, Math.min(maximumTravelTurn, neededTravelTurn));
  const travelHeading = previousTravelHeading + travelTurn;
  const velocity = { x: Math.cos(travelHeading) * speedMps, z: Math.sin(travelHeading) * speedMps };
  const position = { x: kart.position.x + velocity.x * dtSeconds, z: kart.position.z + velocity.z * dtSeconds };
  const lateralAccelMps2 = speedMps * travelTurn / dtSeconds;
  const gripDemandRatio = Math.abs(demandedLateralAccel) / Math.max(0.1, lateralBudget);
  const slipRatio = Math.min(1, Math.max(axleScrub, Math.abs(Math.sin(headingRad - travelHeading)), 1 - 1 / Math.max(1, gripDemandRatio)));
  const isTrailBraking = speedMps > 2 && Math.abs(steer) > 0.08 && brake > 0.05 && brake < 0.8;
  return {
    position, headingRad, velocity, yawRateRadPerSecond, speedMps,
    forwardAccelMps2: (speedMps - kart.speedMps) / dtSeconds,
    lateralAccelMps2, steerAngleRad, isTrailBraking, axleScrub, slipRatio,
    throttleInput: throttle, brakeInput: brake,
  };
}
