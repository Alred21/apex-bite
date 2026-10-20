# Executable Reference Lap

Ticket #13 replaces prescribed Racing Line timing with an actual deterministic traversal. The conservative centerline candidate completes the corrected estimated Circuit in **45.983333 seconds** under the same 120 Hz `stepKartOnCircuit` solver used by the driver, with no swept whole-Kart Barrier contact. The **24.499-second Real-World Benchmark** remains separately labeled; no grip parameter is adjusted to reproduce it. This conservative baseline remains the comparison starting point, not the default selected lap after ticket #14. The bounded connected-Turn search now selects a 45.791667-second achieved lap; see [the search report](iteration-2-reference-search.md). Neither result is a claim of a globally optimal line.

## Geometry and uncertainty

The original diagram normalization to 245 m produced four intersections between Barrier polylines and local offset folds. Its curvature calculation also underestimated curvature by approximately a factor of two. Keeping those intersecting physical walls makes honest validation impossible, independent of keyboard steering.

Following the grip-limited handling pass, geometry correction applies ten local binomial smoothing passes at the original approximately 0.5 m centerline sampling, then stretches center coordinates by 1.5 while retaining estimated 4.8–6.0 m widths and the 45 km/h limiter. Arc length, uniform samples, Turn anchors and Sector boundaries are derived again. The resulting estimated centerline length is **363.106914 m**; the eleven Turns and recognizable overall silhouette remain. Exported left/right Barrier polylines have no proper intersections. The Circuit revision is `k1-toronto-v2`; earlier achievements remain archived and exportable.

This is a physically coherent interpretation of the supplied diagram, **not a surveyed reconstruction or evidence that the physical Circuit is 363 m**. Better dimensioned source material should produce another explicit Circuit revision. Simply stretching the original unsmoothed trace required approximately 2.1× scale to remove folds, which enlarged it more than this local correction.

## Execution and replay contract

The pure Reference Lap builder imports the shared dynamics/world step and never creates a Session, preventing recursive Session initialization. It computes an initial conservative speed proposal from corrected curvature, a fixed conservative lateral allowance, and periodic acceleration/braking passes. A feedback driver executes the proposal through the ordinary analog-command solver. Two warm-up laps settle the dynamics; the third measured lap retains the complete initial Kart state, every normalized 120 Hz throttle/brake/steer command, every observed state and timestamp, and closure evidence.

The requested path is not published as though it had been driven. Racing Line positions, speeds and times come from the observed traversal. The Reference Ghost Kart samples recorded states by elapsed time; live reference comparisons interpolate observed time at Circuit progress. Corner Drill Flying Entries copy complete observed states, including velocity and yaw rate, and inside-front-tire targets come from the actual reference traversal.

`SimulationSession.getReferenceReplay()` returns a portable copy of this trace. `createSimulationSession({ referenceReplay: true })` starts a Session at its retained initial state, already in timed Lap 1, so a replay consumer can feed the returned commands to the ordinary `step(1 / 120, command)` method. `reset()` in that explicit playback Session restores the same reference start. Normal Sessions retain the uncounted Flying Start approach, sampled approximately 13.5 m before the finish. There is no autonomous steering during ordinary player driving.

The shared reference module exports the proposal execution protocol, curvature evaluation, observed state/time sampling and candidate evidence for subsequent comparison/guidance/coaching tickets. The cached baseline is frozen by Circuit identity; Session snapshots and replay exports cannot mutate it. Heavy candidate execution happens once rather than on every snapshot or render frame.

## Evidence

- Exact retained command replay through the public Session reproduces every recorded position to `1e-8` m, stays at or below 45 km/h, sets a Clean Lap Personal Best and matches the measured lap time.
- Warmed-lap start/end differences: **0.013536 m** position, **0.000448 rad** heading, **0.000889 m/s** speed, **0.000379 rad/s** yaw rate. These small differences are finite tick-crossing/settling tolerances; the replay is not claimed mathematically periodic.
- Repeating the input tape through twelve timed laps needs no state resets, produces zero Barrier contacts, and keeps each lap within 0.05 s of the retained time. With all twelve laps complete, Session results freeze normally.
- Reference Ghost Kart pose matches exact replay pose; live timing differs by less than 0.025 s because the stored displayed path is sampled in Circuit progress.
- The retained prior pinned-apex proposal is rejected because its local curvature exceeds the Kart's steering range. Its lap time is `null`, not a fabricated baseline comparison.
- The CLI prototype measured approximately 46 ms for initial construction on this machine before final cache freezing. This is a local sample, not a cross-device performance claim.

Old tests that mandated 24.499 s, clipping every old apex, sub-32-second completed laps or a 245 m geometry are replaced with executable traversal/physical corridor checks. Time Trial checks now allow the achieved lap duration and use a normal snapshot-observing analog test driver. Corner Drill checks replay actual retained commands; a deliberately wide pass that physically hits the Barrier is correctly expected to be a contact pass rather than a clean causal “late braking” diagnosis. Further evidence-based coaching changes remain ticket #16.

## Browser smoke check

The visible `tests/browser/reference-lap.html` button replays 1,600 ordinary Session ticks and renders the player, Racing Line and Reference Ghost Kart. Chrome reported **PASS**, maximum Ghost Kart error **1.99e-12 m**, zero Barrier contacts and live time delta **−0.002111 s**. The screenshot at `/private/tmp/apex-bite-reference-ghost.png` shows the stable line under the player with the gold Ghost Kart overlapping. This was one short visual agreement check, following CLI validation; no generic frame-rate claim is inferred from it.
