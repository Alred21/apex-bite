# Iteration 2 ticket plan

Source: [specification #8](https://github.com/Alred21/apex-bite/issues/8).

Status: **Proposed; awaiting approval of granularity and blocking edges before publication.** T01–T13 are planning identifiers, not GitHub issue numbers. Each approved slice will become a separate `ready-for-agent` sub-issue with native blocking relationships where supported. The parent specification's body and status remain unchanged.

Every ticket includes relevant session-boundary tests and browser verification for its delivered behavior; tests are not deferred to T13. Preserve the existing session seam. No standalone broad refactor is needed: any extraction of shared dynamics parameters occurs as behavior-preserving prefactoring at the start of T02 before changing physics.

## T01: Preserve training records across handling revisions

**Blocked by:** None (can start immediately).

**What it delivers:** A returning driver can retain, inspect, export, and import training records without mixing incompatible handling or Circuit revisions. The existing driving experience continues to work while revision-aware persistence is introduced before physics changes.

- [ ] Preserve existing Personal Bests, Sector splits, Corner Drill records, and Ghost Kart replays during migration; keep compatible baseline records usable until the active handling revision changes.
- [ ] Separate current comparisons from legacy records and make archived achievements accessible through the training-data interface.
- [ ] Portable data round trips retain current and legacy records; malformed, unsupported, and failed-storage cases do not partially overwrite good data.
- [ ] Verify migration, compatibility selection, and persistence through session construction, public commands, snapshots, and exports; demonstrate the data interface in the browser.

**Spec stories:** 48–50.

## T02: Drive a progressive, grip-limited electric Kart

**Blocked by:** T01.

**What it delivers:** The driver feels credible electric acceleration, rear braking, solid-axle resistance, and progressive tire-grip limits instead of unrestricted heading rotation. Displayed slip and dynamics feedback describe the actual simulation, and the new handling starts a separate current-record revision.

- [ ] Retain deterministic 120 Hz planar dynamics and the 45 km/h limiter; consolidate shared dynamics parameters before changing behavior.
- [ ] Model progressive lateral grip, rotation response, motor drag, rear braking, and Axle Scrub without abrupt heuristic rotation bonuses or heading snaps that replace physical response.
- [ ] Resolve Barrier contact with whole-Kart clearance and believable speed loss/deflection; preserve Clean Lap invalidation.
- [ ] Verify repeatability, grip limits, braking/turning interaction, limiter behavior, and Barrier outcomes through the public session seam; drive representative Turns in the browser.
- [ ] Archive incompatible records through T01 rather than deleting them or comparing them with the revised dynamics.

**Spec stories:** 2, 8–10; the shared dynamics prerequisite for 15–18.

## T03: Place the Kart precisely with keyboard controls

**Blocked by:** T02.

**What it delivers:** Keyboard taps, sustained holds, steering reversals, and pedal application produce predictable input. The driver can tune sensitivity while retaining responsibility for driving decisions; gamepad controls remain available.

- [ ] Provide progressive pedals and speed-sensitive steering with no sustained-hold bypass of the grip-aware limit; support consistent reversal and self-centering.
- [ ] Expose usable steering sensitivity controls and retain analog steering/pedal input without applying keyboard shaping to it.
- [ ] Release held inputs on focus loss; typing in settings or data fields does not drive the Kart or trigger driving shortcuts.
- [ ] Exercise all 11 Turns and five Corner Complexes with keyboard input, including short corrections and excessive entry speed. Record the resulting scale assessment before changing estimated Circuit dimensions; preserve the recognizable layout and realistic speed.
- [ ] Cover observable keyboard sequences and analog regressions at the session boundary, plus actual browser focus/key behavior.

**Spec stories:** 3–7, 10–12; Circuit-scale reassessment from the implementation decisions.

## T04: Complete a 12-lap Time Trial and review results

**Blocked by:** None (can start immediately).

**What it delivers:** A solo Time Trial ends after 12 timed laps by default and presents a useful result with restart. Unlimited practice remains an explicit choice.

- [ ] Exclude the Flying Start approach, count completed contact laps, and finish exactly once after the twelfth timed lap.
- [ ] Show progress and results containing total time, each lap's time and clean/contact status, best Clean Lap, and Sector results.
- [ ] Freeze the completed result against extra ticks or finish crossings, preserve Clean Lap record eligibility, and support restart and mode changes consistently.
- [ ] Provide explicit unlimited practice and verify that it continues beyond 12 laps.
- [ ] Cover the full lifecycle through session commands and snapshots, then demonstrate selection, finish, results, and restart in the browser.

**Spec stories:** 40–47.

## T05: Follow an executable Reference Lap and Ghost Kart

**Blocked by:** T02.

**What it delivers:** The displayed Racing Line, its speed targets, the Time-Delta Bar, and the Reference Ghost Kart describe a complete lap that was actually executed under player dynamics. The supplied 24.499-second Real-World Benchmark is labeled separately.

- [ ] Correct geometry/curvature evaluation and produce a conservative complete candidate without mandatory apex pins or forced-time grip calibration.
- [ ] Execute and retain the candidate's controls under player dynamics; validate speed, grip, steering continuity, swept Barrier clearance, and the start/finish wrap. Reject infeasible candidates with an inspectable reason.
- [ ] Derive path, timing, speed targets, Ghost Kart playback, and reference progress comparisons from the validated traversal, including repeatable closed-lap playback.
- [ ] Expose the Reference Lap consistently in the HUD and Ghost Kart selection; keep the Real-World Benchmark distinct from the simulated time.
- [ ] Verify the exact traversal through the existing session seam and demonstrate the displayed line and Ghost Kart agreeing in the browser.

**Spec stories:** 15, 16, 18, 19, 25; establishes the usable reference for 20–28.

## T06: Improve the Reference Lap across connected Turns

**Blocked by:** T05.

**What it delivers:** The driver gets the fastest validated candidate found across the whole Circuit, including compromises that improve the exit of a Corner Complex instead of clipping every existing apex.

- [ ] Evaluate complete-lap alternatives and connected-Turn trade-offs with the shared traversal/validation protocol.
- [ ] Compare feasible centerline and prior-heuristic baselines; report infeasible alternatives as failures rather than pretending their times are valid comparisons.
- [ ] Select the fastest validated candidate found, derive its apex targets and timing, and carry it through the existing Racing Line/Ghost Kart presentation without downstream special cases.
- [ ] Record candidate timings and feasibility evidence; demonstrate connected-Turn behavior in the browser and avoid a claim of proven global optimality.

**Spec stories:** 13, 14, 17; completes the candidate-selection scope of 15–18.

## T07: Receive pose-aware Racing Line cues and choose display modes

**Blocked by:** T05.

**What it delivers:** A driver receives relevant throttle/coast/brake guidance based on actual speed, position, heading, and upcoming constraints, with Full, Corners Only, and Off visibility options.

- [ ] Keep reference geometry stable while evaluating live cues from actual Kart state and achievable upcoming braking/turning constraints.
- [ ] Demonstrate braking anticipation, consecutive Turns, a slow but badly positioned approach, and conservative recovery away from the path.
- [ ] Avoid unconditional full-throttle advice merely because the Kart is below one point's target speed.
- [ ] Expose all three display modes through keyboard/HUD controls without changing reference timing, geometry, or underlying guidance.
- [ ] Verify cue outcomes at the session seam and visibility/controls in both camera views.

**Spec stories:** 20–24.

## T08: Practice Corner Drills against evidence-based reference targets

**Blocked by:** T05.

**What it delivers:** Individual Turns and Corner Complexes use the same Reference Lap as Time Trial, and Corner Execution Cards describe measured performance without inventing causes or calling a slow pass optimal.

- [ ] Derive Flying Entry pose/speed, segment timing, entry/minimum/exit speeds, and inside-front-tire apex targets from the selected Reference Lap.
- [ ] Retain all 11 Turns, five Corner Complexes, reset, and completion behavior; refreshed reference candidates propagate consistently without manual per-Turn retuning.
- [ ] Tie coaching claims to recorded execution/time evidence and avoid causal late-braking claims based solely on apex distance.
- [ ] Make significant individual misses in a Corner Complex visible rather than hiding them behind an average.
- [ ] Verify representative clean, contact, slow, missed-target, and excessive-scrub passes through the session seam and inspect their execution cards in the browser.

**Spec stories:** 26–28.

## T09: Drive a detailed and correctly animated rental Kart

**Blocked by:** None (can start immediately).

**What it delivers:** The player sees a convincing electric rental Kart in Helmet Cam and Chase Cam, with credible chassis/bodywork, differentiated materials, and wheels and steering that move correctly.

- [ ] Replace the schematic silhouette with detailed, sensibly proportioned bodywork, chassis, seat, motor housing, wheel/tire/hub, and steering details.
- [ ] Correct tire/axle orientation and animate wheel rolling, front steering, and steering-wheel movement consistently with Kart state.
- [ ] Differentiate rubber, plastic, metal, and wear/detail using custom work or appropriately licensed free assets; retain required attribution for sourced material.
- [ ] Keep the visible body and wheel envelope consistent with the existing collision dimensions, or coordinate an explicit model-revision change with T01/T02 before enlarging it.
- [ ] Review motion and screenshots from both camera views and ensure the new presentation leaves simulation state unchanged.

**Spec stories:** 29–32, 37, 39.

## T10: Drive inside a believable venue with adjustable graphics quality

**Blocked by:** None (can start immediately).

**What it delivers:** The Circuit feels situated inside an indoor venue, with pavement detail, differentiated surfaces, illumination, shadows, and practical laptop quality settings.

- [ ] Preserve the recognizable 11-Turn layout, numbered markers, start/finish/grid, Barriers, and infield identity while improving the surrounding venue and surface detail.
- [ ] Add credible indoor lighting, contact/depth cues, shadows, and floor/material variation without excessive draw calls or texture cost.
- [ ] Expose graphics quality settings that actually reduce rendering cost and preserve legibility in both camera views.
- [ ] Record asset provenance/attribution and a repeatable production-build performance sample with hardware, browser, viewport, pixel ratio, and quality stated.
- [ ] Inspect both camera views and verify that graphics changes do not affect physics or recorded lap outcomes.

**Spec stories:** 1, 31, 33, 38, 39.

## T11: Hear responsive electric, tire, and Barrier-contact audio

**Blocked by:** None (can start immediately).

**What it delivers:** The driver hears electric acceleration/load, tire grip use, and Barrier impacts as useful driving feedback, with a normal browser activation flow and usable volume controls.

- [ ] Respond to speed/throttle, tire slip/scrub, and impact intensity using existing observable Kart signals; avoid continuous impact retriggering during a single contact.
- [ ] Activate audio after a user gesture, handle pause/focus changes, and provide mute/volume control without adding a dependency on external paid assets.
- [ ] Use custom synthesis or appropriately licensed free material and retain required attribution.
- [ ] Verify browser activation, changing sound response, mute/volume, and reset without audio-resource accumulation.

**Spec stories:** 34, 39.

## T12: Tune comfortable Helmet Cam and Chase Cam feedback

**Blocked by:** None (can start immediately).

**What it delivers:** Both camera views communicate acceleration, cornering, and impact gently, with adjustable field of view and camera motion that can be fully disabled.

- [ ] Add restrained, stable response to existing Kart motion/contact signals, retaining readable sightlines and useful proximity to the Kart.
- [ ] Expose field-of-view and camera-motion settings, including a fully disabled motion setting.
- [ ] Keep switching/reset behavior comfortable and separate presentation feedback from simulation physics and replay state.
- [ ] Verify camera-setting state and unchanged Kart outcomes through the session seam where applicable; inspect both views in browser motion and screenshots.

**Spec stories:** 35–37.

## T13: Deliver a smooth, consistent complete training session

**Blocked by:** T03, T04, T06, T07, T08, T09, T10, T11, T12.

**What it delivers:** The combined iteration works from Flying Start through a complete 12-lap result, with coherent reference/coaching feedback, detailed presentation, and measured laptop-quality performance. This ticket tunes and repairs integration behavior rather than replacing the verification required in every preceding slice.

- [ ] Run the complete Time Trial lifecycle and representative Corner Drills with all delivered features enabled; verify records, restart, settings, reference consistency, and clean/contact eligibility together.
- [ ] Measure a repeatable warmed-up production-build lap in both camera views with the Racing Line and both Ghost Karts, plus a full 12-lap run for accumulating cost. Record frame-time distributions/hitches and beginning/end behavior.
- [ ] Tune graphics/presentation budgets where needed to target 60 FPS at suitable laptop settings; state measured hardware and avoid generalizing the available M5 Pro result to untested laptops.
- [ ] Complete keyboard-driving review, both-view visual/audio review, relevant automated tests, type checking, and production build. Report scale-assessment and Reference Lap comparison evidence and remaining limits.

**Spec stories:** integrated verification of 1–50, especially 1 and 38.

## Dependency rationale

- T01 gates T02 because revised physics makes old records incompatible. T02 gates T03 and T05 because keyboard calibration and executed reference validation must use the new dynamics.
- T05 gates T06–T08 through a stable validated-reference contract. Guidance and coaching do not wait for the final optimized candidate: they consume that contract, and T06's selected candidate propagates through it.
- T04 and T09–T12 use existing session snapshots and controls and can be demonstrated independently. They have no artificial dependency on the physics or Racing Line work.
- T13 depends on the completed leaf slices. T01, T02, and T05 are already transitive prerequisites and are intentionally not listed again as direct blockers.

## Publication rules

Publish only after the user approves this breakdown. Create one issue per slice in dependency order, mark each `ready-for-agent`, link it as a sub-issue of #8, and use native blocking links where available. If native dependencies are unavailable, retain explicit blocking issue references in the child body. Do not change or close the parent issue's body/status, and do not start gameplay implementation before the planning changes are committed and pushed.
