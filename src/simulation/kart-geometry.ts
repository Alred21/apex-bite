import { KART_WHEEL_GEOMETRY } from './kart-parameters';
import type { KartState, TurnDirection, Vector2D } from './types';

/** Centre of the inside front tire, measured consistently in player and Reference Lap. */
export function insideFrontTirePosition(kart: KartState, direction: TurnDirection): Vector2D {
  const side = direction === 'Right' ? 1 : -1;
  const forward = KART_WHEEL_GEOMETRY.frontAxleMeters;
  const lateral = side * KART_WHEEL_GEOMETRY.frontTrackHalfMeters;
  return {
    x: kart.position.x + Math.cos(kart.headingRad) * forward - Math.sin(kart.headingRad) * lateral,
    z: kart.position.z + Math.sin(kart.headingRad) * forward + Math.cos(kart.headingRad) * lateral,
  };
}
