# Iteration 4: bounded geometry experiment

Ticket #40 finds a **41.316667 s** achieved lap against the unchanged iteration-3 **41.558333 s** baseline: **0.241667 s (0.582%)** faster with the existing speed/braking/tracking controller. At the completion of #40 the production Reference Lap was unchanged; #42 later adopted the combined result (see [adoption](iteration-4-adoption.md)). This is a geometry result for the subsequent control experiment and adoption decision, not completion of the whole Racing Line objective.

## Reproduce and inspect

Run `npm run reference:generate -- --geometry-experiment` from the repository. It writes the protocol, full evidence, and executable candidate bundle into this report's adjacent `iteration-4-geometry` directory. `--output <directory>` keeps an independent run; `--budget <1..400>` sets a smaller trial budget. As of #42, the command without an experiment flag verifies and adopts the approved control candidate; it does not rerun the old 165-proposal production search. The explicit geometry experiment still uses the frozen iteration-3 fixture and default controller.

- [Protocol and measured baseline](iteration-4-geometry/geometry-protocol.json): fixed before main candidate selection.
- [Full candidate and per-Turn evidence](iteration-4-geometry/geometry-evidence.json): all 220 trial outcomes, three seed outcomes, pass history, five Corner Complexes, and entry/Apex/exit positions and speeds through all eleven Turns for retained traversals.
- [Executable candidates](iteration-4-geometry/geometry-candidates.json): frozen baseline, unsmoothed predecessor, Circuit Centreline, and strongest geometry candidate; each carries proposed coordinates, achieved metrics, initial state, exact 120 Hz input tape, robustness rejection reasons, and twelve-lap replay results.
- [Candidate-bundle SHA-256](iteration-4-geometry/geometry-candidates.sha256): permits subsequent experiments to identify the precise input bundle.

The original iteration-3 geometry and unsmoothed predecessor are frozen in the tool's fixture, sourced from commit `50c38c6`. Replacing the live recipe later cannot silently redefine this baseline. The current dynamics/Circuit/driver content signature is `93d2c9fd` with handling `kart-v2` and Circuit `k1-toronto-v2`; a changed signature stops this experiment until comparable execution is explicitly restored.

## Fixed experiment and robustness criteria

The finite plan allows 400 trial proposals plus three baseline/seed executions. Each of three starts gets at most three passes through all eleven Turns, with smooth signed lateral bumps at shared setup and Apex stations. Amplitude narrows from 0.3 m to 0.2 m to 0.1 m across passes. The shared setup changes the preceding exit and following entry together; revisiting each Turn on later passes lets earlier decisions respond to later geometry. A start stops after a full pass without an accepted improvement. This is one concrete extension to the existing generator, not an optimizer framework.

Selection preserves demonstrated iteration-3 robustness, allowing only explicit rounding tolerance. The baseline's measured 0.288955 m sampled clearance sets a **0.28 m minimum**. Its measured p95 steering rate of 0.274619 rad/s, peak rate of 1.336959 rad/s, and total variation of 4.135442 rad set upper bounds of **0.28 rad/s**, **1.34 rad/s**, and **4.2 rad** respectively. These limits were written before the main search and were not relaxed after observing faster results. They are conservative comparison gates, not a claim that the existing reference is an independently certified human-optimal driving style.

Steering rates use absolute successive front-wheel angle differences over 1/120 s; total variation sums absolute angle changes over the measured lap. The combination limits abrupt changes and repeated corrective movement. Sampled clearance uses the existing independent whole-Kart rectangle-to-Barrier sample-chord calculation minus wall half-thickness, at every retained frame. It is **not continuous swept clearance** and its sample chords are not identical to the solver's overlapping physical wall chords. The actual player solver separately rejects swept whole-Kart contacts on every integration step. A pass must also meet existing stable-lap closure checks after two warmup laps.

## Observed results

The iteration-3 start accepted 3, 3, and 8 improvements over its three passes. Its best times were 41.533333 s, 41.433333 s, and 41.316667 s respectively. The unsmoothed and Centreline starts stopped after one pass apiece with no admissible improvement. Of 220 trials, 2 were not executable, 137 executable trials failed at least one robustness gate, and 81 met the gates (many did not improve the incumbent).

