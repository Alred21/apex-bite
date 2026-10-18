import { buildK1TorontoCircuit } from './circuit';
import {
  CameraMode,
  CameraState,
  CircuitSample,
  DriverInput,
  KartState,
  SessionSnapshot,
  TurnNumber,
} from './types';

export const FIXED_TIMESTEP_SECONDS = 1 / 120;
export const MAX_KART_SPEED_KPH = 45.0;
export const MAX_KART_SPEED_MPS = MAX_KART_SPEED_KPH / 3.6; // 12.5 m/s

const PEAK_LAUNCH_ACCEL_MPS2 = 5.4;
const MOTOR_DRAG_DECEL_MPS2 = 1.35;
const MAX_REAR_BRAKE_DECEL_MPS2 = 8.8;
const WHEELBASE_METERS = 1.06;
const MAX_STEER_ANGLE_RAD = 0.46;

export interface SimulationSession {
  step(dtSeconds?: number, input?: DriverInput): SessionSnapshot;
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
  const cameraMode: CameraMode = 'Chase Cam';

  let kart: KartState = {
    position: { ...startSample.center },
    headingRad: initialHeading,
    speedMps: 0,
    speedKph: 0,
    forwardAccelMps2: 0,
    lateralAccelMps2: 0,
    steerAngleRad: 0,
    throttleInput: 0,
    brakeInput: 0,
    lapDistanceMeters: 0,
    lapProgress: 0,
    currentTurn: null,
    currentSector: 1,
  };

  function step(dtSeconds = FIXED_TIMESTEP_SECONDS, input: DriverInput = {}): SessionSnapshot {
    const keyThrottle = input.keys?.up ? 1 : 0;
    const keyBrake = input.keys?.down ? 1 : 0;
    const keySteer = (input.keys?.right ? 1 : 0) - (input.keys?.left ? 1 : 0);

    const gpThrottle = input.gamepad?.throttle ?? 0;
    const gpBrake = input.gamepad?.brake ?? 0;
    const gpSteer = input.gamepad?.steer ?? 0;

    const throttle = Math.max(
      0,
      Math.min(1, Math.max(input.throttle ?? 0, keyThrottle, gpThrottle)),
    );
    const fullBrake = Boolean(input.fullBrake || input.keys?.space);
    const brake = fullBrake
      ? 1
      : Math.max(0, Math.min(1, Math.max(input.brake ?? 0, keyBrake, gpBrake)));

    const rawSteer =
      input.steer !== undefined
        ? input.steer
        : Math.abs(gpSteer) > 0.01
          ? gpSteer
          : keySteer;
    const steer = Math.max(-1, Math.min(1, rawSteer));

    // Direct-drive electric motor torque curve tapering into hard 45.0 km/h electronic governor
    const speedRatio = Math.min(1, kart.speedMps / MAX_KART_SPEED_MPS);
    const torqueFactor = Math.max(0.22, 1 - 0.72 * Math.pow(speedRatio, 1.8));
    const driveAccel = throttle * PEAK_LAUNCH_ACCEL_MPS2 * torqueFactor;

    // Off-throttle regenerative/motor drag + aerodynamic rolling resistance
    const coastDrag =
      kart.speedMps > 0.001
        ? (1 - throttle) * MOTOR_DRAG_DECEL_MPS2 + 0.25 * speedRatio * speedRatio
        : 0;

    const brakeDecel = kart.speedMps > 0.001 ? brake * MAX_REAR_BRAKE_DECEL_MPS2 : 0;
    const rawAccel = driveAccel - coastDrag - brakeDecel;

    const prevSpeed = kart.speedMps;
    const nextSpeedMps = Math.max(
      0,
      Math.min(MAX_KART_SPEED_MPS, prevSpeed + rawAccel * dtSeconds),
    );
    const actualForwardAccel = (nextSpeedMps - prevSpeed) / Math.max(1e-6, dtSeconds);

    const steerAngleRad = steer * MAX_STEER_ANGLE_RAD;
    const yawRate =
      nextSpeedMps > 0.05
        ? (nextSpeedMps / WHEELBASE_METERS) * Math.tan(steerAngleRad)
        : 0;
    const nextHeading = kart.headingRad + yawRate * dtSeconds;
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

    tick += 1;
    elapsedSeconds += dtSeconds;

    kart = {
      position: nextPosition,
      headingRad: nextHeading,
      speedMps: nextSpeedMps,
      speedKph: nextSpeedMps * 3.6,
      forwardAccelMps2: actualForwardAccel,
      lateralAccelMps2,
      steerAngleRad,
      throttleInput: throttle,
      brakeInput: brake,
      lapDistanceMeters: nearest.distanceMeters,
      lapProgress: nearest.progress,
      currentTurn: resolveTurnAtDistance(nearest.distanceMeters, circuit.turns),
      currentSector: nearest.sector,
    };

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
    };
  }

  return {
    step,
    getSnapshot,
  };
}
