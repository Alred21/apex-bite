## Problem Statement

Iteration 3 leaves visible contradictions in the driving experience. In Helmet Cam, steering-wheel and hand animation appears opposite to the steering action. Ghost Karts still use an obsolete primitive model without a driver, so their appearance no longer matches the player's Kart. The Kart and driver remain visibly geometric, and floating Turn numbers clutter the 3D scene.

The Racing Line improved, but the previous bounded, single-pass geometry search does not establish that the reference is sufficiently good. Its largely fixed speed and tracking controller may limit both candidate performance and the assessment of otherwise promising paths. A fast, contact-free lap alone also does not establish a credible training target when clearance or steering behavior is unreasonable.

## Solution

Deliver a focused fourth iteration of the existing solo K1 Toronto trainer. Correct steering presentation; share the current Kart and driver appearance with Ghost Karts; replay new steering faithfully while preserving older records; and improve Kart and driver realism through inspected free assets, adaptation, or original work. Review the proposed presentation in-game before completing visual integration. Remove floating Turn numbers while preserving minimap and training identification.

Run bounded offline experiments in both geometry search and speed/braking/tracking control under unchanged player dynamics. Select the fastest achieved candidate meeting explicit clearance and smoothness criteria, with explainable placement through all eleven Turns and repeatable clean execution. Keep all training guidance synchronized with the chosen traversal. If no acceptable improvement is found, retain the existing reference, report the unmet objective and limiting evidence, and propose a specific next step before expanding scope.

## User Stories

