## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

See a believable helmeted rental-Kart driver in Chase Cam and natural hands/arms/body visibility in Helmet Cam, with coherent wheel proportions and steering movement.

## Acceptance criteria

- [ ] Inspect the shortlisted free assets for actual geometry, license, functional rig, seated fit, materials/textures, and browser cost before choosing; adapt or author missing parts when candidates fail.
- [ ] The selected driver has believable proportions, helmet/suit, seated posture, and stable placement in the existing Kart.
- [ ] Hands stay on the steering wheel throughout the usable steering range; arms move plausibly using a modest pose/animation solution.
- [ ] Calibrate physical wheel size, seating position, eye position, and camera framing together; document the basis for the final proportions.
- [ ] Both Helmet Cam and Chase Cam remain useful while driving, steering, and recovering. Hide head/intersecting geometry where needed for the eye view without losing the visible body in Chase Cam.
- [ ] Preserve adjustable field of view and disableable camera feedback. Prevent distracting clipping, floating hands, or obstructed track sightlines.
- [ ] Keep source, license, and required attribution for imported assets. No paid purchase is required.
- [ ] Review both views in motion and retain representative images. Measure added triangles, render calls, texture footprint, and frame timing with a repeatable warmed scene; address material regressions within existing quality settings.
- [ ] Use the existing presentation/browser harness and public Session snapshots; do not introduce a general character-animation framework, locomotion, ragdoll, or customization system.
