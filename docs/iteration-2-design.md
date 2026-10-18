# Iteration 2 design

This document records the design interview begun on 2026-10-18. Both question rounds and the consolidated scope and acceptance criteria below were approved. The implementation specification is [Iteration 2 spec](iteration-2-spec.md).

Published as [GitHub issue #8](https://github.com/Alred21/apex-bite/issues/8), labeled `ready-for-agent`. The issue contains the implementation scope, 50 User Stories, Testing Decisions, and Out of Scope boundaries. [Publication screenshot](iteration-2-published.jpg).

The approved breakdown is published as [GitHub sub-issues #9–#21](iteration-2-tickets.md) with native blocking relationships. GitHub holds the canonical ticket bodies and acceptance criteria.

## Settled decisions

- Real-world K1 Toronto training remains the primary goal. Preserve the 11-Turn layout and realistic speeds; improve input and grip behavior before reassessing Circuit scale. Current dimensions are estimates encoded by the first iteration, not measurements established by the supplied layout images. See [ADR-0002](adr/0002-preserve-k1-training-fidelity.md).
- Keyboard Assistance smooths steering and pedal inputs, including speed-sensitive steering response. The driver chooses the Racing Line and braking points; driving mistakes still have consequences.
- Visual and audio work targets a convincing indoor electric rental Kart and venue in both Helmet Cam and Chase Cam: detailed chassis and wheels, credible plastic/rubber/metal materials, pavement textures, indoor lighting and shadows, and electric motor, tire, and collision sounds.
- Target smooth browser play at 60 FPS on everyday laptops, with adjustable graphics quality. A repeatable hardware and scene benchmark remains to be selected.
- Time Trial defaults to 12 timed solo laps followed by results. Unlimited practice is an explicit option. This iteration does not add opponents.
- Racing Line selection prioritizes a fast, physically achievable whole lap, allowing sacrifices at individual Turns to benefit connected Turns. Candidate laps must execute through the player's Kart dynamics with clearance for the entire Kart; optimality is evaluated through comparison and feasibility evidence, not asserted as a global mathematical proof. See [ADR-0003](adr/0003-derive-guidance-from-executable-reference-laps.md).
- Reference speeds, Ghost Kart timing, and coaching targets derive from the validated Reference Lap. Keep the supplied 24.499-second Real-World Benchmark separately labeled; do not tune grip to force that time.
- The reference path remains stable during a session. Live cues account for speed, position, heading, and upcoming Turns; being below a point's reference speed alone does not establish that full throttle is appropriate. Racing Line display options are Full, Corners Only, and Off.
- Source visual and audio assets from custom-built work and appropriately licensed free assets. This iteration has no paid asset purchases. Check asset quality and license terms before including sourced material.
- Expose steering sensitivity, field of view, and camera motion settings. Use restrained acceleration, cornering, and impact feedback by default, with camera motion fully disableable.
- The Flying Start approach does not count toward the 12 timed laps. Barrier-contact laps count toward session completion but are ineligible for Clean Lap Personal Bests. Present total time, individual lap times, clean/contact status, best Clean Lap, and Sector results after lap 12, with restart available.
- Preserve prior Personal Best and Ghost Kart data as legacy records. Track new records separately after handling or Circuit changes that invalidate comparison.

## Inspection findings

- Keyboard steering's speed-sensitive cap disappears after about 0.57 seconds of holding a direction. Direction reversal retains the hold timer. Rotation is computed kinematically without a tire-force grip limit.
- Kart visuals use primitive shapes and flat materials; tire and rear-axle cylinder orientation needs correction. There are no imported model assets, surface texture maps, configured shadows, venue enclosure, or audio pipeline.
- Racing Line geometry uses per-Turn lateral offsets and smoothing, with pinned apexes. Its speed solver adjusts a grip parameter to target 24.499 seconds rather than verifying that the Kart simulation can execute that lap. Existing tests check the chosen time and apex proximity, not lap-time optimality.
- Circuit and Racing Line curvature estimates use an incorrect geometric baseline on constant-radius arcs; apex repinning also creates sharp local direction changes. Candidate generation needs independent curvature and swept-clearance validation.
- The Racing Line speed schedule uses acceleration/braking formulas separate from player dynamics. Live cues use centerline progress and individual target-speed comparisons without evaluating the current pose or a feasible braking trajectory. Corner Drill coaching inherits the same schedule and can report an "Optimal Pass" without verifying competitive segment performance.

## Approved implementation scope

1. Correct Keyboard Assistance and implement progressive grip-limited Kart behavior within the existing deterministic planar solver. Preserve the realistic 45 km/h limiter and electric solid-axle character. Reassess estimated Circuit scale after the handling pass, preserving the supplied 11-Turn layout.
2. Rebuild and evaluate Racing Line candidates against those dynamics. Use one validated Reference Lap for speed guidance, Ghost Kart playback, and Corner Drill targets; update coaching so claims follow measured evidence. Derive apex targets from the selected path instead of using current pins as proof of correctness.
3. Replace primitive Kart presentation with convincing detailed geometry and materials, correct wheel/axle orientation, animate wheels and steering, and improve the indoor environment, surface detail, lighting, shadows, sound, and camera feedback. Both camera views remain supported.
4. Add driver/graphics settings and the bounded Time Trial lifecycle with explicit unlimited practice, results, restart, and separate legacy records.

## Approved acceptance criteria

- Handling: short steering taps support small corrections; sustained holds at speed cannot bypass grip limits; reversing steering direction has consistent response. All 11 Turns and the five Corner Complexes can be practiced with keyboard controls. Excess entry speed causes progressive, understandable loss of the intended line rather than unrestricted heading rotation.
- Circuit: preserve the reference images' Turn sequence and recognizable layout. Treat the existing 245 m length and 4.8–6.0 m widths as starting estimates; do not claim surveyed venue dimensions from the images.
- Racing Line: compare candidate elapsed times against feasible centerline and prior-heuristic baselines using the same dynamics and traversal protocol. A baseline that fails clearance or control constraints is a documented failure, not a meaningful lap-time comparator. Validate the selected complete lap's controls, speed, grip, steering continuity, and swept Barrier clearance; include the start/finish wrap and connected Turns. Report the fastest validated candidate found without claiming a proven global optimum.
- Guidance: demonstrate braking anticipation, a slow but badly positioned approach, recovery away from the path, and consecutive Turns. Full/Corners Only/Off affects display without changing the underlying reference. Reference Ghost Kart replay and coaching use the validated lap consistently.
- Visual/audio: review both camera views in motion; check believable Kart proportions, rotating/steering wheels, distinguishable materials, indoor illumination/shadows, pavement detail, electric sound response, and adjustable camera feedback. Free sourced assets retain required license/attribution material.
- Performance: measure a repeatable warmed-up lap in both camera views with the Racing Line and Ghost Karts visible. Record actual test hardware, browser, viewport, quality, and frame timing; target 60 FPS at an appropriate laptop quality preset and distinguish measured local performance from untested hardware claims.
- Time Trial: count exactly 12 timed laps after the Flying Start, including contact laps; finish once, preserve Clean Lap eligibility, present the agreed results, and support restart and unlimited practice. Existing compatible persistence behavior remains covered, with legacy records separated after the handling version changes.

### Available performance reference

The local machine is a MacBook Pro with Apple M5 Pro, 48 GB RAM, and a 16-core integrated GPU. Chrome 155 and Safari 27 are installed. Use a production build, a fixed recorded viewport and device-pixel ratio, and an identical lap after warm-up; report frame-time distribution and hitches as well as average FPS. Include a full 12-lap run to check accumulating performance costs and compare both cameras with Racing Line and both Ghost Karts visible. This capable machine does not establish a minimum specification for everyday laptops; broader performance remains a target until measured on representative hardware.

## Implementation discretion

Detailed algorithm and asset choices remain engineering work within these approved constraints; measured dimension uncertainty and unproven global optimality must stay visible in the implementation report.

## GRID Legends reference

EA documents adjustable [steering sensitivity and linearity](https://www.ea.com/able/resources/grid/grid-legends/pc/controls), plus [Racing Line On/Off/Corners Only, camera feedback, field of view, and stability assists](https://www.ea.com/able/resources/grid/grid-legends/pc/gameplay). These are documented interface and assist options, not evidence of the game's internal Racing Line optimizer or physics implementation. Use them as experience references while validating Apex Bite guidance against its own Kart dynamics.
