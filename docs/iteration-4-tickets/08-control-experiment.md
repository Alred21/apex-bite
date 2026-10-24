## Parent

[Iteration 4 specification #33](https://github.com/Alred21/apex-bite/issues/33)

## What to build

Inspect whether improved speed, braking, and tracking choices produce a faster credible traversal on the baseline and promising geometry candidates, then select an evidence-backed adoption candidate or explain the limit.

## Acceptance criteria

- [x] Reuse the established baseline, candidate artifacts, robustness definitions, and evaluation protocol; record a finite budget and stopping conditions for speed/control exploration.
- [x] Evaluate speed-profile, braking, and tracking-control choices on both preserved baseline geometry and promising geometry candidates; assess combined improvements without attributing controller gains solely to geometry.
- [x] Keep the player's Kart physics, grip, dimensions, speed limits, Circuit, and Keyboard Assistance unchanged. Only the automated reference driving strategy changes.
- [x] Select by achieved whole-lap time among candidates satisfying declared clearance and smoothness criteria, continuous swept contact validation, stable closure, and repeated clean execution. Report disqualified faster candidates and reasons.
- [x] Provide full-lap/Corner Complex comparisons, actual path overlays, per-Turn placement explanations, and detailed hairpin/connected-Turn examples. Preserve reproducible candidate controls and enough evidence for downstream adoption.
- [x] If no acceptable faster candidate is found, retain the current production reference and report both experiment families' limitations plus a specific next-step proposal. Mark the Racing Line objective unmet and do not expand optimizer scope automatically.
- [x] Complete focused replay/evidence validation and relevant type/build checks. A useful negative-result report completes the experiment but does not satisfy the adoption ticket or overall Racing Line acceptance.
