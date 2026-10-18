## Problem Statement

Apex Bite reproduces the recognizable 11-Turn K1 Toronto layout, but its first iteration is difficult to control with a keyboard and does not convincingly resemble an indoor electric Kart experience. Sustained steering can become excessively sensitive, while the dynamics permit rotation without a physical tire-grip limit. Increasing Circuit dimensions and speed together would not independently solve the available reaction time or steering problem.

The Kart and venue look schematic, with primitive geometry, flat surfaces, limited animation and lighting, and no sound. The Racing Line is a per-Turn heuristic whose speed profile is forced to a 24.499-second target rather than demonstrated achievable. Its geometry, cues, Ghost Kart, and coaching can therefore teach inconsistent technique. Time Trial also runs indefinitely instead of providing a useful default session and a clear results screen.

## Solution

Deliver a credible browser-based indoor electric Kart training experience that preserves K1 Toronto's 11-Turn layout and realistic speed, makes keyboard driving progressive and understandable, and improves both Helmet Cam and Chase Cam presentation. Validate Racing Line candidates against the same dynamics used by the driver, treating a fast complete lap as the goal and allowing compromises between connected Turns.

Use a validated Reference Lap consistently for reference speeds, Ghost Kart playback, timing comparisons, and coaching. Keep the supplied 24.499-second Real-World Benchmark separately labeled. Default Time Trial to 12 timed solo laps with results and restart, while retaining explicitly selected unlimited practice. Preserve previous records as legacy data and target 60 FPS with adjustable quality and honest measurement reporting.

## User Stories

1. As a driver practicing for K1 Toronto, I want the recognizable 11-Turn Circuit and Turn sequence preserved, so that the practice remains relevant to the physical venue.
2. As a driver, I want realistic electric Kart speeds, so that increased speed is not used to disguise a control problem.
3. As a keyboard driver, I want short steering taps to produce small corrections, so that I can place the Kart accurately.
4. As a keyboard driver, I want sustained steering to remain manageable at speed, so that holding a key does not suddenly allow unrestricted rotation.
5. As a keyboard driver, I want consistent response when reversing steering direction, so that successive corrections feel predictable.
6. As a keyboard driver, I want progressive accelerator and brake inputs, so that key presses can represent deliberate pedal application.
7. As a keyboard driver, I want steering sensitivity settings with a usable default, so that I can adjust input response without needing to repair the handling myself.
8. As a driver, I want tire grip and Kart rotation to behave progressively, so that excess entry speed has understandable consequences.
9. As a driver, I want electric acceleration, motor drag, rear braking, and Axle Scrub to remain recognizable, so that the Kart behaves credibly for its type.
10. As a driver, I want to choose braking points and the Racing Line myself, so that Keyboard Assistance supports rather than replaces my driving decisions.
11. As a gamepad driver, I want existing analog steering and pedal support retained, so that improvements do not remove another available input device.
12. As a driver, I want loss of browser focus to release held inputs, so that returning to the game does not leave the Kart steering or accelerating unexpectedly.
13. As a trainee, I want the Racing Line selected for fast complete-lap performance, so that it can sacrifice an individual apex when that benefits the following Turn.
14. As a trainee, I want connected Turns evaluated together, so that isolated outside-inside-outside patterns do not compromise an entire Corner Complex.
15. As a trainee, I want the Reference Lap to be executable under player dynamics, so that following its speed targets is physically possible.
16. As a trainee, I want Racing Line clearance to account for the whole Kart, so that a visually in-bounds line does not direct my wheels or bodywork into a Barrier.
17. As a trainee, I want the chosen line compared against feasible alternatives, so that claims of improvement have inspectable evidence.
18. As a trainee, I want reference timing to emerge from an achieved lap, so that grip is not adjusted merely to manufacture a desired time.
19. As a driver, I want the 24.499-second Real-World Benchmark kept separate from the simulated Reference Lap, so that I understand what each comparison means.
20. As a driver, I want a stable reference path during a session, so that its geometry remains learnable.
21. As a driver, I want live cues to account for speed, position, heading, and upcoming Turns, so that being slower than an isolated target does not always imply full throttle.
22. As a driver, I want braking cues to anticipate the next constraint, so that I have time to slow down before a Turn.
23. As a driver away from the reference path, I want conservative and relevant cues, so that an awkward recovery is not encouraged with misleading acceleration advice.
24. As a driver, I want Full, Corners Only, and Off Racing Line display options, so that I can choose how much guidance I see.
25. As a trainee, I want Reference Ghost Kart timing and motion to agree with the validated Reference Lap, so that the visual comparison represents an achievable performance.
26. As a trainee, I want Corner Drill entry speeds, reference times, apex targets, and coaching to agree with the selected Reference Lap, so that the training tools teach the same technique.
27. As a trainee, I want coaching to describe measured evidence rather than invent a cause, so that a missed apex alone is not presented as proof of late braking.
28. As a trainee, I want a pass judged against segment performance, so that a slow pass is not called optimal merely because other thresholds did not fire.
29. As a driver, I want a convincing electric rental Kart silhouette and proportions, so that the Kart feels like recognizable equipment rather than a collection of boxes.
30. As a driver, I want detailed chassis, wheels, seat, steering, and bodywork, so that both camera views look credible.
31. As a driver, I want believable rubber, plastic, and metal surfaces, so that the materials react differently to indoor light.
32. As a driver, I want the wheels and steering to animate correctly, so that visible movement corresponds to Kart motion.
33. As a driver, I want textured pavement, indoor surroundings, lighting, and shadows, so that the Circuit feels situated inside a venue.
34. As a driver, I want electric motor, tire, and collision sounds that respond to driving, so that I can hear acceleration, grip use, and contact.
35. As a driver, I want restrained acceleration, cornering, and impact camera feedback, so that I can perceive motion while retaining control.
36. As a driver, I want adjustable field of view and fully disableable camera motion, so that the presentation can remain comfortable.
37. As a driver, I want Helmet Cam and Chase Cam both supported, so that I can practice from my preferred perspective.
38. As a laptop player, I want adjustable graphics quality and a 60 FPS target, so that visual realism remains compatible with responsive driving.
39. As a player, I want assets sourced legally without paid purchases, so that this iteration remains usable within the agreed asset budget.
40. As a Time Trial driver, I want 12 timed laps by default, so that a normal session has a clear goal and ending.
41. As a Time Trial driver, I want the Flying Start approach excluded from the count, so that all 12 laps are complete timed laps.
42. As a Time Trial driver, I want contact laps to count toward session completion, so that mistakes do not make the session longer indefinitely.
43. As a Time Trial driver, I want only Clean Laps eligible for a Personal Best, so that contact does not create a misleading record.
44. As a Time Trial driver, I want the session to finish exactly once after lap 12, so that further simulation does not append accidental extra laps or mutate the result.
45. As a Time Trial driver, I want total time, individual lap times, clean/contact status, best Clean Lap, and Sector results, so that I can assess both pace and consistency.
46. As a Time Trial driver, I want restart available from results, so that I can begin another session easily.
47. As a practice driver, I want explicitly selectable unlimited Time Trial, so that I can train without a session limit when desired.
48. As a returning player, I want older Personal Bests and Ghost Karts preserved as legacy records, so that handling improvements do not silently erase previous achievements.
49. As a returning player, I want records separated by incompatible handling or Circuit versions, so that current comparisons remain meaningful.
50. As a player moving training data between browsers, I want export and import to preserve current and legacy records safely, so that the existing portable-data workflow remains useful.