1. As a Helmet Cam driver, I want to see the steering wheel rotate in the direction I steer, so that the visible action agrees with the Kart's response.
2. As a driver, I want to see both hands follow the wheel in the correct direction, so that my controls feel connected to the driver.
3. As a Chase Cam driver, I want to see coherent wheel, tire, and hand movement, so that I can interpret the Kart's steering.
4. As a driver, I want to retain existing steering assistance and handling, so that the presentation correction does not alter driving technique.
5. As a trainee, I want to see Ghost Karts use the current Kart geometry, so that spatial comparisons use a consistent silhouette.
6. As a trainee, I want to see the same driver in the player and Ghost Karts, so that the replay looks like the Kart I drive.
7. As a maintainer, I want to have future Kart and driver improvements apply to ghosts automatically, so that the models cannot drift independently.
8. As a driver, I want to distinguish Reference Lap and Personal Best ghosts through translucent presentation, so that I can identify the comparison.
9. As a driver, I want to keep overlapping ghost geometry from obscuring my view, so that I can read my own Kart and the track.
10. As a driver, I want to see each ghost fade back independently as it separates, so that comparisons remain readable without popping.
11. As a trainee, I want to see newly recorded Personal Best ghosts reproduce recorded steering, so that the replay communicates the original steering motion.
12. As a trainee, I want to see Reference Lap ghost steering follow available reference steering, so that the example shows the demonstrated control action.
13. As a returning driver, I want to retain older Personal Bests with inferred steering animation, so that my saved achievements remain useful.
14. As a returning driver, I want to keep older ghost positions and timing unchanged, so that animation improvements do not rewrite my lap.
15. As a driver, I want to export and import new steering-bearing replays, so that their animation survives a portable round trip.
16. As a driver, I want to have malformed replay imports rejected without losing valid records, so that my training history remains dependable.
17. As a driver, I want to see a convincingly proportioned indoor rental Kart, so that the driving scene resembles real Kart practice.
18. As a driver, I want to see believable Kart bodywork, tires, steering components, and materials, so that close views no longer look like placeholder geometry.
19. As a driver, I want to see a believable helmeted driver with natural seated proportions, so that the Kart looks occupied by a person.
20. As a Helmet Cam driver, I want to see convincing gloves, sleeves, and grip, so that the nearby details support immersion.
21. As a driver, I want to see hands remain on the wheel across the usable steering range, so that the pose remains plausible in motion.
22. As a driver, I want to have seating, wheel size, eye position, and camera framing calibrated together, so that the first-person view has coherent scale.
23. As a driver, I want to retain clear track sightlines without distracting body clipping, so that visual improvements support precise driving.
24. As a driver, I want to retain adjustable field of view and camera comfort settings, so that the improved model remains comfortable.
25. As a maintainer, I want to inspect suitable free assets before authoring replacements, so that existing work is used when it fits.
26. As a maintainer, I want to have unsuitable assets adapted or replaced with original geometry, so that asset availability does not dictate an unsuitable visual style.
27. As a maintainer, I want to retain asset origins, licenses, and required attribution, so that the adopted artwork remains traceable.
28. As a reviewer, I want to compare matching iteration-3 and proposed in-game views, so that I can judge the actual visual improvement.
29. As a reviewer, I want to inspect left/right steering motion and a seated Chase Cam driver, so that static screenshots do not hide animation problems.
30. As a reviewer, I want to see a separated current-model Ghost Kart during visual review, so that ghost parity is visible before final integration.
31. As a player, I want to retain the existing 60 FPS target with adjustable quality, so that more realistic assets remain practical in the browser.
32. As a driver, I want to see no floating Turn numbers in either driving camera, so that the 3D scene is less cluttered.
33. As a trainee, I want to retain Turn numbers on the minimap, so that I can locate each Turn.
34. As a trainee, I want to retain numbered drill choices, coaching, and results, so that training still refers to identifiable Turns.
35. As a trainee, I want to follow a faster validated full-Circuit Racing Line than iteration 3, so that the reference teaches a better-supported route.
36. As a trainee, I want to see deliberate entry, Apex, and exit placement through all eleven Turns, so that the line teaches positioning throughout the Circuit.
37. As a trainee, I want to see connected-Turn compromises explained, so that I understand why one Turn may sacrifice its own exit or time.
38. As a trainee, I want to practice appropriate Apex choices instead of a prescribed Late Apex everywhere, so that the reference follows the demands of each sequence.
39. As a reviewer, I want to compare candidates under unchanged player physics and Circuit geometry, so that reported gains reflect better execution.
40. As a reviewer, I want to see repeated path-search passes and multiple starting alternatives assessed, so that one greedy pass does not define the entire search.
41. As a reviewer, I want to see speed, braking, and tracking-control alternatives assessed, so that a poor automated driver does not unnecessarily reject a promising path.
42. As a trainee, I want to follow the fastest candidate satisfying clearance and steering-smoothness criteria, so that the training target is fast and credible.
43. As a reviewer, I want to see measured trade-offs inform explicit robustness thresholds, so that acceptance criteria have a defensible basis.
44. As a trainee, I want to avoid references whose small gain depends on negligible clearance or repeated steering snaps, so that the guide supports believable practice.
45. As a reviewer, I want to compare achieved full-lap and Corner Complex times against iteration 3, so that the performance claim is inspectable.
46. As a reviewer, I want to inspect achieved path overlays and hairpin/connected-Turn details, so that the selected placement is understandable.
47. As a trainee, I want to follow a repeatably executable Clean Lap under the same dynamics I drive, so that the reference is physically achievable.
48. As a driver, I want to have Racing Line placement remain fixed during driving, so that I can learn and repeat it.
49. As a driver, I want to retain live speed and advance-braking colors on the selected line, so that the guidance remains useful at different approach speeds.
50. As a driver, I want to retain Full, Corners Only, and Off line modes, so that I can choose my assistance level.
51. As a trainee, I want to have line geometry, speeds, timing, and Ghost Kart replay agree, so that the training example is coherent.
52. As a Corner Drill trainee, I want to have Flying Entry, Apex targets, timing, and coaching follow the selected reference, so that drills practice the same technique as full laps.
53. As a returning driver, I want to retain compatible lap and Sector records when the reference changes, so that a guidance improvement does not erase valid achievements.
54. As a returning driver, I want to have incompatible drill benchmarks preserved separately when entry conditions change, so that old achievements remain available without misleading comparisons.
55. As a player, I want to have candidate optimization run offline, so that search work does not interrupt live driving.
56. As a reviewer, I want to see bounded search coverage, stopping conditions, and rejected candidates, so that the evidence shows what was and was not explored.
57. As a reviewer, I want to have a failed improvement experiment reported explicitly, so that negative results are not disguised as completion.
58. As a maintainer, I want to retain the current reference when no acceptable faster candidate is found, so that an unsuccessful search does not ship a regression.
59. As a maintainer, I want to receive a specific evidence-backed proposal before optimizer scope expands, so that the iteration stays bounded.
60. As a reviewer, I want to see rendering performance measured with separated ghosts actually visible, so that overlap suppression does not hide the added rendering cost.
61. As a player, I want to retain Time Trial, Corner Drills, recovery controls, and saved-data behavior, so that the iteration fits the existing training experience.
62. As a trainee, I want to keep the Real-World Benchmark separate from simulated reference performance, so that the comparison makes no unsupported claim of real-world equivalence.

