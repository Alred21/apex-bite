## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

Follow a Circuit-wide executable Racing Line that makes deliberate corner-placement choices and connected-Turn compromises, supported by inspectable geometry and whole-lap comparisons.

## Acceptance criteria

- [ ] Extend meaningful entry/Apex/exit alternatives across all 11 Turns and the five existing Corner Complexes, allowing Apex timing and exit/setup placement to vary.
- [ ] Explore geometric and later Apex alternatives where appropriate; select based on achieved whole-lap performance rather than rewarding a prescribed visual pattern or requiring a Late Apex everywhere.
- [ ] Compare under identical final dynamics against both the preserved iteration-2 reference and conservative Circuit Centreline baseline; demonstrate improvement without an arbitrary percentage threshold.
- [ ] Provide an annotated full-Circuit overlay of centreline/current/selected paths, identifying entry/Apex/exit placement across all Turns, plus detailed hairpin and connected-Turn examples.
- [ ] Report per-Complex timing and useful entry/exit-speed evidence explaining selected compromises without inventing causal claims or claiming a proven global optimum.
- [ ] All displayed geometry, Reference Lap speeds/timing, Ghost Kart, actual Apex targets, and all sixteen Turn/Complex Corner Drills remain consistent.
- [ ] Demonstrate swept whole-Kart clearance, feasible steering, stable start/finish continuity, and twelve consecutive clean replay laps without artificial state resets.
- [ ] Bound candidate evaluation and cache reference data outside live frame updates. Measure cold construction and cached cost; precompute only if observed startup cost warrants it.
- [ ] Check braking lookahead against changed actual path distances while preserving common Circuit-progress coordinates for timing and targets.
- [ ] Preserve compatible Personal Best data, archives, import/export, and comparison semantics; separate incompatible records only where a demonstrated compatibility change requires it.
- [ ] Keep physics, grip, Circuit dimensions, and the separate 24.499-second Real-World Benchmark unchanged as optimization constraints.
