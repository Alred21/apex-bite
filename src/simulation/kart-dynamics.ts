import { MAX_KART_SPEED_MPS, MAX_STEER_ANGLE_RAD, WHEELBASE_METERS, PEAK_LAUNCH_ACCEL_MPS2, MOTOR_DRAG_DECEL_MPS2, MAX_REAR_BRAKE_DECEL_MPS2 } from './kart-parameters';
import type { KartState } from './types';

export interface KartCommand { throttle: number; brake: number; steer: number; }

/** Pure player/reference dynamics; has no Session or Racing Line dependency. */
export function stepKartDynamics(kart: Pick<KartState, 'position' | 'headingRad' | 'speedMps'>, command: KartCommand, dtSeconds: number) {
  const { throttle, brake } = command;
  const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
    const steerAngleRad = command.steer * MAX_STEER_ANGLE_RAD;
    const absSteerNorm = Math.abs(steerAngleRad) / MAX_STEER_ANGLE_RAD;

    const isTrailBraking =
      kart.speedMps > 2.0 &&
      absSteerNorm > 0.08 &&
      brake >= 0.2 &&
      brake <= 0.72;

    // Continuous planar four-tire longitudinal & lateral load transfer
    const longWeightTransfer = isTrailBraking
      ? 0.42 + brake * 0.22
      : brake > 0.72
        ? 0.32
        : brake > 0.01
          ? brake * 0.35
          : -throttle * 0.12;
    const latWeightTransfer = Math.min(0.28, (kart.speedMps / MAX_KART_SPEED_MPS) * absSteerNorm * 0.24);
    const insideRearUnload = Math.max(
      -0.15,
      Math.min(0.74, longWeightTransfer + (isTrailBraking ? latWeightTransfer * 0.35 : 0)),
    );

    const rawAxleScrub =
      speedRatio *
      absSteerNorm *
      1.15 *
      Math.max(0.18, 0.92 - insideRearUnload);
    const axleScrub = Math.max(0, Math.min(1, rawAxleScrub));

    // Direct-drive electric motor torque curve tapering into hard 45.0 km/h electronic governor
    const torqueFactor = Math.max(0.88, 1 - 0.12 * Math.pow(speedRatio, 1.8));
    const driveAccel = throttle * PEAK_LAUNCH_ACCEL_MPS2 * torqueFactor;

    const coastDrag =
      kart.speedMps > 0.001
        ? (1 - throttle) * MOTOR_DRAG_DECEL_MPS2 + 0.22 * speedRatio * speedRatio
        : 0;
    const scrubDrag = kart.speedMps > 0.5 ? axleScrub * 2.2 : 0;

    const effectiveBrakeDecelFactor = isTrailBraking ? 0.55 : 1.0;
    const brakeDecel =
      kart.speedMps > 0.001
        ? brake * MAX_REAR_BRAKE_DECEL_MPS2 * effectiveBrakeDecelFactor
        : 0;
    const rawAccel = driveAccel - coastDrag - scrubDrag - brakeDecel;

    const prevSpeed = kart.speedMps;
    const nextSpeedMps = Math.max(
      0,
      Math.min(MAX_KART_SPEED_MPS, prevSpeed + rawAccel * dtSeconds),
    );

    const understeerPenalty = 1 - 0.36 * axleScrub;
    const trailRotationBoost =
      isTrailBraking ? 1.28 : brake > 0.85 && absSteerNorm > 0.2 ? 1.35 : 1.0;
    const yawRate =
      nextSpeedMps > 0.05
        ? (nextSpeedMps / WHEELBASE_METERS) *
          Math.tan(steerAngleRad) *
          understeerPenalty *
          trailRotationBoost
        : 0;
    const nextHeading = kart.headingRad + yawRate * dtSeconds;
    const lateralAccelMps2 = nextSpeedMps * yawRate;

    const nextPosition = {
      x: kart.position.x + Math.cos(nextHeading) * nextSpeedMps * dtSeconds,
      z: kart.position.z + Math.sin(nextHeading) * nextSpeedMps * dtSeconds,
    };

  return { position: nextPosition, headingRad: nextHeading, speedMps: nextSpeedMps,
    forwardAccelMps2: rawAccel, lateralAccelMps2, steerAngleRad, isTrailBraking, axleScrub };
}