## Implementation Decisions

- Preserve the current Circuit, Kart collision dimensions, handling, speed limits, keyboard assistance, and training modes. Correct the rendering sign and associated articulation without changing physics to compensate.
- Use one current Kart-and-driver visual definition for player and both Ghost Kart types. Integrate any necessary prefactoring into the first demoable current-model ghost slice. Ghost materials, opacity, tint, and visibility must not mutate the player's appearance.
- Preserve independent overlap suppression and smooth reappearance for Reference Lap and Personal Best ghosts in both cameras. Rendering changes must leave replay poses, timing, collisions, and training results unchanged.
- Extend replay recording, portable persistence, interpolation, and rendering to carry steering for new Personal Best laps. Use available Reference Lap steering. Older compatible records without steering retain positions and timing and use a documented presentation-only approximation. Validate imported steering data and preserve atomic rejection and existing record compatibility rules; lack of steering alone does not invalidate an otherwise compatible record.
- Inspect actual free asset geometry, licenses, materials/textures, articulation, seated fit, and browser cost before adoption. Adapt suitable assets or author missing parts. Keep provenance and attribution. No paid purchase is authorized.
- Calibrate model proportions, seating, wheel grip, eye position, and camera framing together. Retain field-of-view and camera-comfort controls. Maintain current-model ghost parity as the Kart and driver change.
- Present matching iteration-3/proposed in-game views, steering motion, seated Chase Cam posture, and a separated ghost for user visual review before completing visual integration. Technical checks do not substitute for the accepted visual review checkpoint.
- Remove only the floating 3D Turn-number markers. Preserve minimap numbering and purposeful Turn references in drill selection, coaching, and results.
- Extend the existing offline reference-generation and evidence workflow rather than introduce a general optimizer service. Compare stronger geometry search with multiple starts/passes, then speed/braking/tracking alternatives on preserved baseline and promising geometry candidates under the same evaluation protocol.
- Establish measurable clearance and steering-smoothness criteria from recorded trade-offs before selecting the winning reference. Report measurement definitions, thresholds, candidate coverage, budgets, and stopping conditions. The interview's 0.2-second gain and 2-centimetre clearance were examples, not acceptance thresholds.
- Judge candidates by achieved full-lap time subject to robustness and executable controls. Retain continuous swept whole-Kart contact validation, stable lap closure, and repeated clean replay. Do not equate a curvature proxy, a visually attractive proposal, or a single successful traversal with the final training reference.
- Keep selected geometry, Reference Lap speed/timing, Ghost Kart steering/timing, actual Apex targets, Flying Entries, drills, and coaching consistent. Preserve fixed line placement, existing speed-color semantics, physical-distance braking lookahead, and common Circuit-progress comparisons.
- Preserve compatible Personal Best and Sector records. Preserve older handling/Circuit records as legacy; archive incompatible drill benchmarks only when actual entry/gate compatibility changes.
- Keep candidate search outside live driving. Continue runtime validation and caching of the selected reference. Measure startup and rendering cost rather than assuming a heavier model or new reference is free.
- Treat experiment completion and product acceptance separately. Negative experiments may finish with useful evidence; adopting a new reference and claiming the Racing Line objective complete still require a qualifying improvement. Other visual fixes can stand independently.
- Asset choice, animation details, optimizer architecture, exact experiment budgets, and numerical robustness limits remain implementation discretion within these outcomes. Any scope expansion must be supported by a specific evidence-backed proposal.

## Testing Decisions

