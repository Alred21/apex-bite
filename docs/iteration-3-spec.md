## Problem Statement

Iteration 2 makes Apex Bite substantially more controllable and visually convincing, but several details still interrupt useful Kart practice. S feels awkward as the main brake, Space currently bypasses progressive braking, and a driver stuck against a Barrier must reset because backward motion is unsupported.

The detailed Kart has no driver in either view, and the steering wheel appears oversized. Wheel dimensions, seating, and the nearby Helmet Cam need coherent calibration rather than an isolated arbitrary shrink.

The Racing Line is fixed in position but remains close to the Circuit Centreline. The existing bounded search shifts whole Corner Complexes sideways and cannot independently express deliberate Turn entry, movable Apex, and exit placement. Its small measured advantage over the centreline does not establish useful cornering-line coverage. Apex training targets also remain tied to a fixed Circuit station. The nearly opaque ribbon and mixed recovery/speed colors obscure the intended model: fixed useful placement with live speed-based advice.

## Solution

Deliver a focused third iteration of the existing solo K1 Toronto trainer. Make Space a progressive Brake/Reverse control, support deliberate low-speed reversing and remapping, add a believable seated driver with coherent Kart/camera proportions, and improve the actual Racing Line.

Evaluate smooth entry/Apex/exit alternatives and connected-Turn compromises under the player's existing dynamics. Use achieved whole-lap performance to choose the fastest validated candidate found. Keep its path, speeds, timing, Ghost Kart, actual Apex targets, Corner Drills, and coaching consistent. Freeze reference placement during driving while translucent upcoming sections communicate live speed and advance braking demand. Preserve current training modes, realistic forward speed, record safeguards, and adjustable presentation.

## User Stories

