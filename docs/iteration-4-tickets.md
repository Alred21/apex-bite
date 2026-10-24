# Iteration 4 tickets

Status: the user approved the test seams, ticket breakdown, and blocking edges. Published and verified on GitHub: [specification #33](https://github.com/Alred21/apex-bite/issues/33) and ten native sub-issues, #34–#43.

The local [specification](iteration-4-spec.md) synthesizes the accepted [design](iteration-4-design.md). The specification and every child have the ready-for-agent label. Native GitHub blocking relationships match the approved graph. The parent body and open state were preserved while creating its children.

## Accepted test seams

Use the existing public SimulationSession inputs, snapshots, reference replay, and portable training-data import/export as the primary behavior seam. Use existing real-browser harnesses with the production renderer/HUD for camera, geometry, animation, labels, and overlap visibility. Reuse offline generation/evidence entrypoints for bounded optimization experiments and verify achieved traversal through the existing replay/Session seam. No new general framework, private pose injection, or separate scaffolding ticket is needed.

## Published slices

1. **[#34: Make visible steering agree with driving direction](https://github.com/Alred21/apex-bite/issues/34)** — [local body](iteration-4-tickets/01-steering-direction.md)
   - Blocked by: None.
   - Delivers: Drive left and right with steering-wheel, front-tire, and hand movement that agrees in Helmet Cam and Chase Cam, without changing Kart handling.

2. **[#35: Render Ghost Karts with the current Kart and driver](https://github.com/Alred21/apex-bite/issues/35)** — [local body](iteration-4-tickets/02-current-model-ghosts.md)
   - Blocked by: None.
   - Delivers: See Reference Lap and Personal Best Ghost Karts use the same current Kart and driver appearance as the player, while preserving readable translucent comparisons.

3. **[#36: Replay recorded ghost steering while preserving older laps](https://github.com/Alred21/apex-bite/issues/36)** — [local body](iteration-4-tickets/03-ghost-steering-replay.md)
   - Blocked by: [#34](https://github.com/Alred21/apex-bite/issues/34), [#35](https://github.com/Alred21/apex-bite/issues/35).
   - Delivers: Watch new Personal Best and Reference Lap ghosts steer their wheels and hands from replay data, while older compatible saved laps remain usable with inferred animation.

4. **[#37: Drive a more realistic indoor rental Kart in both views](https://github.com/Alred21/apex-bite/issues/37)** — [local body](iteration-4-tickets/04-realistic-kart.md)
   - Blocked by: [#35](https://github.com/Alred21/apex-bite/issues/35).
   - Delivers: Drive and compare ghosts using a more convincing rental-Kart model with coherent proportions, bodywork, tires, steering components, and materials.

5. **[#38: Drive with a realistic seated driver and review the complete model](https://github.com/Alred21/apex-bite/issues/38)** — [local body](iteration-4-tickets/05-realistic-driver-review.md)
   - Blocked by: [#34](https://github.com/Alred21/apex-bite/issues/34), [#37](https://github.com/Alred21/apex-bite/issues/37).
   - Delivers: See a believable helmeted driver fitted to the improved Kart, with convincing hands and sleeves in Helmet Cam and seated posture in Chase Cam, and review the complete presentation before final integration.

6. **[#39: Remove floating Turn numbers while preserving training labels](https://github.com/Alred21/apex-bite/issues/39)** — [local body](iteration-4-tickets/06-turn-labels.md)
   - Blocked by: None.
   - Delivers: Drive with a cleaner 3D scene in both cameras while retaining numbered Turns on the minimap and throughout training navigation and feedback.

7. **[#40: Compare stronger Racing Line geometry searches with iteration 3](https://github.com/Alred21/apex-bite/issues/40)** — [local body](iteration-4-tickets/07-geometry-experiment.md)
   - Blocked by: None.
   - Delivers: Inspect a bounded, reproducible comparison showing whether stronger full-Circuit geometry search improves achieved reference laps under unchanged Kart dynamics.

8. **[#41: Compare reference speed and control choices on candidate Racing Lines](https://github.com/Alred21/apex-bite/issues/41)** — [local body](iteration-4-tickets/08-control-experiment.md)
   - Blocked by: [#40](https://github.com/Alred21/apex-bite/issues/40).
   - Delivers: Inspect whether improved speed, braking, and tracking choices produce a faster credible traversal on the baseline and promising geometry candidates, then select an evidence-backed adoption candidate or explain the limit.

9. **[#42: Practice against the improved coherent Reference Lap](https://github.com/Alred21/apex-bite/issues/42)** — [local body](iteration-4-tickets/09-adopt-reference.md)
   - Blocked by: [#41](https://github.com/Alred21/apex-bite/issues/41).
   - Delivers: Use the qualifying faster Reference Lap throughout full-Circuit practice, Ghost Karts, live guidance, Apex targets, and all Corner Drills without losing compatible training history.

10. **[#43: Verify the complete iteration-4 training experience](https://github.com/Alred21/apex-bite/issues/43)** — [local body](iteration-4-tickets/10-integrated-verification.md)
   - Blocked by: [#36](https://github.com/Alred21/apex-bite/issues/36), [#38](https://github.com/Alred21/apex-bite/issues/38), [#39](https://github.com/Alred21/apex-bite/issues/39), [#42](https://github.com/Alred21/apex-bite/issues/42).
   - Delivers: Review the combined steering, current-model ghosts, realistic Kart/driver, clean scene, and improved coherent Racing Line with reproducible behavior and browser-performance evidence.

## Dependency rationale

- Current-model ghosts deliver the necessary shared-model prefactoring as useful behavior, before the realism work consumes that shared definition.
- Recorded ghost steering depends on coherent steering presentation and the shared current model.
- Driver refinement fits the selected improved Kart and depends on corrected steering for meaningful motion review.
- The geometry experiment delivers the preserved baseline, measured robustness criteria, executable candidates, and comparison protocol needed by the speed/control experiment. This is a concrete evidence dependency, not an arbitrary ordering of independent research.
- Reference adoption consumes the completed combined comparison. Negative experiments can complete as investigations while adoption and full iteration acceptance remain unresolved.
- Final integration lists only terminal blockers; earlier dependencies are transitive. The initial frontier is #34, #35, #39, and #40.
- Each slice owns relevant checks. Visual review occurs before completing integration, as accepted in Q8.

## Publication verification

Verified the published specification and all ten child bodies against the local files; checked titles, ready-for-agent labels, open states, ten native parent/sub-issue links, and all eleven native blocking edges. GitHub holds the canonical issue relationships; local ticket bodies mirror the published text and this index records the blockers.

The publication task changed documentation only. Implementation is now underway on `feat/iteration-4`, tracked in [draft PR #44](https://github.com/Alred21/apex-bite/pull/44). At the user's request, finished tickets are closed as their implementation and verification complete, rather than waiting for PR merge.

## Implementation progress

- #34: merged; rendered steering regression and before/after state comparison pass. See [steering evidence](iteration-4-steering.md).
- #35: merged; current Kart/driver ghost parity and independent overlap checks pass. See [ghost evidence](iteration-4-current-model-ghosts.md).
- #39: merged; floating labels removed while minimap and training identifiers remain. See [label inspection](iteration-4-turn-labels.md).
- #40: merged; bounded geometry comparison finds a 41.316667-second candidate against the 41.558333-second baseline, with twelve clean replays. This geometry result preceded the later control comparison and adoption. See [geometry experiment](iteration-4-geometry-experiment.md).
- #36: merged; recorded steering, portable records, old-record inference, and both-camera articulation pass. See [ghost steering evidence](iteration-4-ghost-steering.md).
- #41: merged; the bounded 144-case comparison selects 38.225 seconds, passing the unchanged robustness gates and twelve clean replay laps. See [control comparison](iteration-4-control-experiment.md).
- #37: merged; scoped original Kart refinement, asset inspection, matching views, ghost parity, and focused rendering checks pass. See [Kart evidence](iteration-4-kart.md).
- #42: merged; the live 38.225-second reference includes tuned settings and runtime content validation. Eighty-eight tests, twelve clean replay laps, all sixteen drills, and compatible-record checks pass. See [adoption evidence](iteration-4-adoption.md).
- #38's technical implementation and rendered checks are complete on its isolated review branch; the required user visual acceptance remains pending. The unchecked review criterion remains open on GitHub. #43 retains that prerequisite before final integration acceptance.
- #34, #35, #36, #37, #39, #40, #41, and #42 are closed on GitHub with checked acceptance criteria and linked evidence. #38, #43, and parent #33 remain open until their acceptance work is complete.
