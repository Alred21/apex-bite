## Parent

[Iteration 6 specification #50](https://github.com/Alred21/apex-bite/issues/50)

## What to build

Enhance Helmet Cam and Chase Cam immersion with bounded look-to-apex yaw, speed-gated micro-vibration, an optional default-off visor periphery overlay, and smooth Chase Cam yaw-lag—while keeping all camera effects strictly disabled when camera motion is set to 0% and preserving all comfort bounds and physics determinism.

## Acceptance criteria

- [ ] Helmet Cam applies smooth bounded look-to-apex yaw and subtle speed- and scrub-gated chassis micro-vibration scaled by camera motion strength, remaining strictly zero when stopped or when motion strength is 0%.
- [ ] Chase Cam applies smooth bounded dynamic yaw-lag swing scaled by camera motion strength while remaining strictly within existing position-displacement and roll comfort limits.
- [ ] An optional Helmet Cam visor periphery overlay is toggleable in Driving and view settings, defaults to off, persists independently of training records, and leaves Chase Cam clear.
- [ ] Toggling camera views or resetting to a Flying Start or Flying Entry clears residual camera lag and vibration immediately, and camera state never feeds back into `kart-v2` physics, Ghost Karts, or training records.
- [ ] Automated camera-comfort tests verify all existing bounds alongside the new look-to-apex yaw, yaw-lag, and zero-motion guarantees.
