# Iteration 4 directions

Status: consolidated direction accepted by the user after Q10 on 2026-10-23. The user requested specification and GitHub ticket creation next. This is a design record, not an implementation report.

## Agreed direction

- Correct Helmet Cam steering-wheel and hand movement so it agrees with steering direction. Check coherent front-wheel, steering-wheel, and hand movement in both cameras.
- Ghost Karts must use the current Kart and driver appearance, staying consistent as the normal model evolves. Retain translucent replay presentation and the existing independent overlap suppression.
- Record steering for new Personal Best replays and use available Reference Lap steering so ghost wheel and hand animation follows the replay. Preserve older Personal Bests with inferred steering animation; that fallback must not alter replay position or timing. This decision does not promise exact reconstruction of unrecorded historical steering.
- Improve the Kart and helmeted driver's proportions, materials, seated posture, hands, and steering movement as a convincing indoor rental Kart. Review both cameras, with particular scrutiny of Helmet Cam. Preserve current handling and Circuit geometry.
- Inspect suitable appropriately licensed free assets first; adapt them or create original geometry where needed. Paid assets are outside this iteration's agreed scope.
- Review an in-game comparison against iteration 3 before completing visual integration: matching before/after views, left/right steering motion in Helmet Cam, seated posture in Chase Cam, and a separated Ghost Kart showing the same model. Judge proportions, materials, hand grip, clipping, and readability. Retain the existing 60 FPS target and measure performance in both cameras with the updated driver and visible ghosts.
- Remove floating Turn numbers from the 3D scene in both cameras. Retain minimap numbers and Turn identification in drill selection, coaching, and results.
- Racing Line acceptance requires measured improvement against iteration 3 under unchanged dynamics, an explanation of entry/Apex/exit placement through all eleven Turns and connected-Turn compromises, and repeatable Clean Lap execution. Optimal means the best supported result of a credible search, without a global-optimality promise.
- Select the fastest candidate that also satisfies explicit Barrier-clearance and steering-smoothness criteria. Reject small time gains that depend on negligible clearance or abrupt repeated steering corrections. Measure the trade-offs before setting numerical thresholds; the interview's 0.2-second gain and 2-centimetre clearance were illustrative, not thresholds.
- Investigate speed, braking, and tracking-control choices alongside stronger multi-pass/multi-start path searches. Compare approaches offline under unchanged player physics and choose from measured results before committing to a larger optimizer. Candidate generation and optimization remain outside live driving.
- Keep Racing Line placement, Reference Lap speeds/timing, Ghost Kart timing, Apex targets, and training comparisons consistent under ADR-0003.
- Bound Racing Line investigation to comparative experiments in stronger geometry search and speed/control choices. If neither produces a faster reference meeting the robustness criteria, retain the current reference and report the limiting evidence and a specific proposed next step before expanding scope. In that outcome the Racing Line objective remains unmet; steering, model, and label improvements can stand independently.

## Acceptance and implementation discretion

Verify steering direction in motion in both cameras, current-model parity for Reference Lap and Personal Best Ghost Karts, recorded steering on new replays, and older-record animation fallback without changes to replay position or timing. Preserve independent overlap suppression and demonstrate that separated ghosts remain readable.

Check that floating Turn numbers are absent in both cameras while minimap numbers, drill selection, coaching, and results retain their Turn identification.

Compare Racing Line candidates against the iteration-3 baseline under identical player dynamics. Retain achieved lap and Corner Complex times, entry/Apex/exit explanations across all eleven Turns, whole-Kart clearance, steering-smoothness evidence, and repeatable clean execution. Verify consistency among the selected traversal, Ghost Kart, timing, Apex targets, and drills.

Asset selection and adaptation, rig construction, optimizer architecture, search budget, and numerical robustness thresholds remain evidence-dependent implementation choices within these constraints. Assess actual asset files and licenses before adoption. Set and report robustness criteria before accepting a winning candidate; a faster time alone does not waive them. The comparative experiment should expose its candidate coverage and stopping conditions. Broader scope changes require a concrete proposal supported by the experiment.

## Findings informing the interview

Code inspection and retained iteration-3 evidence support a reversed rim animation sign. The front tires use negative Y rotation for positive steering, while the rim uses negative X rotation; the driver grips follow the rim. See src/render/kart.ts and src/render/driver.ts. This has not been freshly reproduced in a live browser during this interview.

src/render/scene.ts constructs the player with createKartRig but builds Ghost Karts separately from three boxes and four cylinders without a driver. Existing GhostPose and GhostSampleFrame records retain position, heading, and speed, but not historical steering. Sharing the current appearance and reproducing exact historical articulation are separate requirements.

The current Kart and driver are procedural geometry. Iteration 3 did not adopt a downloaded driver asset; its earlier shortlist is not evidence that any candidate is suitable or available now.

The iteration-3 report records 165 candidates, 149 feasible, and a selected 41.558333-second lap against a comparable 45.850000-second iteration-2 baseline. It uses a single coordinate pass followed by two smoothing alternatives; earlier Turn choices are not revisited after later changes. Its speed profile and tracking controller retain fixed heuristics. These are existing implementation/report findings, not newly rerun performance results. See [iteration-3 reference evidence](iteration-3-reference-line.md) and src/simulation/reference-lap.ts.

Candidate search already runs offline; runtime executes and validates only the selected recipe. A broader offline search need not add search work during driving.

## Research

[Game AI Pro, chapter 39](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter39_Representing_and_Driving_a_Race_Track_for_AI_Controlled_Vehicles.pdf), by Tomlinson and Melder, describes authored or recorded racing lines and automated improvement evaluated through driven lap time. It recommends coherent changes to nearby points and run-up/multiple-lap measurement. This supports evaluating the actual Kart traversal, not choosing geometry solely for visual appearance.

[TUM's public trajectory optimizer](https://github.com/TUMFTM/global_racetrajectory_optimization/blob/master/Readme.md) distinguishes shortest-path, minimum-curvature, and minimum-time approaches. Its [minimum-time implementation](https://github.com/TUMFTM/global_racetrajectory_optimization/blob/master/opt_mintime_traj/Readme.md) jointly considers vehicle states and controls. This is autonomous-motorsport methodology, not evidence of a commercial game's displayed assistance-line implementation.

Q7 accepts the project-specific direction of investigating both path search and speed/control limitations while validating against the existing Kart dynamics. An optimizer architecture has not been selected.

## Confirmation

The user confirmed shared understanding of the consolidated direction after Q10. Implementation details above are deliberately delegated to evidence gathered during implementation; they are not silently fixed by this document. The user approved the test seams and ticket breakdown. The specification and ten tickets were published under the requested to-spec and to-tickets workflows; see the [GitHub ticket index](iteration-4-tickets.md).

## Documentation boundaries

The existing glossary defines Helmet Cam, Ghost Kart, Racing Line, and Reference Lap. Ghost Kart terminology now explicitly includes the current Kart and driver appearance. ADR-0003 records the accepted trade-off between raw lap time and a credible training reference. Straightforward presentation corrections do not merit separate ADRs.