## Implementation Decisions

- Preserve the custom deterministic 120 Hz planar Kart simulation architecture. Improve progressive grip-limited behavior within it instead of introducing a general-purpose 3D vehicle solver. Preserve the realistic 45 km/h limiter and electric solid-axle character.
- Correct Keyboard Assistance, including sustained-hold limits, reversal behavior, progressive pedals, and configurable sensitivity. Keep the player responsible for direction, braking points, and recovery. Retain analog gamepad input.
- Keep the supplied 11-Turn layout recognizable. Treat the existing 245 m length and approximately 4.8–6.0 m widths as initial estimates, not surveyed dimensions. Reassess scale after the handling pass; do not couple enlarged dimensions and higher speed as the initial control fix.
- Keep simulation integration through the existing session interface: driver inputs and session commands produce observable snapshots and portable training records. Add settings and bounded-session state at that boundary instead of exposing private dynamics or UI internals.
- Generate and compare complete-lap Racing Line candidates using corrected geometry. Account for connected Turns, steering continuity, grip, acceleration, braking, and swept Kart clearance. Derive useful apex targets from the selected path rather than treating every existing pinned apex as mandatory.
- Validate the selected candidate by executing controls under the player's dynamics. Reference speeds and timing must describe that achieved traversal. Compare against feasible centerline and prior-heuristic alternatives using a consistent protocol; identify an infeasible baseline as a failure rather than using it as a lap-time comparator.
- Report the fastest validated candidate found, without claiming a proven global optimum. Do not adjust grip solely to force the supplied Real-World Benchmark time.
- Derive Racing Line speed targets, Reference Ghost Kart playback, reference timing, and Corner Drill targets from one validated Reference Lap. The separately labeled Real-World Benchmark remains informational.
- Keep Racing Line geometry stable during a session while evaluating live guidance from the Kart's actual pose and upcoming constraints. Display modes affect visibility rather than changing the reference.
- Update Corner Drill coaching to follow measured segment evidence. Avoid unsupported causal labels or unconditional optimality claims. Preserve support for individual Turns and the five existing Corner Complexes.
- Build a convincing indoor electric rental Kart and venue using custom geometry and appropriately licensed free visual/audio material. Include material differentiation, surface detail, wheel and steering animation, indoor lighting/shadows, and responsive electric/tire/contact sound. No paid purchases are authorized.
- Support both camera views with adjustable field of view and camera feedback. Default to restrained motion and allow it to be fully disabled. Graphics quality must be adjustable.
- Time Trial defaults to 12 completed timed laps. The Flying Start approach is uncounted. Barrier-contact laps count toward the limit while remaining ineligible for Clean Lap Personal Bests. Unlimited practice is an explicit alternative.
- Expose a stable completed-session result containing total time, each lap's time and clean/contact status, best Clean Lap, and Sector results. Finish once and support restart without corrupting saved records.
- Version incompatible handling/Circuit records. Preserve legacy data separately from current Personal Best and Ghost Kart comparisons, including portable import/export and malformed-data resilience.
- Measure performance on a production build with recorded hardware, browser, viewport, pixel ratio, quality, and scenario. Target 60 FPS on suitable laptop settings; report local measured evidence separately from broader hardware targets.

