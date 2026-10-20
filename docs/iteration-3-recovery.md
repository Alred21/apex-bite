# Iteration 3 — Brake/Reverse recovery (#24)

Implemented on `ticket/iter3-24`, based on integration commit `d662eae`.

Space now shares the progressive keyboard brake pedal with S/Down. Holding any Brake/Reverse input through a stop holds position. Releasing and pressing from standstill selects low-speed reverse; keyboard repeat is not a new press. Gamepad trigger pressure remains analog. Reverse is capped at 8 km/h, uses the Kart's existing steering/wheelbase and swept Barrier envelope, and accelerator first stops backward motion before forward drive resumes.

The public Kart snapshot exposes signed `speedMps` (negative backward), nonnegative display `speedKph`, and `driveDirection`. The forward solver is unchanged. Existing wheel animation already integrates signed speed, and audio now uses speed magnitude with reverse pedal load so its pitch/rolling sound remains coherent. The HUD shows REVERSE and explains recovery; settings explain the stop/release/repress sequence.

Reset/practice changes clear browser-held keys and Session direction engagement. Pauses and reset require neutral gamepad input before resuming. Browser key-repeat cannot recreate a cleared hold. R remains available.

Timing uses ordered net Circuit progress. A 1 micrometer numeric tolerance at the full-lap boundary avoids dropping a legitimate wrap because of floating-point rounding; ordered Sectors and a complete traversal are still required. Backtracking cannot overwrite splits or manufacture laps. Reverse itself adds no Clean Lap penalty; Barrier contact still does.

Ghost samples retain ordered times and actual backward poses. Their station coordinate uses net lap progress (clamped at zero before Start/Finish), preserving recovery without a false wrap to the end of the Circuit. Time playback remains available, but a tape with repeated/backward stations has no unique station-to-time comparison. That comparison and the live delta during backtracking are explicitly unavailable. Compatible revision-2 records and legacy records are retained; forward handling did not require a revision bump.

## Verification (2026-10-20)

Approved seams: public SimulationSession and existing real browser adapter/HUD/presentation/audio harnesses.

- Red: progressive Space test failed because first pressure was `1` rather than below `0.1`.
- Red: hold/repress reverse test failed because speed remained `0`.
- Red: reverse Start/Finish test observed a fabricated `-36.715s` delta instead of an unavailable comparison.
- Green: seven recovery scenarios cover held stops, exact 8 km/h cap, reverse steering and Barrier recovery, keyboard/gamepad accelerator transitions through zero, Start/Finish and Sector recrossings, clean recovery lap recording/export/import with a backward Ghost tape, and reset/release/practice engagement clearing.
- Complete suite: **68 tests passed** across 14 files, including twelve repeated forward Reference Laps, normal Time Trial/Corner Drills, compatible/legacy records, and existing forward handling behavior. Type checking and production build passed. The existing >500 kB Vite chunk advisory remains.
- Isolated Chromium at 1440 × 1000 used actual Space/W/R key events and the actual adapter, HUD, renderer, and Session. First Space pressure: `0.0378788`; held stop stayed at zero; fresh press reached exactly `8 km/h`; HUD read `REVERSE`; delta read `COMPARISON UNAVAILABLE · RECOVERY`; accelerator initially remained backward and later resumed forward; reset followed by a repeated Space keydown did not latch the brake. No page errors. Screenshot inspected.
- Existing real Web Audio browser harness: reverse motor remained `Running`, volume `0.5`, measured output RMS `0.033409`, no Barrier contacts or page errors. This is signal evidence, not a claim about subjective sound quality.

Browser entrypoints: `tests/browser/recovery.html` and `tests/browser/kart-audio.html`. Reproduction runner/results and inspected screenshot are retained in `/tmp/apex-bite-iteration-3-context/` for integration review. Final combined visual/performance acceptance belongs to #30.
