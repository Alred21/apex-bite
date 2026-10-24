# Iteration 4 Reference Lap adoption (#42)

The live Reference Lap is **38.225000 s**, compared with the frozen iteration-3 reference's **41.558333 s** under identical player physics: **3.333333 s (8.02%) faster**. This adopts the combined geometry/controller result from [#41](iteration-4-control-experiment.md), not its geometry alone. No global-optimum claim is made.

The selected driver uses target cornering acceleration **6.4 m/s²**, braking scale **1.1**, lookahead scale **1.15**, and top-speed fraction **0.96**. Player physics, Circuit geometry, keyboard assistance, and the default **12-lap** session are unchanged. The default reference driver still reproduces the frozen baseline when used by the two experiments.

## Validation and provenance

`npm run reference:generate` now verifies the retained [candidate SHA-256](iteration-4-controls/control-candidate.sha256), re-executes its proposal with its settings, matches the entire retained control tape, checks improvement and the fixed clearance/smoothness gates, and writes the production recipe. It does not repeat the obsolete 165-proposal search or the 144-control grid. Both explicit experiment flags still run against their original frozen fixtures.

The runtime retains the default dynamics signature `93d2c9fd` and separately checks recipe content signature `cde8d206`, covering settings, coordinates, expected time, and selection evidence. This is an accidental-staleness check, not a cryptographic trust boundary. A changed tuned setting without updated validated recipe content is rejected before a Session can publish the lap. Runtime executes only this winner, then caches it. Faster executable candidates rejected for robustness are exposed as ineligible; historical placement evidence remains available but is not misrepresented as assessed under the new gates.

The already fixed #40 gates are minimum sampled clearance **0.28 m**, p95 steering rate **0.28 rad/s**, peak **1.34 rad/s**, and total variation **4.2 rad**. The winner achieves **0.289131 m**, **0.264055 rad/s**, **0.990243 rad/s**, and **3.554148 rad**. These definitions and baseline-relative rounding tolerances are unchanged; sampled clearance remains distinct from the physical solver's swept contact validation.

[Adoption evidence](iteration-4-adoption-evidence.json) re-executes the frozen baseline and selected lap, records every Turn's actual entry/tire Apex/exit, all sixteen drill results, and twelve uninterrupted timed laps. All twelve are clean with no contacts or state resets. Start/finish position closure is **0.000036 m**. Every Turn and Corner Complex drill has zero timing delta and zero Apex-proximity error against its selected reference. The production control tape exactly matches the retained achieved traversal, so the existing [full Circuit](iteration-4-controls/control-line.svg), [T3 hairpin](iteration-4-controls/control-hairpin.svg), and [T6–T8 complex](iteration-4-controls/control-linked.svg) overlays show the adopted path.

Public Session tests check frame-for-frame player replay, Reference Ghost position and steering, lap timing, actual tire Apex targets, all eleven Turn and five Corner Complex Flying Entries, repeated replay, and returned-copy isolation. Guidance tests retain physical-distance braking lookahead and fixed placement with Full/Corners Only/Off behavior. Changed test expectations reflect the accepted trajectory: the T3 tire clip station is 88.306788 m and Flying Start speed is 40.030511 km/h. The slow approach now applies 40% braking to reach the same coast scenario from the faster reference; fast checks stop at a physical station before wall contact.

## Records

A fixture exported through the iteration-3 public Session before adoption supplies a genuine lap PB, Sector PBs, a T3 drill PB, and older ghost frames without steering. The adoption test preserves its lap/Sector achievements and exact ghost positions/times, confirms finite fallback steering, and preserves the archived drill PB through export/import.

The existing physical-entry/gate fingerprint changes from `drills-af9acaf0`; it does not change merely because a benchmark is faster. All sixteen actual Flying Entries differ beyond the existing quantization tolerances; each position/speed/heading difference is recorded in the evidence. Their old drill benchmarks therefore require archival. No revision bump or broad history reset was introduced.

## Cost and browser inspection

On Apple M5 Pro, macOS arm64, Node 26.4.0, the fresh CLI evidence process measured **70.618 ms** for cold Session construction, **4.571 ms** mean for twenty cached Session constructions, and **0.000056 ms** per cached Reference Lap lookup (1,000 calls). These are single-process CPU measurements, not browser frame-rate claims. No search runs during driving. The build retains its existing large-bundle warning (1,066.06 kB uncompressed / 265.24 kB gzip for the main JS chunk).

[Browser evidence](iteration-4-adoption/browser-evidence.json) records headless Chrome 155.0.8059.85, both production-renderer cameras, no page errors, and the three display modes. At matched T1 approach positions the 45 km/h case has 24 red segments and requests Brake; the 31.94 km/h case has zero red segments and requests Coast. The line coordinates are identical. The [Helmet fast](iteration-4-adoption/helmet-fast.png), [Helmet slow](iteration-4-adoption/helmet-slow.png), [Chase fast](iteration-4-adoption/chase-fast.png), and [Chase slow](iteration-4-adoption/chase-slow.png) captures were inspected for readable advance cues along the fixed path. Browser reference-search replay also improves the final Corner Complex over iteration 3 without contacts. Integrated real-time frame performance remains #43's separate acceptance measurement.

## Reproduce

- `npm run reference:generate` — verify artifact and regenerate only the selected recipe.
- `npm run evidence:reference` — fresh baseline/selected comparison, all drills, twelve laps, and CPU timing; `evidence:hairpin` is its compatibility alias. Historical iteration-3 evidence files are not overwritten.
- `npm test` and `npm run build` — **88 tests pass**, typecheck and production build pass.
- Start Vite at port 5192, then run `node tests/browser/reference-adoption-check.mjs`. Set `APEX_BITE_PLAYWRIGHT_MODULE` to an installed Playwright module and `APEX_BITE_TEST_URL` to another local server if needed; no package dependency was added. Set `APEX_BITE_ADOPTION_EVIDENCE` to retain a separate capture.

The initial public adoption assertion was red at 41.558333 s and green after installing the complete validated recipe. The recipe-integrity regression rejects a changed lookahead setting. Existing bounded offline regressions still reproduce the old default reference and preserve the live recipe byte for byte.

Latest integration `c92a774` was merged before final validation. The 88-test suite and build passed again, and browser captures were refreshed with its Kart presentation.