The selected candidate retains **0.288948 m** sampled clearance. Its p95 steering rate is **0.277980 rad/s**, peak rate **1.274372 rad/s**, and total variation **4.109609 rad**. All remain inside the predeclared gates. Its exact tape completed twelve laps without resets and with zero Barrier contacts; achieved progress was 12.000001894 Circuit lengths. The reported gain is an integer number of fixed simulation steps, not sub-tick precision.

| Corner Complex | Iteration 3, s | Geometry candidate, s | Gain, s |
| --- | ---: | ---: | ---: |
| T1-T3 | 9.688807 | 9.638124 | +0.050683 |
| T2-T3 | 5.677879 | 5.610813 | +0.067066 |
| T4-T5 | 4.369332 | 4.356181 | +0.013151 |
| T6-T7-T8 | 5.595143 | 5.388762 | +0.206381 |
| T9-T10-T11 | 11.156818 | 11.139725 | +0.017093 |

Complex windows overlap; their gains must not be added as independent contributions to the full-lap gain. The observations below describe actual placement and speeds, not invented causal explanations.

| Turn | Entry speed, km/h | Actual Apex station, m | Exit speed, km/h |
| --- | ---: | ---: | ---: |
| T1 | 25.96 → 25.96 | 16.784 → 16.792 | 33.09 → 33.13 |
| T2 | 37.22 → 35.73 | 58.665 → 58.692 | 42.24 → 42.64 |
| T3 | 27.01 → 26.94 | 88.376 → 88.313 | 19.64 → 19.44 |
| T4 | 29.97 → 29.91 | 132.490 → 132.458 | 24.48 → 23.82 |
| T5 | 30.87 → 29.48 | 152.744 → 152.805 | 36.80 → 37.48 |
| T6 | 36.14 → 37.16 | 172.841 → 172.184 | 26.62 → 28.52 |
| T7 | 34.01 → 35.07 | 180.330 → 180.947 | 32.26 → 33.75 |
| T8 | 32.53 → 31.95 | 206.122 → 205.446 | 23.30 → 22.64 |
| T9 | 35.47 → 35.42 | 258.722 → 258.525 | 35.68 → 35.71 |
| T10 | 28.54 → 28.55 | 296.983 → 296.981 | 18.27 → 18.27 |
| T11 | 20.89 → 20.59 | 332.551 → 333.070 | 28.03 → 28.02 |

The JSON report retains physical entry/Apex/exit coordinates and inside-tire targets as well as these stations. Some exits or individual sequences can be slower even when the complete lap improves. An actual Apex station is measured from the executed inside-front-tire clipping point; it is not a requested control point or the minimum-speed point.

## Limits and handoff to #41

The fixed controller and speed profile are deliberately unchanged. This experiment improves a neighborhood of the existing proposal, but it does not demonstrate a global optimum or broad exploration of every possible path topology. Strict robustness gates mean a poor seed cannot traverse a sequence of inadmissible intermediate paths to reach a distant good one. The two unsuccessful starts and all rejection reasons are retained rather than hidden.

The bundle includes both robust candidates and executable but robustness-rejected seeds, explicitly marked, so the control experiment can assess whether better speed/braking/tracking rescues a shape while applying the same gates. It should compare the preserved baseline and promising geometry under this exact protocol, reporting geometry-only, controller-only, and combined effects separately. Recompute achieved metrics and repeated replay after any control change; geometry feasibility does not transfer automatically.

## Verification

The external-CLI regression was red before implementation because the requested comparison artifact did not exist; it is now green and asserts finite-budget output, the independently documented baseline time, all-Turn/Complex coverage, and byte-for-byte preservation of the production recipe. It tests the approved generation/evidence seam rather than search helpers. Existing public Session Reference Lap replay and full-Circuit tests also pass; all ten focused tests, type checking, and production build pass. The build retains its existing bundle-size warning. The complete experiment reproduces the same selected candidate and metrics across reruns.
