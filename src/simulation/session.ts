import { buildK1TorontoCircuit } from './circuit';
import { evaluateLiveRacingLine } from './racing-line';
import {
  CameraMode,
  CameraState,
  CircuitSample,
  DriverInput,
  KartState,
  LapSummaryState,
  SessionSnapshot,
  TurnNumber,
} from './types';

export const FIXED_TIMESTEP_SECONDS = 1 / 120;
export const MAX_KART_SPEED_KPH = 45.0;
export const MAX_KART_SPEED_MPS = MAX_KART_SPEED_KPH / 3.6; // 12.5 m/s

const PEAK_LAUNCH_ACCEL_MPS2 = 6.8;
const MOTOR_DRAG_DECEL_MPS2 = 1.45;
const MAX_REAR_BRAKE_DECEL_MPS2 = 8.8;
const WHEELBASE_METERS = 1.06;
const MAX_STEER_ANGLE_RAD = 0.46;
const KART_HALF_WIDTH_METERS = 0.66;

export interface SimulationSession {
  step(dtSeconds?: number, input?: DriverInput): SessionSnapshot;
  toggleCamera(): SessionSnapshot;
  toggleRacingLine(): SessionSnapshot;
  getSnapshot(): SessionSnapshot;
}

function findNearestCircuitSample(
  samples: CircuitSample[],
  x: number,
  z: number,
): CircuitSample {
  let best = samples[0];
  let bestDistSq = Infinity;
  for (const s of samples) {
    const dx = x - s.center.x;
    const dz = z - s.center.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = s;
    }
  }
  return best;
}

function resolveTurnAtDistance(
  distanceMeters: number,
  turns: ReturnType<typeof buildK1TorontoCircuit>['turns'],
): TurnNumber | null {
  for (const t of turns) {
    if (distanceMeters >= t.entryDistanceMeters && distanceMeters <= t.exitDistanceMeters) {
      return t.number;
    }
  }
  return null;
}

function computeCameraState(kart: KartState, mode: CameraMode): CameraState {
  const forwardX = Math.cos(kart.headingRad);
  const forwardZ = Math.sin(kart.headingRad);

  if (mode === 'Helmet Cam') {
    return {
      mode,
      position: {
        x: kart.position.x - forwardX * 0.12,
        y: 0.78,
        z: kart.position.z - forwardZ * 0.12,
      },
      lookAt: {
        x: kart.position.x + forwardX * 8.0,
        y: 0.45,
        z: kart.position.z + forwardZ * 8.0,
      },
    };
  }

  return {
    mode: 'Chase Cam',
    position: {
      x: kart.position.x - forwardX * 4.2,
      y: 2.1,
      z: kart.position.z - forwardZ * 4.2,
    },
    lookAt: {
      x: kart.position.x + forwardX * 3.5,
      y: 0.4,
      z: kart.position.z + forwardZ * 3.5,
    },
  };
}

