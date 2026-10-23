## Parent

[Iteration 4 specification #33](https://github.com/Alred21/apex-bite/issues/33)

## What to build

Use the qualifying faster Reference Lap throughout full-Circuit practice, Ghost Karts, live guidance, Apex targets, and all Corner Drills without losing compatible training history.

## Acceptance criteria

- [ ] Adopt only a candidate that demonstrably beats the comparable iteration-3 reference and satisfies the agreed robustness/execution criteria; retain the supporting experiment evidence and selected recipe/control data.
- [ ] Publish the achieved traversal and keep Racing Line geometry, speeds/timing, ghost steering/timing, Apex targets, Flying Entries, drill timing, and coaching consistent.
- [ ] Preserve fixed line placement, existing Full/Corners Only/Off modes and speed-color semantics; verify advance-braking lookahead uses the changed physical path distances correctly.
- [ ] Verify stable start/finish continuity and repeatable clean replay using the existing deterministic multi-lap protocol, plus consistent results for all eleven Turn and five Corner Complex drills.
- [ ] Preserve compatible Personal Best and Sector records and older steering-animation fallback. Archive obsolete drill benchmarks only where actual entry/gate compatibility changes, retaining portable round trips.
- [ ] Keep runtime to selected-reference validation/caching; measure cold construction and cached use. Candidate search never enters live driving.
- [ ] If the experiments yield no qualifying candidate, retain the current reference, report this ticket's unmet objective, and leave adoption unresolved pending an agreed next step. Do not mark a retained old reference as the promised improvement.
- [ ] Complete public Session/reference/record/drill/guidance tests and relevant browser/type/build checks. Retain inspectable before/after evidence.