- The user approved these test seams: public SimulationSession inputs, snapshots, reference replay, and training-data import/export form the primary behavior seam. Existing real-browser harnesses exercise the production renderer and HUD for things snapshots cannot establish. Existing offline generation/evidence entrypoints provide experiment results that are checked through achieved traversal and public Session behavior. No new general test framework or private pose-injection interface is needed.
- Good tests assert observable driving, replay, persistence, guidance, and rendered behavior. Avoid asserting private helper calls, an exact optimizer structure, mesh counts, arbitrary fixed candidate counts, or a particular asset hierarchy.
- Follow the existing public Session training-record, reference replay, full-Circuit reference, drill, and racing-guidance tests. Verify recorded steering survives a portable round trip, older records remain usable, malformed new fields are rejected atomically, and replay animation does not alter positions/timing or records.
- Follow the existing actual-canvas ghost overlap and presentation checks. Reproduce and retain evidence of the left/right defect, then verify correct rim/hand/tire direction in both cameras. Exercise Reference Lap, Personal Best, Both, and Off; include coincidence, partial/side overlap, one overlapping plus one separated ghost, separation, stopping, and reverse.
- Review current-model parity and realistic proportions/materials in both cameras, including visible ghosts, usable steering extremes, adjustable field of view, hand grip, clipping, and clear track sightlines. Retain matching before/after images and motion evidence for the agreed visual checkpoint.
- Verify floating labels are absent while minimap and drill/coaching/results identifiers remain present. Prefer focused browser inspection for this small presentation removal over implementation-mirroring tests.
- Re-execute the iteration-3 reference under the same comparison protocol used for candidates. Report achieved full-lap and Corner Complex times, actual entry/Apex/exit placement, clearance, smoothness, rejection reasons, start/finish continuity, and repeated clean execution. Use the existing deterministic repeated-lap and all-sixteen-drill checks as prior art.
- Check changed reference geometry against live braking colors and physical-distance lookahead while preserving Full, Corners Only, and Off semantics. Confirm line/Ghost/timing/Apex/drill agreement and record compatibility through public behavior.
- Each slice owns its relevant verification. Final integration reruns affected behavior/browser coverage, type checking, and production build, and reviews the combined training experience.
- Measure a production build's startup and warmed frame timing in both cameras with updated Kart, driver, Racing Line, and separated ghosts visible. Record hardware, browser, viewport, quality, DPR, mean/percentile frame times, and hitches against the existing 60 FPS target. Retain the prior four-lap browser QA scope and twelve-lap game default; deterministic replay checks are separate from browser measurement duration.

## Out of Scope

A replacement physics engine; Circuit resizing or grip/speed changes to manufacture gains; paid assets; a literal replica requiring new exact-K1 asset specifications; opponent racing, multiplayer, career, driver customization, locomotion, ragdolls, or a broad venue rebuild; a general optimization service or reinforcement-learning training system; proof of global optimality; exact reconstruction of steering absent from old recordings; changes to Ghost Kart replay position/timing; removal of minimap or training Turn identification; a redesigned Racing Line color treatment; unsupported claims of real-world lap improvement; and production deployment.

## Further Notes

- The user confirmed the consolidated iteration-4 direction after Q10 and subsequently approved the test seams, ten-ticket breakdown, and blocking edges. The specification and child tickets are authorized for GitHub publication.
- Existing reports record a 41.558333-second iteration-3 reference from 165 candidates, 149 feasible. This is a reported baseline to reproduce, not a newly measured result or a fixed future target.
- ADR-0002 preserves K1 Toronto training fidelity. ADR-0003 requires executable, coherent guidance and now records the trade-off between raw time and a credible robust training target.
- [Game AI Pro chapter 39](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter39_Representing_and_Driving_a_Race_Track_for_AI_Controlled_Vehicles.pdf) supports evaluating authored/perturbed paths through actual vehicle traversal and repeated lap measurement.
- [TUM's trajectory optimizer](https://github.com/TUMFTM/global_racetrajectory_optimization/blob/master/Readme.md) distinguishes shortest path, minimum curvature, and minimum time; its [minimum-time method](https://github.com/TUMFTM/global_racetrajectory_optimization/blob/master/opt_mintime_traj/Readme.md) considers states and controls jointly. This is autonomous-motorsport methodology, not evidence of a commercial game's displayed assist implementation.
- The GitHub parent and child issues use the existing ready-for-agent label, native sub-issue relationships, and native blocking dependencies. Keep the parent body/state unchanged while publishing the child tickets.