1. As a keyboard driver, I want to use Space as my normal progressive brake, so that braking feels comfortable without changing into an abrupt emergency input.
2. As a keyboard driver, I want to retain progressive steering and pedal response, so that iteration-2 controllability remains familiar.
3. As a driver, I want to hold Brake/Reverse after stopping without moving backward, so that hard braking cannot unexpectedly reverse the Kart.
4. As a driver, I want to release and press Brake/Reverse again from standstill to back up, so that I can deliberately recover from a mistake.
5. As a driver, I want to steer while reversing away from a Barrier, so that I can escape without resetting the session.
6. As a driver, I want to have reverse limited to 8 km/h, so that recovery remains controllable.
7. As a driver, I want to use accelerator to stop backward motion before resuming forward travel, so that direction changes feel coherent.
8. As a driver, I want to see a clear reverse indicator, so that I know which direction the Kart is driving.
9. As a driver, I want to see wheel movement and hear existing sound feedback agree with motion, so that recovery feels connected to the Kart.
10. As a gamepad driver, I want to use the same deliberate brake/reverse transition with analog pedals, so that recovery is available without switching devices.
11. As a gamepad driver, I want to retain immediate analog release and neutral-input behavior, so that pedals do not remain latched.
12. As a driver, I want to retain R as a fallback reset, so that I can recover from a situation I cannot drive out of.
13. As a driver, I want to have reset and practice-mode changes clear stale recovery inputs, so that a fresh run starts predictably.
14. As a driver, I want to have focus loss and dialogs release held inputs, so that returning to the game requires deliberate fresh input.
15. As a keyboard driver, I want to remap accelerator, Brake/Reverse, and steering, so that I can choose a comfortable layout.
16. As a keyboard driver, I want to see my current bindings and restore defaults, so that I can understand and undo my control changes.
17. As a keyboard driver, I want to receive explicit handling of conflicting bindings, so that one key does not silently perform incompatible actions.
18. As a keyboard driver, I want to see control hints match active bindings, so that the interface teaches the controls I actually use.
19. As a keyboard driver, I want to retain settings across reset and practice-mode changes, so that I do not need to reconfigure each attempt.
20. As a keyboard driver, I want to have settings return focus to driving, so that I can resume immediately after closing the dialog.
21. As a driver, I want to type in forms and use browser modifier shortcuts normally, so that game controls do not interfere with ordinary browser actions.
22. As a driver, I want to backtrack across Start/Finish and Sector boundaries without completing false laps, so that timing remains trustworthy.
23. As a driver, I want to retain measured Sector splits and ordered full-Circuit lap completion, so that a recovery cannot manufacture results.
24. As a driver, I want to retain the existing Clean Lap rules, so that recovery does not silently introduce a new penalty.
25. As a returning driver, I want to keep compatible Personal Bests and preserved legacy records, so that iteration 3 does not erase my training history.
26. As a driver, I want to have Ghost Kart and live time comparisons handle backward progress safely, so that recovery does not produce fabricated comparisons.
27. As a driver, I want to see a believable helmeted rental-Kart driver in Chase Cam, so that the Kart looks occupied and properly proportioned.
28. As a driver, I want to see appropriate hands, arms, and body in Helmet Cam, so that the first-person view feels like driving a Kart.
29. As a driver, I want to see hands remain on the steering wheel throughout steering, so that visible driver movement matches my inputs.
30. As a driver, I want to have the driver seated correctly with plausible proportions, so that the body fits the existing Kart.
31. As a driver, I want to have wheel size, driver posture, eye position, and camera framing calibrated together, so that the steering wheel no longer dominates the view incorrectly.
32. As a driver, I want to retain a clear view of the track without distracting body clipping, so that presentation supports precise driving.
33. As a driver, I want to retain adjustable field of view and disableable camera feedback, so that I can keep both views comfortable.
34. As a player, I want to benefit from suitable existing free assets where available, so that development effort goes toward useful improvements.
35. As a project maintainer, I want to have unsuitable asset parts adapted or authored when necessary, so that the driver fits this game rather than dictating its appearance.
36. As a project maintainer, I want to retain asset sources, licenses, and required attribution, so that the adopted assets remain traceable and reusable within their terms.
37. As a trainee, I want to follow a Racing Line with deliberate entry, Apex, and exit placement, so that I learn useful corner positioning.
38. As a trainee, I want to see the line use appropriate track width with whole-Kart clearance, so that the guidance avoids teaching centreline driving or Barrier contact.
39. As a trainee, I want to practice a Late Apex where it improves the exit or next Turn, so that the game reflects the technique I want to learn.
40. As a trainee, I want to see different Apex choices where Turn geometry and following sections warrant them, so that the guidance does not impose the same pattern everywhere.
41. As a trainee, I want to follow connected-Turn compromises, so that an individual Turn does not sacrifice the whole sequence.
42. As a trainee, I want to have the selected reference prioritize achieved whole-lap performance, so that the guide represents a fast complete traversal.
43. As a trainee, I want to have reference candidates execute under the same Kart dynamics I use, so that the proposed technique is physically achievable.
44. As a trainee, I want to see the actual achieved reference path, so that an attractive but undriveable proposal is not presented as guidance.
45. As a trainee, I want to have Racing Line position stay fixed during play, so that I can learn and repeat its placement.
46. As a driver, I want to see each upcoming line section change color with live speed and braking demand, so that I know whether to build speed, coast, or brake.
47. As a driver, I want to receive braking warnings before the corner constraint, so that I have time to slow down.
48. As a driver, I want to see a faster and slower approach produce appropriately different warnings, so that the colors reflect my actual driving.
49. As a driver, I want to receive explicit recovery explanations without the reference path moving, so that I can distinguish recovering alignment from following the ideal route.
50. As a driver, I want to see a visibly translucent Racing Line, so that the pavement and surrounding track remain readable.
51. As a driver, I want to have a readable broken or chevron treatment reviewed in both views, so that the line communicates direction without looking like a solid strip.
52. As a driver, I want to retain Full, Corners Only, and Off display modes, so that I can choose my level of assistance.
53. As a driver, I want to have display modes leave physics, reference timing, and Ghost Kart behavior unchanged, so that visibility preferences do not change the training target.
54. As a trainee, I want to have the Reference Ghost Kart follow the same achieved path and timing as the Racing Line, so that the visual comparison is consistent.
55. As a Corner Drill trainee, I want to have Apex Proximity use the selected traversal's actual Apex, so that a Late Apex is judged at the right place.
56. As a Corner Drill trainee, I want to have Flying Entry, speeds, reference times, and coaching follow the selected Reference Lap, so that each attempt teaches a coherent technique.
57. As a Corner Drill trainee, I want to retain all eleven Turn drills and five Corner Complex drills, so that the improved line benefits the existing practice coverage.
58. As a trainee, I want to receive coaching supported by measured driving evidence, so that the game does not invent a cause for a slower pass.
59. As a reviewer, I want to inspect an annotated overlay of centreline, current line, and selected line, so that I can judge placement across all eleven Turns.
60. As a reviewer, I want to inspect detailed hairpin and connected-Turn comparisons, so that I can understand the chosen Apex and exit trade-offs.
61. As a reviewer, I want to compare achieved lap and Complex times under identical dynamics, so that reported improvement is meaningful.
62. As a reviewer, I want to see repeated clean replay and continuity evidence, so that the reference is stable beyond one lucky lap.
63. As a player, I want to avoid a Racing Line search running during live driving, so that guidance does not interrupt responsiveness.
64. As a player, I want to retain adjustable graphics quality and responsive driving in both views, so that the added driver and line treatment remain practical in a browser.
65. As a reviewer, I want to see recorded hardware, browser, quality, startup cost, and frame-time measurements, so that I can assess performance claims and their limits.
66. As a Time Trial driver, I want to complete the existing twelve-lap session and review stable results, so that the integrated changes preserve the training flow.
67. As a practice driver, I want to retain unlimited practice, restart, record portability, and legacy separation, so that iteration 3 fits the existing workflow.
68. As a trainee, I want to keep the Real-World Benchmark clearly separate from simulated reference performance, so that lap-time comparisons remain honest.
69. As a project maintainer, I want to keep this iteration focused on the agreed driving and learning problems, so that new systems do not consume effort without demonstrated value.

