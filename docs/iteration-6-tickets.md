# Iteration 6 tickets

Status: published and verified on GitHub: [specification #50](https://github.com/Alred21/apex-bite/issues/50) and eleven native sub-issues, #51–#61.

The local [specification](iteration-6-spec.md) synthesizes the approved design tree from the Iteration 6 grilling rounds and [ADR-0006](adr/0006-glb-pbr-real-kinematics-pipeline.md). The specification and every child ticket carry the `ready-for-agent` label, native parent/sub-issue links, and all fifteen native GitHub `blocked_by` relationships. Parent #50 remains open.

## Accepted test seams

1. **Public Simulation Session seam (primary)**: Exercise driving inputs, snapshots, Reference Lap replay, camera comfort bounds, and portable training-data import/export through the existing public session interface, keeping `kart-v2` physics, Circuit geometry, Barrier collision chords, Clean Lap rules, and Reference Lap targets strictly unchanged.
2. **Production browser QA harnesses (extended only for async asset readiness)**: Exercise the real WebGL renderer, HUD, and Web Audio synthesizer through the existing browser verification harnesses across `Performance`, `Balanced`, and `High` quality tiers, verifying steering direction, Ghost Kart parity and overlap isolation, HUD layout and `[H]` Minimal toggle, audio RMS and lifecycle silence, and ≥ 60 FPS separated-Ghost performance.
3. **Offline 3D geometry, kinematic, and miter audit seam**: Verify zero static/kinematic 3D mesh interpenetration via Blender BVH-tree audits across steering-lock and pedal-travel extremes, exact constant-length rigid four-bar steering and two-bone arm/leg IK math, and zero degenerate or inverted Barrier miter faces.

## Published slices

1. **[#51: Prefactor UV-mapped GLB and local PBR asset preloading with Ghost parity](https://github.com/Alred21/apex-bite/issues/51)** — [local body](iteration-6-tickets/01-glb-pbr-preloader.md)
   - Blocked by: None (initial frontier).
   - Delivers: Startup preloading for bundled local `.glb` models and PBR textures with a lightweight synchronous fallback for headless unit tests, and shared GPU geometry with independent per-instance materials across the player Kart and both Ghost Karts.

2. **[#52: Sculpted OTL Superleggero Kart with true physical mechanical movement](https://github.com/Alred21/apex-bite/issues/52)** — [local body](iteration-6-tickets/02-sculpted-kart-real-kinematics.md)
   - Blocked by: [#51](https://github.com/Alred21/apex-bite/issues/51).
   - Delivers: UV-unwrapped sculpted OTL Superleggero Kart with Apex Bite #07 crimson/white/carbon livery, wraparound Protex bumper, staggered slick tires, working rear LED brake/status beacon, continuous 1-piece steering column + Pitman arm driving fixed-length rigid four-bar tie rods and tilted kingpins, synchronized rear live axle/rotor/sprocket/pinion/belt, connected brake pushrod and throttle linkage, and visual-only suspensionless micro-dynamics—automatically inherited by Ghost Karts.

3. **[#53: Sculpted anatomically articulated driver with pedal-tracking boots and cornering posture](https://github.com/Alred21/apex-bite/issues/53)** — [local body](iteration-6-tickets/03-articulated-driver-real-movement.md)
   - Blocked by: [#52](https://github.com/Alred21/apex-bite/issues/52).
   - Delivers: Sculpted helmeted driver wearing a Nomex suit, rib protector, anchored four-point harness with lap belt/buckle, race gloves, and karting boots driven by two-bone arm IK on the steering yoke, two-bone leg IK tracking the live pedals, and subtle cornering helmet/torso cues (hiding cleanly in Helmet Cam, visible in Chase Cam and Ghost Karts), passing the complete Kart + driver overlap audit.

4. **[#54: Seamless spline-mitered Protex Barriers and rubbered-in Circuit surface with continuous skid ribbons](https://github.com/Alred21/apex-bite/issues/54)** — [local body](iteration-6-tickets/04-seamless-barriers-and-track.md)
   - Blocked by: [#51](https://github.com/Alred21/apex-bite/issues/51).
   - Delivers: Continuous spline-mitered molded Protex HDPE Barriers aligned to the physical wall corridor (vertical interlock pins, flush rubber rub-rail, outer shock-mount brackets, zero pokethrough or z-fighting at Turn 3 and Turn 10), PBR sealed concrete track with rubbered-in Racing Line groove and weathered markings, and zero-allocation continuous dual rear-tire skid ribbons.

5. **[#55: K1-style indoor arena architecture, live start gantry, pit bay, and corner marshal LEDs](https://github.com/Alred21/apex-bite/issues/55)** — [local body](iteration-6-tickets/05-indoor-arena-gantry-pit-marshals.md)
   - Blocked by: [#52](https://github.com/Alred21/apex-bite/issues/52), [#54](https://github.com/Alred21/apex-bite/issues/54).
   - Delivers: Enclosed K1-style indoor arena strictly outside the drivable Circuit—overhead start/finish truss gantry with live five-pod LED tree and digital scoreboard, pit/staging bay with charging stanchions and parked driverless Kart clones, spectator mezzanine with safety glass, roof trusses, HVAC ducts, high-bay LEDs, blue painted infield, tire stacks, Apex Bite banners, and live LED corner marshal panels scaled by quality tier.

6. **[#56: Midpoint visual and zero-overlap review checkpoint](https://github.com/Alred21/apex-bite/issues/56)** — [local body](iteration-6-tickets/06-midpoint-visual-overlap-review.md)
   - Blocked by: [#53](https://github.com/Alred21/apex-bite/issues/53), [#55](https://github.com/Alred21/apex-bite/issues/55).
   - Delivers: Complete static and kinematic Blender BVH-tree overlap and Barrier-miter audit plus high-resolution Blender close-ups and live browser screenshots across cameras, steering lock, pedal depression, separated Ghost Karts, and hairpin Barriers for user visual approval before polish slices begin.

7. **[#57: GRID Legends indoor arena IBL, clearcoat PBR, grounded contact AO, selective bloom, and dynamic FX](https://github.com/Alred21/apex-bite/issues/57)** — [local body](iteration-6-tickets/07-grid-legends-lighting-ibl-bloom-fx.md)
   - Blocked by: [#56](https://github.com/Alred21/apex-bite/issues/56).
   - Delivers: Custom indoor-arena image-based reflections with bright overhead LED banks, clearcoat PBR shading, grounded contact AO under chassis and all four tires across all tiers, High-tier selective HDR bloom strictly on emissive LEDs, and zero-allocation rear-tire scrub dust and Barrier-graze scuff particles in Balanced and High with strict Ghost Kart isolation.

8. **[#58: Immersion-tuned Helmet Cam and Chase Cam within comfort bounds](https://github.com/Alred21/apex-bite/issues/58)** — [local body](iteration-6-tickets/08-immersion-cameras-comfort-bounds.md)
   - Blocked by: [#56](https://github.com/Alred21/apex-bite/issues/56).
   - Delivers: Bounded Helmet Cam look-to-apex yaw, speed-gated micro-vibration, optional default-off visor periphery toggle in Driving & view settings, and smooth Chase Cam yaw-lag swing—all scaled by camera motion strength and strictly zeroed at 0%.

9. **[#59: Sleek motorsport HUD restyle and [H] Minimal driving mode](https://github.com/Alred21/apex-bite/issues/59)** — [local body](iteration-6-tickets/09-motorsport-hud-minimal-mode.md)
   - Blocked by: [#56](https://github.com/Alred21/apex-bite/issues/56).
   - Delivers: Low-profile motorsport HUD restyle preserving direct access to all existing controls in default Full mode and Helmet Cam lower-center clearance, plus a `[H]` toggle for Minimal driving/timing-only mode.

10. **[#60: Indoor concrete-hall Web Audio acoustics and multi-layer electric Kart synthesis](https://github.com/Alred21/apex-bite/issues/60)** — [local body](iteration-6-tickets/10-warehouse-audio-electric-kart.md)
    - Blocked by: [#56](https://github.com/Alred21/apex-bite/issues/56).
    - Delivers: Fixed zero-allocation Web Audio upgrade with procedural indoor concrete-hall convolution reverb, inverter PWM whine, toothed belt texture, regen braking sweep, brake rotor hiss, dual-band tire scrub, and hollow HDPE Barrier impact/rub acoustics.

11. **[#61: Integrated Iteration 6 verification, 60 FPS browser QA, and documentation closeout](https://github.com/Alred21/apex-bite/issues/61)** — [local body](iteration-6-tickets/11-integrated-verification-qa-docs.md)
    - Blocked by: [#57](https://github.com/Alred21/apex-bite/issues/57), [#58](https://github.com/Alred21/apex-bite/issues/58), [#59](https://github.com/Alred21/apex-bite/issues/59), [#60](https://github.com/Alred21/apex-bite/issues/60).
    - Delivers: Full typecheck, unit tests, production build, automated overlap/miter audits, all browser QA checks at ≥ 60 FPS with separated Ghost Karts visible, updated technical and license documentation, and final implementation report.

## Dependency rationale

- `#51` prefactors asset preloading and material isolation so `#52` (Kart) and `#54` (Barriers/track) can develop cleanly in parallel.
- `#53` (driver IK and pedal tracking) requires `#52`'s finalized cockpit, steering yoke, and moving pedal geometry.
- `#55` (indoor arena, pit bay, gantry) depends on `#52` (parked driverless OTL Kart clones in the pit bay) and `#54` (seamless Barrier bounds so trackside structures clear every wall).
- `#56` (midpoint visual and zero-overlap review checkpoint) gates all four downstream polish slices (`#57`, `#58`, `#59`, `#60`) so geometry, movement, and venue layout are user-approved before lighting, camera, HUD, and audio polish begin.
- `#61` integrates and verifies all four polish slices together before closing Iteration 6.

## Publication verification

Verified parent `#50` and all eleven child sub-issues `#51–#61` on GitHub (`Alred21/apex-bite`): all twelve issues are open with `ready-for-agent`, eleven native sub-issue links under `#50`, and all fifteen native `blocked_by` edges matching the dependency graph above (`[0, 1, 1, 1, 2, 2, 1, 1, 1, 1, 4]` blockers across `#51`–`#61`).