export function createSimulationSession(): SimulationSession {
  const circuit = buildK1TorontoCircuit();
  const startSample = circuit.samples[0];
  const initialHeading = Math.atan2(startSample.tangent.z, startSample.tangent.x);

  let tick = 0;
  let elapsedSeconds = 0;
  let cameraMode: CameraMode = 'Chase Cam';
  let racingLineVisible = true;

  // Progressive keyboard input shaper state
  let keyboardBrakeHoldSeconds = 0;
  let smoothedSteer = 0;

  let lap: LapSummaryState = {
    isClean: true,
    currentLapSeconds: 0,
    lapNumber: 1,
  };

  let kart: KartState = {
    position: { ...startSample.center },
    headingRad: initialHeading,
    speedMps: 0,
    speedKph: 0,
    forwardAccelMps2: 0,
    lateralAccelMps2: 0,
    steerAngleRad: 0,
    steeringWheelAngleRad: 0,
    throttleInput: 0,
    brakeInput: 0,
    isTrailBraking: false,
    axleScrub: 0,
    slipRatio: 0,
    barrierContact: false,
    barrierContactCount: 0,
    lapDistanceMeters: 0,
    lapProgress: 0,
    currentTurn: null,
    currentSector: 1,
  };

  function step(dtSeconds = FIXED_TIMESTEP_SECONDS, input: DriverInput = {}): SessionSnapshot {
    const keyThrottle = input.keys?.up ? 1 : 0;
    const gpThrottle = input.gamepad?.throttle ?? 0;
    const throttle = Math.max(
      0,
      Math.min(1, Math.max(input.throttle ?? 0, keyThrottle, gpThrottle)),
    );

    // Two-stage progressive brake curve on keyboard S / ArrowDown vs Spacebar full lock
    const fullBrake = Boolean(input.fullBrake || input.keys?.space);
    let shapedKeyBrake = 0;
    if (input.keys?.down) {
      keyboardBrakeHoldSeconds += dtSeconds;
      if (keyboardBrakeHoldSeconds <= 0.25) {
        // Stage 1 (first 250ms): controlled Trail Braking pressure window (0.38 -> 0.54)
        shapedKeyBrake = 0.38 + (keyboardBrakeHoldSeconds / 0.25) * 0.16;
      } else {
        // Stage 2 (>250ms): ramp smoothly toward full rear braking
        const extra = Math.min(1, (keyboardBrakeHoldSeconds - 0.25) / 0.3);
        shapedKeyBrake = 0.54 + extra * 0.46;
      }
    } else {
      keyboardBrakeHoldSeconds = 0;
    }

    const gpBrake = input.gamepad?.brake ?? 0;
    const brake = fullBrake
      ? 1.0
      : Math.max(0, Math.min(1, Math.max(input.brake ?? 0, shapedKeyBrake, gpBrake)));

    // Slip-aware progressive steering for keyboard vs direct analog input
    const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
    const keySteerTarget = (input.keys?.right ? 1 : 0) - (input.keys?.left ? 1 : 0);
    const hasDirectSteer =
      input.steer !== undefined || Math.abs(input.gamepad?.steer ?? 0) > 0.01;

    if (hasDirectSteer) {
      const direct =
        input.steer !== undefined ? input.steer : (input.gamepad?.steer ?? 0);
      smoothedSteer = Math.max(-1, Math.min(1, direct));
    } else if (keySteerTarget !== 0) {
      // Limit peak steering angle at high speed to avoid instant front tire scrub
      const slipAwareLimit = 1.0 - 0.34 * speedRatio;
      const target = keySteerTarget * slipAwareLimit;
      const rate = 3.8 * dtSeconds;
      if (smoothedSteer < target) {
        smoothedSteer = Math.min(target, smoothedSteer + rate);
      } else {
        smoothedSteer = Math.max(target, smoothedSteer - rate);
      }
    } else {
      const returnRate = 6.5 * dtSeconds;
      if (Math.abs(smoothedSteer) <= returnRate) {
        smoothedSteer = 0;
      } else {
        smoothedSteer -= Math.sign(smoothedSteer) * returnRate;
      }
    }

    const steerAngleRad = smoothedSteer * MAX_STEER_ANGLE_RAD;
    const absSteerNorm = Math.abs(steerAngleRad) / MAX_STEER_ANGLE_RAD;

    // Trail Braking detection: controlled rear braking (0.20..0.72) while turning at speed
    const isTrailBraking =
      kart.speedMps > 2.0 &&
      absSteerNorm > 0.08 &&
      brake >= 0.2 &&
      brake <= 0.72;

    // Solid rear live axle scrub model:
    // Without forward weight transfer (braking) unloading the inside rear tire,
    // turning tightly forces both rear wheels to rotate at the same speed, scrubbing speed & resisting yaw.
    const forwardPitchUnload = isTrailBraking
      ? 0.58
      : brake > 0.72
        ? 0.32
        : throttle > 0.5
          ? -0.12 // on-power squats the rear, loading both rear tires further
          : 0.0;

    const rawAxleScrub =
      speedRatio *
      absSteerNorm *
      1.15 *
      Math.max(0.18, 0.92 - forwardPitchUnload);
    const axleScrub = Math.max(0, Math.min(1, rawAxleScrub));

    // Direct-drive electric motor torque curve tapering into hard 45.0 km/h electronic governor
    const torqueFactor = Math.max(0.32, 1 - 0.62 * Math.pow(speedRatio, 1.8));
    const driveAccel = throttle * PEAK_LAUNCH_ACCEL_MPS2 * torqueFactor;

    // Off-throttle regenerative/motor drag + aerodynamic rolling resistance + solid-axle scrub drag
    const coastDrag =
      kart.speedMps > 0.001
        ? (1 - throttle) * MOTOR_DRAG_DECEL_MPS2 + 0.25 * speedRatio * speedRatio
        : 0;
    const scrubDrag = kart.speedMps > 0.5 ? axleScrub * 2.2 : 0;

    // During light Trail Braking into a corner, part of the rear brake effort goes into rotating the chassis rather than pure straight-line stopping
    const effectiveBrakeDecelFactor = isTrailBraking ? 0.55 : 1.0;
    const brakeDecel =
      kart.speedMps > 0.001
        ? brake * MAX_REAR_BRAKE_DECEL_MPS2 * effectiveBrakeDecelFactor
        : 0;
    const rawAccel = driveAccel - coastDrag - scrubDrag - brakeDecel;

    const prevSpeed = kart.speedMps;
    let nextSpeedMps = Math.max(
      0,
      Math.min(MAX_KART_SPEED_MPS, prevSpeed + rawAccel * dtSeconds),
    );

    // Yaw rotation: solid-axle scrub resists turn-in (understeer), whereas Trail Braking unloads the rear and rotates toward the apex
    const understeerPenalty = 1 - 0.36 * axleScrub;
    const trailRotationBoost = isTrailBraking ? 1.28 : brake > 0.85 && absSteerNorm > 0.2 ? 1.35 : 1.0;
    const yawRate =
      nextSpeedMps > 0.05
        ? (nextSpeedMps / WHEELBASE_METERS) *
          Math.tan(steerAngleRad) *
          understeerPenalty *
          trailRotationBoost
        : 0;
    let nextHeading = kart.headingRad + yawRate * dtSeconds;
    const lateralAccelMps2 = nextSpeedMps * yawRate;

    const nextPosition = {
      x: kart.position.x + Math.cos(nextHeading) * nextSpeedMps * dtSeconds,
      z: kart.position.z + Math.sin(nextHeading) * nextSpeedMps * dtSeconds,
    };

    const nearest = findNearestCircuitSample(
      circuit.samples,
      nextPosition.x,
      nextPosition.z,
    );

    // Continuous indoor Barrier collision & tangential wall friction
    const relX = nextPosition.x - nearest.center.x;
    const relZ = nextPosition.z - nearest.center.z;
    const lateralOffset = relX * nearest.normal.x + relZ * nearest.normal.z;
    const maxLateral = nearest.widthMeters * 0.5 - KART_HALF_WIDTH_METERS;

    let barrierContact = false;
    let barrierContactCount = kart.barrierContactCount;

    if (Math.abs(lateralOffset) > maxLateral) {
      barrierContact = true;
      const isInitialImpact = !kart.barrierContact;
      if (isInitialImpact) {
        barrierContactCount += 1;
      }
      lap.isClean = false;

      // Place Kart just inside the barrier surface so it can slide tangentially
      const clampedLat = Math.sign(lateralOffset) * (maxLateral - 0.015);
      const alongTang = relX * nearest.tangent.x + relZ * nearest.tangent.z;
      nextPosition.x =
        nearest.center.x +
        nearest.tangent.x * alongTang +
        nearest.normal.x * clampedLat;
      nextPosition.z =
        nearest.center.z +
        nearest.tangent.z * alongTang +
        nearest.normal.z * clampedLat;

      // Measure impact angle relative to barrier tangent
      const trackHeading = Math.atan2(nearest.tangent.z, nearest.tangent.x);
      let angleDiff = nextHeading - trackHeading;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const sinImpact = Math.abs(Math.sin(angleDiff));

      if (isInitialImpact) {
        // Initial impact scrubs momentum proportionally to impact angle (min 6% graze scrub)
        const impactLoss = Math.min(0.55, Math.max(0.06, sinImpact * 0.65));
        nextSpeedMps *= 1 - impactLoss;
      }

      // Continuous tangential wall friction while rubbing against the barrier
      const wallFrictionDecel = (2.6 + sinImpact * 6.0) * dtSeconds;
      nextSpeedMps = Math.max(0, nextSpeedMps - wallFrictionDecel);

      // Deflect heading to align with the barrier tangent
      nextHeading = trackHeading + angleDiff * 0.2;
    }

    const actualForwardAccel = (nextSpeedMps - prevSpeed) / Math.max(1e-6, dtSeconds);
    const slipRatio = Math.min(
      1,
      Math.max(axleScrub, Math.abs(lateralAccelMps2) / 14.0 + (brake > 0.8 && absSteerNorm > 0.2 ? 0.35 : 0)),
    );

    tick += 1;
    elapsedSeconds += dtSeconds;
    lap.currentLapSeconds += dtSeconds;

    kart = {
      position: nextPosition,
      headingRad: nextHeading,
      speedMps: nextSpeedMps,
      speedKph: nextSpeedMps * 3.6,
      forwardAccelMps2: actualForwardAccel,
      lateralAccelMps2,
      steerAngleRad,
      steeringWheelAngleRad: steerAngleRad * 2.2,
      throttleInput: throttle,
      brakeInput: brake,
      isTrailBraking,
      axleScrub,
      slipRatio,
      barrierContact,
      barrierContactCount,
      lapDistanceMeters: nearest.distanceMeters,
      lapProgress: nearest.progress,
      currentTurn: resolveTurnAtDistance(nearest.distanceMeters, circuit.turns),
      currentSector: nearest.sector,
    };

    return getSnapshot();
  }

  function toggleCamera(): SessionSnapshot {
    cameraMode = cameraMode === 'Chase Cam' ? 'Helmet Cam' : 'Chase Cam';
    return getSnapshot();
  }

  function toggleRacingLine(): SessionSnapshot {
    racingLineVisible = !racingLineVisible;
    return getSnapshot();
  }

  function getSnapshot(): SessionSnapshot {
    return {
      tick,
      elapsedSeconds,
      circuit,
      kart: {
        ...kart,
        position: { ...kart.position },
      },
      camera: computeCameraState(kart, cameraMode),
      lap: { ...lap },
      racingLine: evaluateLiveRacingLine(
        circuit,
        kart.lapDistanceMeters,
        kart.speedMps,
        racingLineVisible,
      ),
    };
  }

  return {
    step,
    toggleCamera,
    toggleRacingLine,
    getSnapshot,
  };
}