## Implementation Decisions

- Preserve the custom deterministic 120 Hz planar Kart solver, recognizable eleven-Turn Circuit, 45 km/h forward limit, electric solid-axle character, and separation of the 24.499-second Real-World Benchmark. Respect ADR-0001, ADR-0002, and ADR-0003.
- Extend existing driver-input, world-motion, and Session state only as needed for deliberate backward movement. Direction, collision response, visual wheel rotation, existing audio feedback, and the HUD must agree. A new transmission simulation is unnecessary.
- Holding Brake/Reverse through a stop holds position. Only a release and fresh press from standstill engages reverse; repeated keydown events do not constitute a fresh press. Reverse is limited to 8 km/h. Accelerator first stops backward motion, then resumes forward travel without flipping velocity instantaneously.
- Apply equivalent transitions to gamepad pedals while preserving analog pressure and neutral behavior. Reset, input release, dialog pause, and practice changes clear stale engagement state.
- Make Space progressive normal Brake/Reverse. Retain existing accelerator/steering aliases and secondary S/Down Brake/Reverse aliases as defaults, with a small remapping UI for the four core driving actions, clear conflict handling, active hints, and default restoration. Preserve browser/form behavior and predictable focus return.
- Reuse the existing Session interface as the primary behavior boundary: inputs and session commands yield observable snapshots and replay/portable records. Extend that boundary only for observable requirements; do not expose private dynamics to tests or UI.
- Keep ordered full-Circuit lap completion and measured Sector splits correct during backtracking. Preserve current Clean Lap rules: Barrier contact invalidates a Clean Lap; reverse alone adds no new penalty. Handle backward progress safely in saved Ghost samples and live comparisons instead of inventing times.
- Preserve compatible Personal Bests, portable data, and existing legacy records. If an actual handling or reference-comparison incompatibility is introduced, represent it explicitly using existing revision mechanisms rather than deleting records or needlessly invalidating compatible data.
- Add one believable helmeted seated player driver. Inspect free asset files, actual license, rig, material/texture cost, and seated suitability before selection; adapt or author geometry as needed and retain required credits. Listing metadata is not an approved asset.
- Keep steering-linked hands/arms modest. Calibrate physical wheel dimensions, body proportions, seating, eye position, and camera framing together. Use appropriate first-person geometry visibility while retaining the third-person body; preserve FOV and camera-motion settings.
- Replace the restrictive whole-Complex-offset proposal family with bounded smooth entry/Apex/exit alternatives that can vary Apex position and linked-Turn setup. Use available corridor width with whole-Kart clearance and feasible steering.
- Optimize achieved whole-lap time, not isolated Turn time, minimum curvature alone, or compliance with a textbook visual pattern. Explore Late Apex alternatives where useful; do not require Late Apex at every Turn. Preserve current and centreline baselines for comparison under identical final dynamics.
- Retain shared-dynamics execution, complete state/command recording, warmup/closure evidence, and repeated clean replay. Publish observed traversal geometry rather than a requested path the Kart did not execute.
- Derive each training Apex from the selected traversal inside the relevant Turn window rather than a fixed Circuit Apex station or minimum-speed sample alone. Propagate selected geometry and timing consistently to every existing reference consumer, including all sixteen drills.
- Keep Circuit-progress station coordinates consistent for reference lookup, Ghost timing, and coaching. Wider or cutting paths alter actual travel distances, so verify braking lookahead against the revised geometry without silently changing coordinate meaning.
- Freeze path position during play. Color relevant upcoming sections from current speed and upcoming speed/braking demand, anticipating constraints rather than reacting only at the Apex. Green communicates room to build speed, yellow transition/coasting, and red braking demand. Keep conservative recovery explanations explicit in the HUD; do not present a misleading acceleration instruction when poorly aligned or reversing.
- Preserve Full, Corners Only, and Off. Tune opacity, width, and a broken/chevron treatment using both camera views and real pavement backgrounds. No exact GRID opacity or proprietary color formula is assumed.
- Bound candidate evaluation, cache reference data, and keep search outside live driving updates. Consider precomputation only if measured startup cost justifies it. Avoid a general optimizer or AI training infrastructure for one Circuit and one Kart.
- Deliver the geometry change first through a representative hairpin with complete reference/training integration, then extend comparisons across the full Circuit and connected Turns. Keep independent controls, driver, and visual-guidance work separate until final integrated verification.
- An annotated full-Circuit comparison and representative in-motion views are acceptance evidence. Report achieved improvement and limits without claiming a proven global optimum. Algorithm details, asset choice after inspection, exact visual tuning, and simple UI details remain implementation discretion within these requirements.

