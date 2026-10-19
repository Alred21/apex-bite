# Reference-backed Corner Drills

The 11 Turns and five Corner Complexes derive their Flying Entry and targets from the selected executable Reference Lap. A Flying Entry copies a complete observed Kart state, including velocity and yaw rate. The approach begins at the first retained state at or after seven metres before the Turn entry (bounded at two metres into the Circuit); the exit uses the first retained state at or after four metres beyond the final Turn exit (bounded two metres before the finish). Benchmark Segment Time is the difference between those exact frame timestamps. Entry/minimum/exit speeds come from the same retained traversal. The 120 Hz frame gates make the segment timing reproducible without inventing interpolated dynamic state.

The Reference Ghost Kart uses that same Flying Entry timestamp plus current Segment Time, so selecting or resetting a drill aligns the comparison with the attempt. A Personal Best Ghost Kart also remains available: its full-lap recording is sampled at the selected Flying Entry distance, then advanced by current Segment Time. It compares that portion of the full-lap Personal Best without inventing a saved drill replay.

The default measured selection changed from the original conservative lap to the 45.791667-second candidate during implementation. All 16 public-session replay checks still reproduce their complete Flying Entries, Segment Times, entry/minimum/exit speeds and reset states exactly. No per-Turn values were retuned for that candidate.

## Tire targets and Corner Complex evidence

Model and coaching share the front axle (+0.54 m), front half track (0.285 m), rear axle/track and tire radius constants. Apex Proximity measures the centre of the inside front tire against that same point in the selected Reference Lap near the Turn's nominal apex distance. It measures reference execution rather than distance to a physical Barrier. It uses neither the solver's whole-body half-width nor the old incorrect 0.42 m tire offset.

Each Turn's proximity is measured during that Turn's entry/exit window. A Corner Complex exposes every individual Turn result and displays its largest offset, so one significant miss cannot disappear inside an average. Unobserved targets are explicitly marked rather than assigned a fabricated distance. Snapshots copy targets and nested card evidence; consumers cannot modify future coaching by mutating a previously returned snapshot. Selecting a different target clears an unrelated prior card; Instant Reset preserves the last card for comparison while starting a new attempt.

## Coaching decisions

Cards retain contact eligibility and Personal Best behavior. A contact pass cannot set a Clean Lap Personal Best. Coaching describes measured facts:

- **Barrier Contact:** contact was observed; no unsupported turn-in instruction or attributed Turn is invented.
- **Excessive Axle Scrub:** a slower pass spent at least 0.15 s above the selected reference segment's peak + 10 percentage points. The card retains both peaks and that duration, without claiming scrub caused all time loss.
- **Below Reference Speed:** the measured minimum was more than 2.8 km/h below reference in a slower pass. It makes no unsupported brake-release claim.
- **Missed Reference Target:** individual targets beyond 50 cm, or not observed, are identified. Distance alone does not become a late-braking diagnosis.
- **Measured Time Loss:** a clean pass outside the time tolerance remains a time-loss result even when minimum speed and target distance look acceptable.
- **Matched Reference / Clean Faster Pass:** clean target execution is compared with the measured Reference Lap using a tolerance of the larger of 0.08 s or 1% of Segment Time. No card claims global optimality.

## Validation

Public Session tests replay the selected tape across all 16 targets, verify complete Flying Entry/reset state and exact reference times/speeds, and independently check the model's inside-front-tire geometry. Additional ordinary analog-input passes cover clean execution, contact, low speed, modest time loss with acceptable minimum speed, a single substantial Turn miss in a Corner Complex, sustained excess scrub, and snapshot isolation. Tests do not call coaching helpers or inject Kart state. Both Ghost Kart regressions fail by more than 73 m with the former global elapsed clock, then pass with segment alignment (exact retained Reference Lap; under 15 cm for the 40 Hz Personal Best interpolation). The complete suite passes 55 tests across 12 files; TypeScript checking and the production build pass.

The single browser smoke check uses the visible `tests/browser/corner-drill.html` button and actual production HUD. Its clean T1–T3 pass took **14.533 s** against **12.367 s** reference, with **T1 1 cm, T2 89 cm, T3 2 cm**. The card showed the largest **89 cm** miss and `Missed Reference Target`, with a factual **+2.167 s** delta and no invented braking cause. Browser console inspection reported no errors. Screenshot: `/private/tmp/apex-bite-corner-drill-card.png`.
