export const FIXED_TIMESTEP_SECONDS = 1 / 120;
export const MAX_KART_SPEED_KPH = 45.0;
export const MAX_KART_SPEED_MPS = MAX_KART_SPEED_KPH / 3.6; // 12.5 m/s
export const FLYING_START_SPEED_KPH = 36.0;
export const FLYING_START_SPEED_MPS = FLYING_START_SPEED_KPH / 3.6; // 10.0 m/s
export const FLYING_START_APPROACH_METERS = 13.5;
/** Approximate current Circuit coordinate; Session derives the exact start from its Reference Lap. */
export const FLYING_START_DISTANCE_METERS = 349.6;

export const PEAK_LAUNCH_ACCEL_MPS2 = 5.2;
export const MOTOR_DRAG_DECEL_MPS2 = 1.45;
export const MAX_REAR_BRAKE_DECEL_MPS2 = 8.8;
export const WHEELBASE_METERS = 1.06;
export const MAX_STEER_ANGLE_RAD = 0.46;
export const KART_HALF_WIDTH_METERS = 0.45;

export const MAX_TIRE_ACCEL_MPS2 = 10.5;

/** Encloses the detailed rental Kart, including tires at full steering lock. */
export const KART_DIMENSIONS = Object.freeze({
  halfWidthMeters: KART_HALF_WIDTH_METERS,
  frontExtentMeters: 0.88,
  rearExtentMeters: 0.80,
  wheelbaseMeters: WHEELBASE_METERS,
});
export const BARRIER_HALF_THICKNESS_METERS = 0.12;