## Testing Decisions

- Confirmed primary seam: drive the public SimulationSession with normal keyboard-action, analog/gamepad, and Session commands; observe snapshots, retained reference replay, lap results, Ghost poses, and exported/imported records. Prefer this highest existing boundary to unit tests of internal helpers.
- Confirmed complementary check: extend the existing real browser harnesses for the actual driver-controls adapter, HUD dialogs, Kart presentation, cameras, and renderer. This verifies behavior unavailable at the headless Session seam without introducing a new general test framework.
- Good tests assert user-observable behavior and physical/training invariants. Do not assert helper-call order, a particular search implementation, an arbitrary exact candidate count, or an invented target lap time.
- Prior art includes public-session Keyboard Assistance, deterministic Reference Lap replay and twelve-lap repetition, reference-guidance scenarios, Corner Drill reference consistency, record portability, ordered Sector/full-lap integrity, and real-HUD dialog focus checks.
- Exercise progressive Space braking, held-stop behavior, release/repress reverse engagement, key-repeat handling, reverse cap, steering and Barrier recovery, accelerator transition, gamepad analog/neutral behavior, reset, and input release. Verify forward-only baseline behavior remains consistent.
- Exercise real remapping/default restoration, conflict handling, alias holds, form typing, browser modifiers, dialog close/cancel, focus return, and fresh-input requirements through the actual browser adapter.
- Test reverse recrossings of Start/Finish and Sector boundaries, measured split/lap integrity, Clean Lap eligibility, backward-progress Ghost/time comparisons, and compatible/legacy portable data behavior.
- Validate achieved Reference Lap commands through the ordinary solver, swept whole-Kart clearance, feasible steering, start/finish continuity, and twelve consecutive clean laps without state resets. Compare the selected result with current and centreline baselines under identical dynamics.
- Inspect annotated entry/Apex/exit placement for all eleven Turns and detailed hairpin/connected-Turn examples. Verify alternatives include meaningful Apex movement and that every actual Apex target, reference speed, Ghost pose/time, drill entry/target, and coaching result follows the selected traversal.
- At identical position/heading, compare faster and slower approaches and anticipated braking. Cover linked Turns, displaced/misaligned recovery, stopped/reversing states, and mode-independent geometry/timing.
- Visually inspect both camera views in motion for body proportions, hand grip, wheel scale, clipping, track visibility, fixed line placement, transparency, colors, and reverse feedback. Pixel-perfect screenshots alone are insufficient.
- Measure a production build's cold reference construction and warmed frame timing in both cameras with driver, Racing Line, and Ghost Karts visible. Record hardware, browser, viewport, DPR, quality, mean and percentile frame timing, and hitches; include a full twelve-lap session for accumulating cost. Target 60 FPS at an appropriate existing preset and distinguish measured local evidence from untested laptop claims.
- Run relevant existing behavior/browser suites and required type checking and production build during implementation. Final integration checks do not replace each slice's own verification.

