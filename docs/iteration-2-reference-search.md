# Connected-Turn Reference Lap comparison

Ticket #14 selects the fastest **validated candidate found** in a bounded deterministic search. It does not claim a globally optimal Racing Line. The selected measured lap is **45.791667 s**, improving the conservative centerline's **45.983333 s** by **0.191667 s (0.417%)** under unchanged player dynamics, Circuit dimensions, tire parameters and 45 km/h limit.

The search executes twenty additional complete-lap proposals: four smooth lateral-offset/phase alternatives for each of the five curated Corner Complexes. It considers ±0.45 m displacements and ±2 m phase shifts, constrains offsets to a conservative corridor margin, and uses a cosine envelope with zero endpoint slope. It does not pin individual Turn apexes. After each Complex, the best complete-lap result becomes the basis for the next Complex's four alternatives. Each candidate records its basis and adjustment parameters, so the selected combination is reproducible rather than being described only by its last adjustment.

Every proposal uses the same `executeReferenceProposal` protocol introduced in #13: exact shared 120 Hz player dynamics, complete dynamic state, two warm-up laps, swept whole-Kart Barrier checks, bounded progress and measured closure. Selection uses achieved complete-lap times, rather than sums of isolated Turn times. Unchanged reference APIs propagate the winning tape, observed path, timing, apex targets, Ghost Kart and coaching inputs to consumers.

There are **21 feasible candidates** including the centerline and **one rejected prior pinned-apex heuristic**. The old heuristic is reevaluated on the corrected Circuit and rejected because its local curvature exceeds the actual Kart steering range; its time remains `null`. The comparison does not manufacture a feasible time for it or reinstate its old 24.499-second calibration.

The full [candidate evidence](reference-candidate-comparison.json) records each candidate's measured lap time or rejection reason, basis, adjustment, and all five Complexes' entry/exit speeds and per-Turn window times. The Real-World Benchmark remains a separately labeled 24.499 s.

## A measured compromise

The selected final Corner Complex takes **12.557574 s**, compared with **12.625130 s** for the centerline. In the measured Turn windows:

| Turn | Centerline | Selected | Difference |
|---|---:|---:|---:|
| T9 | 1.940137 s | 1.940281 s | +0.000145 s |
| T10 | 2.702250 s | 2.606323 s | −0.095927 s |
| T11 | 2.568150 s | 2.573311 s | +0.005162 s |

The chosen traversal accepts a slightly slower T11 window while improving T10 and the complete Complex/lap. These are measured execution differences, not proof that the small T11 loss causes the entire improvement. Complex windows also include connecting sections; the three Turn windows are not an additive partition of the full Complex. Sub-tick window comparisons use interpolation of recorded states, while whole-lap completion remains quantized at 1/120 s.

## Cost and validation

A local Node 26.4.0 sample measured **616 ms** for the first Session construction including all candidate executions, **0.408 ms** mean cached Session construction, and **0.0128 ms** mean snapshot generation. These are machine-specific CLI samples, not browser frame-rate guarantees. Candidate generation runs once per Circuit identity, and the chosen replay is frozen and cached. Immutable candidate metadata is shared between snapshots, avoiding hundreds of comparison-object copies per simulation tick. No search runs during ordinary driving or repeated snapshots.

Public Session tests verify multiple feasible comparisons, selected time equal to the minimum feasible measured time, improvement over the established centerline, and coverage of all five Complexes. Existing exact complete-state replay, Ghost/timing agreement and twelve consecutive contact-free replay laps remain green against the newly selected tape.

The visible `tests/browser/reference-search.html` button replays the selected tape into T11 and displays the measured final-Complex comparison. Chrome reported **PASS**, 21 feasible/one rejected candidates and zero Barrier contacts; the line and overlapping gold Reference Ghost Kart were visible through the final Complex. Screenshot: `/private/tmp/apex-bite-reference-complexes.png`. This was one brief connected-Turn demonstration, not repeated visual or hardware benchmarking.
