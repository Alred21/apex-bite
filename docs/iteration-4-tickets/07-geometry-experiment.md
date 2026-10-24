## Parent

[Iteration 4 specification #33](https://github.com/Alred21/apex-bite/issues/33)

## What to build

Inspect a bounded, reproducible comparison showing whether stronger full-Circuit geometry search improves achieved reference laps under unchanged Kart dynamics.

## Acceptance criteria

- [x] Re-execute and preserve the iteration-3 reference under the candidate comparison protocol; record dynamics/Circuit identity and actual baseline results.
- [x] Extend the existing offline workflow with multiple starts and repeated geometry passes that can revisit earlier Turn decisions and connected-Turn placement. Define and record a finite evaluation budget and stopping conditions before the main comparison.
- [x] Use a shared evaluation report covering achieved lap/Corner Complex times, entry/Apex/exit placement across all eleven Turns, swept whole-Kart contact validation, measured clearance, steering smoothness, lap continuity, and rejection reasons.
- [x] Measure the clearance/smoothness trade-offs and establish explicit defensible thresholds before selecting a winner; distinguish sampled clearance from continuous contact checking. Preserve controller settings for the geometry-only comparison so its effects are interpretable.
- [x] Retain executable promising candidates, rejected-candidate evidence, and comparison artifacts through the existing generation/evidence entrypoints. Candidate execution uses the real player dynamics and can be verified through the existing replay/Session seam.
- [x] Report positive or negative results honestly; this experiment can complete with no improvement. Keep the production reference unchanged until adoption, keep all search outside live driving, and make no global-optimality claim.
- [x] Provide enough retained evidence and candidate/control data for the speed/control experiment to reuse exactly this baseline and protocol. Relevant type/build and focused validation pass.

## Blocked by

None (can start immediately).