## Out of Scope

New opponent racing or AI behavior; rewind/Flashback; career, multiplayer, damage, or transmission systems; a replacement physics engine; Circuit resizing or grip/speed changes to manufacture lap-time gains; global-optimality proof; driver customization, locomotion, or ragdoll systems; a broad venue rebuild; paid asset purchases; a general optimization/training service; and production deployment without separate task authorization.

## Further Notes

- The user accepted the iteration-3 design, test seams, ticket granularity, and blocking edges. The approved specification is ready for agent implementation through its child tickets.
- Iteration 2's selected lap is 45.791667 s against 45.983333 s for the centreline baseline, a 0.417% improvement. These are baseline observations to reproduce under the final dynamics, not fixed future target times.
- EA documents [GRID Legends control remapping and Brake/Reverse](https://www.ea.com/able/resources/grid/grid-legends/pc/controls) and [Racing Line display and camera settings](https://www.ea.com/able/resources/grid/grid-legends/pc/gameplay). No public disclosure of Legends' reference-path generator or live-color algorithm was located; do not claim the project reproduces proprietary internals.
- A [direct GRID Autosport developer interview](https://www.pcgamesn.com/how-codemasters-teach-ai-drive) describes authored track guidance and simulation-based AI refinement. It is historical inspiration for measured iteration, not evidence of Legends' displayed assist implementation.
- [Driver61's corner-technique guidance](https://driver61.com/uni/different-corner-technique/) motivates context-dependent Apex choices and exit priorities. Validate those principles against this Kart rather than copying car-specific assumptions.
- Candidate assets include the [BELAZ race driver](https://sketchfab.com/3d-models/race-driver-e4e97df9865d466c8359fbb23e757308), [Kenney Car Kit](https://kenney.nl/assets/car-kit), and [Quaternius base characters](https://quaternius.com/packs/universalbasecharacters.html). Actual fit and downloaded license terms require inspection; no candidate has been selected.
