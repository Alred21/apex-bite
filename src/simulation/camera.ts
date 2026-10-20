import type { CameraMode, CameraSettings, CameraState, KartState } from './types';

/** Camera settings and pose are presentation state, never an input to dynamics. */
export function createCameraPresentation() {
  let settings: CameraSettings = { fieldOfViewDegrees: 64, motionStrength: 0.35 };
  let longitudinal = 0;
  let lateral = 0;
  let impact = 0;
  let lastContactCount = 0;

  function reset(kart: KartState): void {
    longitudinal = lateral = impact = 0;
    lastContactCount = kart.barrierContactCount;
  }

  function step(kart: KartState, dt: number): void {
    const blend = 1 - Math.exp(-dt / 0.18);
    const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
    longitudinal += (clamp(kart.forwardAccelMps2 / 8) - longitudinal) * blend;
    lateral += (clamp(kart.lateralAccelMps2 / 10) - lateral) * blend;
    // One short displacement per new contact, without oscillating screen shake.
    impact *= Math.exp(-dt / 0.1);
    if (kart.barrierContactCount > lastContactCount) {
      impact = Math.min(1, Math.abs(kart.forwardAccelMps2) / 20);
    }
    lastContactCount = kart.barrierContactCount;
  }

  function setSettings(next: Partial<CameraSettings>): void {
    if (Number.isFinite(next.fieldOfViewDegrees)) {
      settings.fieldOfViewDegrees = Math.max(50, Math.min(90, next.fieldOfViewDegrees!));
    }
    if (Number.isFinite(next.motionStrength)) {
      settings.motionStrength = Math.max(0, Math.min(1, next.motionStrength!));
    }
  }

  function getState(kart: KartState, mode: CameraMode): CameraState {
    const forwardX = Math.cos(kart.headingRad);
    const forwardZ = Math.sin(kart.headingRad);
    const helmet = mode === 'Helmet Cam';
    const strength = settings.motionStrength;
    const eyeDistance = (helmet ? -0.27 : -4.2) - longitudinal * strength * (helmet ? 0.018 : 0.1);
    const lookDistance = helmet ? 4 : 3.5;
    const sideOffset = -lateral * strength * (helmet ? 0.018 : 0.075);
    return {
      mode,
      settings: { ...settings },
      rollRad: -lateral * strength * (helmet ? 0.018 : 0.009) || 0,
      position: {
        x: kart.position.x + forwardX * eyeDistance - forwardZ * sideOffset,
        y: (helmet ? 0.99 : 2.1) + impact * strength * 0.009,
        z: kart.position.z + forwardZ * eyeDistance + forwardX * sideOffset,
      },
      // A seated-eye sightline includes hands and rim in the lower frame.
      lookAt: {
        x: kart.position.x + forwardX * lookDistance,
        y: (helmet ? -0.2 : 0.4) + longitudinal * strength * 0.12,
        z: kart.position.z + forwardZ * lookDistance,
      },
    };
  }
  return { getState, setSettings, step, reset };
}
