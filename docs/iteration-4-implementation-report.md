# Iteration 4 implementation and integrated verification

Iteration 4 corrects visible steering direction, uses the current Kart/driver for both Ghost types, records new replay steering while retaining older tapes, refines the Kart and seated driver, removes floating Turn numbers, and adopts a faster executable Reference Lap. **The user approved the concrete visual review packet on 2026-10-24**, before final integration; [the accepted comparison and motion evidence](iteration-4-driver-review.md) remains unchanged.

## Delivered behavior

- The steering rim, gripping hands and front wheels agree with public left/right inputs in Helmet and Chase views. Reference and Personal Best Ghosts share the current appearance and remain independently suppressed near the player. Both/Off modes preserve simulation and records.
- Original Kart and driver refinements follow inspection of free assets; provenance, licenses and the decision to build original geometry are retained in [the Kart report](iteration-4-kart.md) and accepted driver review. No paid asset, new rendering dependency or animation framework was added.
- Floating 3D Turn numbers are gone. The minimap's eleven numbers, sixteen drill choices, per-Turn Apex results and coaching remain; [the focused label comparison](iteration-4-turn-labels.md) includes matching before/after snapshots.
- The adopted Reference Lap is **38.225 s**, **3.333333 s / 8.02%** faster than the frozen **41.558333 s** iteration-3 baseline under unchanged player dynamics. [Geometry](iteration-4-geometry-experiment.md), [controller](iteration-4-control-experiment.md), and [adoption](iteration-4-adoption.md) evidence retains the budgets, fixed robustness gates, rejected trials, complete settings/control tape, actual Apex placement and comparison overlays. No global-optimum or real-world improvement claim is made.
- Public Session regressions verify twelve clean uninterrupted tape laps, all eleven Turn and five Complex drills, Reference Ghost steering/position/timing, fixed line/live braking cues, compatible lap/Sector records and portable older ghosts. All changed drill Flying Entries are evidenced, so obsolete drill PBs are archived rather than mixed with current benchmarks. Runtime validates and caches the selected recipe; it never runs the candidate search.

## Final validation

All **88 tests across 21 files**, TypeScript checking and normal/QA production builds pass on the integrated branch. The normal game still defaults to **twelve timed laps**. The existing browser QA sample is **four uninterrupted real-time laps**, with a separate visible-ghost load measurement. These scopes remain distinct.

The final browser checks cover production controls/remapping/focus, reset, Brake/Reverse, HUD placement, camera/FOV endpoints, settings retention, actual Data form import, representative execution cards, rendered steering, current-model Ghosts, overlap/fade, and new/older replay steering. Per-slice evidence remains linked rather than being replaced by final QA. Browser scripts use public Session inputs, portable data and production canvas output; no private scene/physics state is injected.

## Production performance

Measured on 2026-10-24 using headed Chrome **156.0.8078.47**, ANGLE Metal / **Apple M5 Pro**, Mac17,9, **48 GiB RAM / 16 GPU cores**, macOS **27.0.1 (26A434)**. The production QA build used **1920×936 CSS pixels**, DPR **2**, Balanced effective DPR **1.25**, and a **2400×1170** drawing buffer. The page remained visible, with no other agent GPU checks running. Full Racing Line, production HUD and gesture-enabled audio were active.

[Raw four-lap metrics](iteration-4-integration/performance.json) record **four clean laps**, zero Barrier contacts and zero page errors. They completed in **152.9693 s**. Lap 1 warmed the scene; laps 2–4 supplied **13,761 measured frames**:

| Sample | Frames | Mean | Average FPS | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Lap 2, Chase | 4,587 | 8.333 ms | 120.00 | 9.0 ms | 9.3 ms | 9.4 ms |
| Lap 3, Helmet | 4,587 | 8.333 ms | 120.00 | 8.9 ms | 9.3 ms | 9.5 ms |
| Lap 4, Chase | 4,587 | 8.333 ms | 120.00 | 9.3 ms | 9.4 ms | 9.5 ms |

All warmed intervals were below **16.7 ms**, meeting the **60 FPS** target on this machine. Geometry/texture/program allocations stayed at **98/13/18** after warmup, with a bounded 320-mark skid pool. This clean reference tape had no active skid marks. The browser reports rAF cadence, not isolated GPU execution time.

**Startup and warmup are not hitch-free.** Cold Session/reference construction took **63.9 ms**, all-sixteen-drill/record preflight **325.4 ms**, renderer construction **732.6 ms**, and first renderer/HUD CPU work **268.1 ms**. Navigation to the first rendered QA frame was **1,443.3 ms**, including that preflight. One warmup interval reached **167.6 ms**; the harness retained **67.6 ms** of dropped wall time from its 100 ms update cap. These costs are explicitly included in the raw evidence rather than hidden by the warmed summary. Browser/driver cold-cache differences prevent treating this as a controlled startup comparison with iteration 3. Cached reference construction is separately measured in the adoption report.

Exact player/reference/PB replay places the Ghosts together, where their geometry is intentionally suppressed. **The four laps are not a continuous two-visible-Ghost benchmark.** The separate moving samples below use a genuine slower clean PB and ordinary 90%-speed public-input driver to measure actual separated render load.

