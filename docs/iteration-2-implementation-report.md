# Iteration 2 implementation and validation

This report covers the combined implementation of spec [#8](https://github.com/Alred21/apex-bite/issues/8), delivered in tickets #9–#21. The executable Reference Lap, training tools, handling, bounded sessions, portable records, and presentation share the public SimulationSession boundary. Ticket #21 adds a repeatable production acceptance harness and the full-session evidence below. Final branch review is recorded in [the separate Standards/Spec review](iteration-2-code-review.md); its two Standards judgement calls and three Spec findings are resolved. Issue closure is tracked by the integration workflow.

## Combined functional evidence

The existing public-session suite covers the normal uncounted Flying Start, exactly twelve completed timed laps, contact laps counting toward the selected limit while remaining ineligible for Clean Lap PBs, Sector results, frozen finish state, restart, and explicit unlimited practice. Revision-aware import/export tests cover compatible and legacy records, Ghost separation, malformed input and rejected storage writes. These remain tests of player commands and exported snapshots/records, with no private dynamics injection.

The production acceptance harness additionally exercises these features in one sequence:

1. Replay the selected Reference Lap with ordinary public 120 Hz commands to earn a genuine current Clean Lap PB and Ghost recording.
2. Import an older achievement and verify that it is archived separately while the current PB remains usable.
3. Complete representative T3, T1–T3 and T6–T7–T8 Drills using their actual retained Flying Entry states. Each produces a clean Matched Reference card with consistent Segment Time.
4. Export/import current lap, Ghost, Drill PBs and legacy records together, then run twelve uninterrupted real-time timed laps with the Full Racing Line, Both Ghost Karts, production HUD/renderer and activated Web Audio.
5. Check twelve clean results, zero contacts, frozen results after further driving inputs, PB preservation, restart, driver/view settings, unchanged portable data after display changes, and explicit unlimited practice.

Individual behavioral coverage already exists for these features. No duplicate unit tests or artificial failing tests were added merely to reassert them. The initial acceptance pass found no additional production behavior defect. The subsequent independent branch review identified three behavioral defects, now fixed with two new public-session regressions and a focused native-dialog browser regression; see the final review below. The QA harness is separate from the normal app entry point; its recorded command playback is never enabled during ordinary player driving.

## Handling, Circuit scale and Reference Lap

The custom deterministic 120 Hz planar solver retains the 45 km/h limiter, electric torque, motor drag, rear braking and live-axle character. Progressive keyboard pedals, bounded speed-sensitive steering, predictable reversal, analog controls and held-key release on focus/form transitions are covered at the Session and browser boundaries. See [handling](kart-handling.md) and [Keyboard Assistance](keyboard-controls.md).

The original 245 m diagram normalization had intersecting/folded Barrier offsets. After the handling correction, local smoothing and a 1.5× coordinate stretch removed those impossible joins while retaining the recognizable eleven-Turn silhouette and estimated variable widths. The resulting **363.106914 m** centerline is an interpretation of the supplied diagram, not a surveyed physical dimension. No additional geometry enlargement or speed increase was needed after the keyboard review. Whole-Kart collision clearance includes the detailed model and steered tires. See [geometry and execution evidence](iteration-2-reference-lap.md).

The bounded connected-Turn search produced **21 feasible candidates** and one rejected prior pinned-apex heuristic. The selected achieved **45.791667 s** lap improves the feasible **45.983333 s** conservative centerline by **0.191667 s (0.417%)** under unchanged player dynamics. The old heuristic fails steering-curvature feasibility, so its lap time stays null. The final Complex improves even though its T11 window is slightly slower. This is the **fastest validated candidate found**, with no claim of global optimality. The separately labeled **24.499 s Real-World Benchmark** never calibrates grip or timing. Full evidence: [candidate comparison](reference-candidate-comparison.json), [search report](iteration-2-reference-search.md).

Observed states and controls from that same traversal supply the stable Racing Line, pose-aware braking/recovery cues, Reference Ghost Kart, live delta and all sixteen Corner Drill entries/targets. Full/Corners Only/Off alters display only. Coaching reports measured contact, speed, time loss, target proximity and scrub evidence; a missed target does not invent a braking cause. See [guidance](iteration-2-guidance.md) and [Corner Drills](iteration-2-corner-drills.md).

## Browser, visual, keyboard and audio evidence

The slice browser reviews inspected the detailed rental Kart, animated steering/wheels/dash, distinct rubber/plastic/metal materials, textured pavement, indoor enclosure/lighting/shadows and both camera views in motion. The revised Helmet Cam sightline exposes the front fairing/tires. Adjustable 50–90° FOV and fully disableable camera feedback do not change dynamics or records. Performance/Balanced/High change pixel-ratio/shadow budgets immediately. Assets are original procedural work; Three.js attribution ships in `public/licenses/three.txt`. No paid assets or external runtime asset requests are introduced. See [Kart presentation](kart-presentation.md), [venue graphics](venue-graphics.md) and [camera comfort](camera-comfort.md).

The binary-key review completed all eleven Turns and five Corner Complexes cleanly at conservative pace, including a 100 ms wrong-direction correction in each. Full throttle without braking hit a Barrier in fifteen of sixteen targets, preserving consequences for mistakes. A complete clean binary-key lap took 59.033 s on the earlier feasible centerline reference; its preserved JSON labels that earlier 45.983333 s reference and is not silently represented as a rerun against the subsequently selected candidate. Earlier actual browser checks covered W hold, sensitivity, data-field typing, focus return, settings, results/restart and line modes. Those checks did not catch native dialog opener focus restoration; the subsequent focused review regression and fix are recorded below. Automated binary-key driving supports control feasibility, not a human usability score. [Keyboard evidence](keyboard-review-2026-10-18.json).

Actual browser Web Audio activation and analyser output were checked in #19, including volume response, mute/pause/resume, repeated reset, real Barrier contact observation and idempotent disposal. [Audio observations](kart-audio-browser-check.json) and [audio design/limits](kart-audio.md) retain the measurements. This final full-session run also keeps real audio synthesis active. **Human acoustic listening remains unverified:** motor/tire balance, realism and headphone/speaker comfort require human audition. The #19 native blur/visibility attempt did not emit those events; public audio pause/resume and production wiring were verified, with actual keyboard focus return covered separately.

## Complete production performance run

The uninterrupted run completed on 2026-10-19, before the subsequent review fixes. Its raw historical metrics are unchanged. Full machine-readable evidence, including all twelve per-lap distributions, results, counters and combined functional checks, is retained in [the performance JSON](iteration-2-performance-2026-10-19.json). The local machine is a MacBook Pro (Mac17,9), Apple M5 Pro, 48 GB RAM, 16-core integrated GPU, macOS 27.0.1. Those fields were rechecked with `system_profiler`/`sw_vers`; unique device identifiers are not retained in the report.

The benchmark uses a production Vite build and the actual renderer/HUD/audio. It performs ordinary 120 Hz Session steps from the complete retained ReferenceReplay initial state, never teleports at lap boundaries, and cancels if hidden. Default application play still uses the uncounted Flying Start, covered by lifecycle tests; explicit replay mode removes the approach only for deterministic QA. Lap 1 warms the scene, lap 2 measures a full Chase Cam lap, lap 3 measures the same tape in Helmet Cam, and laps 4–12 use Chase Cam for comparison with the beginning. A genuine PB is pre-recorded through the Session before sampling, allowing Both Ghost Karts from the first measured frame.

Renderer counters report actual calls/triangles, allocated geometries/textures/programs, and active/capacity of the bounded shared skid-mark pool. No product debug panel is added. Frame intervals measure end-to-end animation cadence rather than isolated GPU time; refresh-rate limits and local background activity can affect them. Per-lap hitch counts are retained along with p50/p95/p99/max, rather than relying only on average FPS.

The run used **Chrome 155**, ANGLE Metal on Apple M5 Pro, **1920 × 936 CSS pixels**, device DPR **2**, **Balanced** quality with effective DPR **1.25** and a **2400 × 1170** drawing buffer. FOV was 64°, camera motion 35%, and sound 35%. It took **549.511 s wall time** for **549.500 s simulated time**, with **zero discarded wall time**. Twelve clean **45.791667 s** laps completed with the expected Sector splits, zero Barrier contacts, both Ghost poses present, frozen results, successful restart and all sixteen combined functional checks passing.

| Sample | Frames | Mean FPS | Median / p95 / p99 interval | Maximum | >25 / >50 / >100 ms |
| --- | ---: | ---: | --- | ---: | --- |
| Lap 2, warmed Chase Cam | 2,748 | 60.000 | 16.7 / 18.1 / 18.6 ms | 18.7 ms | 0 / 0 / 0 |
| Lap 3, warmed Helmet Cam | 2,747 | 60.000 | 16.7 / 18.5 / 18.7 ms | 18.8 ms | 0 / 0 / 0 |
| Lap 12, Chase Cam | 2,748 | 60.000 | 16.7 / 18.2 / 18.5 ms | 18.7 ms | 0 / 0 / 0 |
| All laps after warmup | 30,223 | 60.000 | 16.7 / 18.5 / 18.7 ms | 18.8 ms | 0 / 0 / 0 |

Warmup allocation rose from 51 to 86 geometries, 10 to 21 textures and 16 to 17 shader programs as the full Circuit became visible. **Laps 2–12 retained 86 geometries, 21 textures and 17 programs.** Chase Cam calls remained **58–124 per frame** in both lap 2 and lap 12; the same finish-area view used 85 calls / 35,646 triangles. Helmet Cam ranged **43–109 calls**, with 45 calls / 31,870 triangles at its lap end. The first diagnostic in a newly switched camera reflects the preceding rendered frame, as documented in the JSON. No browser errors or >50 ms long tasks were observed. Actual active sound peaked at RMS **0.04910** and paused at finish.

There was no accumulating frame-cadence or resource-count regression in this scenario, and the measured 60 FPS target was met locally without another rendering budget change. Intervals above the nominal 16.7 ms threshold are retained in the JSON; the 18.8 ms maximum and zero >25 ms hitches are more informative than the rounded 60 FPS alone. These results differ from the earlier near-120 FPS short samples because the final run observed approximately 60 Hz cadence; the older short runs are historical evidence, not a throughput comparison against this full-session protocol.

**Skid-mark limit:** the clean ReferenceReplay produced zero active skid marks throughout. The scene preallocates 320 shared-geometry/material marks, but this run does not measure their fully saturated draw-call cost. Thus the stable counts establish the clean full-session path, not a worst-case continuous-scrub benchmark or a universal memory-leak proof. Performance quality remains available with DPR capped at 1 and dynamic shadows off; Balanced met the target on this machine, so speculative tuning was not justified.

To reproduce:

```sh
npm run build
npm exec vite build -- --config tests/browser/venue-vite.config.ts
npm exec vite preview -- --config tests/browser/venue-vite.config.ts
```

Open `http://127.0.0.1:5196/tests/browser/venue-performance.html` in a visible tab. Press **Run 12-lap production validation**, leave it visible for approximately nine minutes, then press **Download metrics JSON**. View changes and playback occur in this QA entry point; no repeated UI actions or screenshots are required. Hardware information is recorded separately because browser GPU reporting cannot establish RAM or the complete machine model.

## Final verification and limits

At production evidence capture, `npm test` passed **59 tests across 13 files** and the standard bundle was 618.21 kB (164.64 kB gzip). Those are historical capture-time values. After resolving all five [branch-review findings](iteration-2-code-review.md), `npm test` passes **61 tests across 13 files**, `npm run typecheck`, `npm run build` and `git diff --check` pass. The final standard bundle is **618.71 kB (164.80 kB gzip)**, with Vite’s existing size advisory. The separate production QA build passed at evidence capture.

Review fixes require full net Circuit progress and ordered measured Sector checkpoints before completing a lap; local Start/Finish recrossings keep the active lap timer running. Reference/PB lap Ghosts wait until the lap clock starts, including after reset; all sixteen drill Ghost alignments remain covered. Shared renderer-independent Barrier geometry and a single Corner Complex catalogue remove the two duplication findings without changing physical geometry or the selected Reference Lap. A one-time public Session comparison against pre-fix integration `699aff3` found the complete ReferenceReplay JSON identical (5,496 frames, 5,495 commands, 45.791667 s). Existing retained-tape tests still match every observed Kart state exactly and complete twelve clean laps.

One necessary focused Chrome check used the actual HUD, driver event adapter and native dialogs. It reproduced settings/Data/results opener-focus suppression before the fix and passes all ten checks after consistent dialog-close focus release, including fresh W/A/D, sensitivity, open-form suppression and restart. [Before/after evidence](iteration-2-dialog-focus-check.json) and `tests/browser/dialog-focus.html` retain the check; keyboard events in this harness are DOM KeyboardEvents, so it is not a new human usability study. No further visual inspection or full nine-minute performance rerun was justified: the rendering/geometry arithmetic is preserved, clean tape traversal remains identical, and the behavioral changes are covered at the approved Session/browser seams. The measured performance table above remains evidence from the pre-fix build, not a claim that the final bytes were re-benchmarked.

The M5 Pro is a capable local reference, not proof of 60 FPS on generic everyday laptops. Broad hardware minimums remain unmeasured. The Circuit is not surveyed, the Reference Lap is not globally optimal, and the planar model is not a suspension simulation or a digital twin of the physical venue. No human acoustic audition or formal human keyboard usability study is claimed. The standard Vite build's existing greater-than-500 kB shared chunk advisory is reported separately from measured warmed-session cadence; network loading performance is outside this local full-session sample.
