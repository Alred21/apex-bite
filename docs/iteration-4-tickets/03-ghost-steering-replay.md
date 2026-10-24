## Parent

[Iteration 4 specification #33](https://github.com/Alred21/apex-bite/issues/33)

## What to build

Watch new Personal Best and Reference Lap ghosts steer their wheels and hands from replay data, while older compatible saved laps remain usable with inferred animation.

## Acceptance criteria

- [x] Record steering in new Personal Best samples and carry it through interpolation, persistence, portable export/import, and current-model rendering.
- [x] Use available Reference Lap steering for its ghost; wheel and hand movement follows the sampled replay consistently.
- [x] Older compatible records without steering retain exact stored position/timing behavior and use a documented presentation-only steering approximation. Missing historical steering alone does not archive or invalidate a compatible lap.
- [x] Validate new imported fields; malformed or unsupported data is rejected atomically without overwriting good records. Preserve existing handling/Circuit legacy semantics.
- [x] Through public Session replay and portable round trips, verify new-data steering, old-record fallback, boundaries/interpolation, and unchanged positions/timing.
- [x] Verify actual ghost articulation in both cameras and preserve independent overlap suppression and ghost mode behavior. Relevant behavior/browser checks, type checking, and build pass.