| Separated Ghost sample | Frames after 4 s warmup | Mean | Average FPS | p95 | p99 | Maximum | Off → Both draws at start |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chase | 600 | 8.325 ms | 120.12 | 9.1 ms | 9.3 ms | 9.4 ms | 67 → 177 |
| Helmet | 600 | 8.329 ms | 120.06 | 9.0 ms | 9.3 ms | 9.4 ms | 52 → 162 |

The [separate production report](iteration-4-integration/integration-browser.json) records a **40.241667 s** earned PB, independent clock gaps, and **55 added draws per Ghost** at identical snapshots in each camera. Both samples have zero contacts, no intervals over 25 ms, and active audio. The much larger Ghost draw load than iteration 3 remains within the local 60 FPS target. [Chase](iteration-4-integration/integration-chase.png) and [Helmet](iteration-4-integration/integration-helmet.png) captures show actual separated models. No claim is made that selected-but-hidden Ghosts incur this same load.

The same production run exercises real stop/release/repress Reverse at **8 km/h** with unavailable comparison delta, FOV **50/90/64**, ordinary steering keys, clean T3 and T6–T7–T8 cards with effectively zero reference delta, and portable records pasted into the normal Data import form. Full-Circuit records, settings and results restart remain intact. The browser preflight checks all sixteen drills and retained legacy/current records, not just the two screenshots.

## Rendered regressions and integration repair

Final pixel checks pass [six steering/return/reverse samples](iteration-4-integration/steering/steering-direction.json), [four current-model Ghost cases](iteration-4-integration/ghost-model/ghost-model-check.json), [sixteen overlap/fade cases](iteration-4-integration/ghost-overlap/ghost-overlap-check.json), and [two-camera recorded/older replay checks](iteration-4-integration/ghost-steering/ghost-steering-check.json). The older portable tapes omit steering, remain visibly rendered with finite inferred steering, preserve their positions and clocks, and round trip unchanged. Recorded steering changes move the wheel/hand pixels without moving the player or replay. No scene-graph introspection or new production test interface was added.

[Controls](iteration-4-integration/controls/controls-browser-result.json) pass 31 existing remapping, focus, default-alias, reverse and production-bootstrap checks. [HUD layout](iteration-4-integration/hud/hud-layout-result.json) retains the compact Helmet telemetry at 1440×900 and 1280×800 and centred Chase telemetry. Inspected final images show usable sightlines/grips, visible separated Kart/driver models, no floating Turn-number sprites, and retained minimap and drill/coaching identification.

Visual inspection found an **inherited drill HUD inconsistency**: the execution card correctly reported the segment, but the upper time-delta caption used a full-lap time. The [failing browser assertion](iteration-4-integration/hud-red/drill-hud-result.json) retains `-6.758s vs 38.225s REFERENCE` for a T3 result whose correct segment benchmark is 3.917 s. The narrow HUD repair uses existing execution-card data and explicitly labels **LAST PASS**; before a result it shows the segment target and **DELTA AFTER PASS**. It leaves the current drill timer and full-lap live comparison unchanged; it does not invent a live drill delta. [Production green evidence](iteration-4-integration/hud/drill-hud-result.json) verifies T3, T6–T7–T8, and a fresh T1 target at zero elapsed segment time.

The original FOV50 screenshot raced the on-demand QA page's viewport resize and captured a cleared canvas. The existing integration launcher now waits two animation frames after resize before public rendering. [Focused production captures](iteration-4-integration/focused-refresh.json) refresh FOV50/90 and both drill cards after that repair; [FOV50](iteration-4-integration/integration-helmet-fov50.png) and [the Complex card](iteration-4-integration/integration-drill-T6-T7-T8.png) were visually rechecked. No production scene or camera change was needed. All 88 tests and both builds passed again after the caption-only change; the production HUD browser check also passed. The four-lap benchmark is retained because its Time Trial render path did not change.

## Reproduction and limits

Use the existing launchers described in [the browser QA instructions](iteration-3-integration-qa.md). Set `APEX_BITE_PLAYWRIGHT_MODULE` to an installed Playwright module; no new dependency is required. Production measurement commands are:

```sh
npm test
npm run build
npx vite build --config tests/browser/venue-vite.config.ts
npx vite preview --config tests/browser/venue-vite.config.ts
# In another terminal, while the preview serves port 5196:
APEX_BITE_QA_EVIDENCE=docs/iteration-4-integration node tests/browser/venue-check.mjs
APEX_BITE_INTEGRATION_EVIDENCE=docs/iteration-4-integration node tests/browser/integration-check.mjs
```

Run the existing controls and HUD launchers against that preview using `APEX_BITE_TEST_URL`, saving outputs via their evidence-directory variables. The rendered steering/Ghost launchers use the existing `/tests/browser/racing-guidance.html` source harness and URL overrides, because their observable-pixel projection imports Three.js through Vite. Run GPU checks sequentially. `venue-check.mjs` now uses the iteration-neutral output filename `performance.json`; historical iteration-3 evidence remains unchanged.

The approved implementation objectives are achieved. Measurements establish the local warmed 60 FPS target, not broad hardware performance or a hitch-free cold start. Accumulation beyond four browser laps, saturated skid load, a physically connected gamepad, and human acoustic quality remain unmeasured; deterministic twelve-lap coverage and virtual gamepad controls tests are separate. Older replay steering is a documented presentation approximation, not recovered historical input. Vite retains its existing large-chunk warning (final main JS **1,067.95 kB**, **265.89 kB gzip**). No production deployment was performed.