## Testing Decisions

- Primary automated seam: the existing simulation-session boundary. Supply realistic input sequences and public session commands, then assert observable Kart behavior, lap lifecycle, guidance, replay, settings, and exported records. Reuse this seam rather than creating test-only access to private state.
- Good tests establish player-visible behavior and physical/lifecycle invariants; they do not assert copied formulas, internal iteration counts, a predetermined 24.499-second answer, or a specific mesh hierarchy.
- Prior art includes existing session-level handling, Time Trial, Corner Drill, camera/minimap, persistence, and Racing Line tests. Replace obsolete assumptions where behavior intentionally changes rather than retaining tests that enshrine the original defects.
- Handling coverage includes short taps, sustained steering at speed, left/right reversal, pedal progression, analog support, progressive consequences of excess entry speed, and deterministic repeated runs. Keyboard drivability requires keyboard scenarios; an analog autopilot alone is insufficient.
- Reference-lap coverage executes the exact selected control sequence and checks clearance, completion, steering continuity, speed/grip constraints, consistent elapsed time, start/finish wrap, and connected Turns. Compare feasible candidate/baseline results with the same protocol. Include failure reporting for infeasible alternatives.
- Guidance coverage includes braking anticipation, a slow but badly positioned Kart, recovery away from the path, and consecutive Turns. Confirm that reference playback, targets, and coaching agree and that display selection does not alter the reference.
- Lifecycle coverage excludes Flying Start approach from the count, includes contact laps, finishes exactly after 12 timed laps, preserves results afterward, supports restart and unlimited practice, and retains Clean Lap eligibility rules and Sector results.
- Persistence coverage checks current/legacy separation, preservation of old data, portable round trips, incompatible data, malformed input, and storage failures through session construction and public import/export.
- Browser validation covers actual key handling/focus, driver and graphics settings, results/restart, camera switches, sound activation, and visible Racing Line modes. Inspect both camera views in motion and review screenshots for Kart proportions, material detail, lighting, shadows, and pavement.
- Performance validation uses an identical warmed-up lap with Racing Line and both Ghost Karts visible, checks both camera views, and includes a full 12-lap run for accumulating cost. Record frame-time distributions and hitches, not average FPS alone. The available M5 Pro MacBook Pro is a local reference, not proof of a generic laptop minimum.
- Run relevant automated tests, type checking, and the production build. Record visual, audio, keyboard, and performance evidence and any remaining limits in the implementation report.

## Out of Scope

- AI opponents, multiplayer, grid competition, overtaking systems, or a separate competitive Race mode.
- Paid asset purchases, asset scraping, or inclusion of material without appropriate rights.
- A general-purpose full-3D vehicle physics migration, suspension simulation for a passenger car, or forced drifting behavior.
- Enlarging the Circuit and increasing maximum speed together as the initial handling solution.
- Claims of surveyed venue dimensions based only on the supplied diagram and sign photograph.
- A guaranteed globally optimal Racing Line or a mandated simulated lap time of 24.499 seconds.
- Automatic Racing Line following, automatic choice of braking points, or autonomous recovery while the player drives.
- Claims of measured 60 FPS across untested laptop hardware.
- A scanned digital twin of the exact venue or an externally purchased Kart model.

## Further Notes

This iteration supersedes the forced-time calibration, mandatory per-Turn apex clipping, synthetic Track Record Ghost, and endless-default Time Trial requirements in [the original specification](https://github.com/Alred21/apex-bite/issues/1). Other original capabilities remain supported unless explicitly changed above.

GRID Legends is an experience reference for adjustable controls, Racing Line Full/Corners Only/Off options, field of view, and camera feedback. EA's published controls and gameplay documentation do not disclose its Racing Line optimizer or internal physics; do not claim to reproduce those algorithms.

The first-iteration baseline passes 17 automated tests. Those tests include assumptions being deliberately replaced, notably forced benchmark timing and apex-pinning checks. Successful implementation requires stronger behavioral evidence, not merely keeping that original suite green unchanged.

Source references: [GRID Legends controls](https://www.ea.com/able/resources/grid/grid-legends/pc/controls) and [GRID Legends gameplay settings](https://www.ea.com/able/resources/grid/grid-legends/pc/gameplay).
