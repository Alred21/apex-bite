# Iteration 3 driver and camera review — #26

The player Kart now carries a fitted helmeted rental driver: contoured suit, contrasting chest panel/zip and shoulder trim, bent legs, boots at the pedals, gloves clasping the steering rim, and a full-face shell with a dark wraparound visor, seal, chin bar and vents. Chase Cam retains the complete body. Helmet Cam hides only the helmet/neck assembly, retaining the body, sleeves and gloves below the eye.

## Asset inspection and selection

Inspected on 2026-10-20, before selecting the implementation:

- **[Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit): actual archive downloaded and inspected.** Its included `License.txt` explicitly grants CC0 personal/educational/commercial use; credit is optional. `kart-oopi.glb` contains a separable `character` mesh, but **no skin, bones, animations or joint attributes**. That character is 818 triangles, one shared palette material, and shares a 12,371-byte external colormap with the Kart. Its authored bounding box is roughly 0.885 × 1.023 × 0.833 units: a deliberately broad stylized character rather than an adult rental driver fitted to this bucket. The actual mesh cannot articulate shoulders, elbows, hands or knees without rebuilding geometry/rigging. The complete candidate Kart is 2,726 triangles; replacing the existing rental Kart to inherit its pose would also abandon the established proportions. Not imported. Archive SHA-256: `fac7dacac5c7874348cf19729af3ef205f3d366493edaf0a827d93f4fdf3d0c4`.
- **[BELAZ race driver](https://sketchfab.com/3d-models/race-driver-e4e97df9865d466c8359fbb23e757308): not downloadable for inspection here.** The request returned HTTP 403. Earlier listing metadata is not proof of its actual rig, seating fit or downloadable license. Nothing from this candidate is included.
- **[Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html): source page inspected, files not adopted.** The author advertises CC0, humanoid rigs and an average 13k triangles, but the download uses an external itch flow. No actual rig or texture budget was verified here. These are unclothed base characters rather than a ready rental suit/helmet; the listing alone is insufficient to select one.

**Decision:** author the missing seated driver directly, preserving the existing Kart and browser budget. No downloaded candidate geometry, textures or rig is copied into the project, so there is no added third-party attribution obligation. Three.js remains the existing rendering dependency. The custom geometry/material source is retained in the project; this is a modest fitted model rather than a general character-animation system.

## Proportion and motion basis

All dimensions are metres in the existing Kart frame (+X forward, +Z right). Keep the 1.06 m wheelbase, tires, pedal positions, collision envelope and physics untouched. The adult-sized reference has a 0.36 m shoulder span, pelvis around 0.25 m high, shoulder attachments at 0.725 m, a 0.30 m helmet height and a 0.99 m eye height. These are an internally coherent fitted-driver basis, not a manufacturer scan or a claim about every driver's stature.

The wheel's outer rim diameter changes from 0.288 m to **0.270 m** (0.119 m centre radius plus 0.016 m grip radius), with a 0.272 m maximum at the small top marker. The centre moves 30 mm rearward to X=0.21, retaining Y=0.60 and the existing shaft tilt. Calibrating eye position and posture resolves most of the prior apparent oversizing: Helmet Cam is now X=-0.27/Y=0.99 rather than X=-0.12/Y=0.78. Its neutral downward sightline is about 15.6°, putting hands and wheel in the lower frame while preserving track ahead. The fixed digital binnacle rises 70 mm to remain readable above the turning rim.

The wheel parents both glove grips, so steering cannot leave hands floating independently of the rim. A small two-link solve uses 0.30 m upper arms and 0.29 m forearms with elbows biased down/outward; each sleeve is one continuously deformed surface through shoulder, elbow and wrist. Only steering changes require a solve. Static surfaces merge by material. There are no downloaded animation clips, locomotion, ragdoll, avatar customizations or extra animation dependencies. Signed speed is retained for wheel rolling, so the reverse slice can reuse the same presentation.

FOV remains adjustable from 50–90° and camera feedback can still be fully disabled. A narrow FOV naturally crops more lower-body geometry; it does not expose the hidden helmet. View changes, motion settings and avatar rendering remain independent of simulation/timing/records.

## Browser review and cost

Use the existing `/tests/browser/kart-presentation.html` harness with `npm run dev`. It now has front/rear detail, actual public-Session Reference replay, full steering controls and a hide/show-driver comparison. The QA-only `window.presentationReview` supports repeatable view, input, camera setting and diagnostics controls; no test controls are shipped in the application UI. Review both steering directions, pause/reset, replay and FOV endpoints. The real application was also driven with ordinary keyboard controls and captured in both views.

Retained evidence includes [front](iteration-3-driver-front.png), [rear detail](iteration-3-driver-detail.png), [Chase Cam in the venue](iteration-3-driver-production-chase.png), [Helmet Cam in the venue](iteration-3-driver-production-helmet.png), and full [left](iteration-3-driver-helmet-left.png)/[right](iteration-3-driver-helmet-right.png) steering plus [50° FOV](iteration-3-driver-helmet-fov50.png). Both views were reviewed during driving, not only as static images. The sleeves remain connected, hands turn with the rim, helmet geometry does not obstruct the eye, and the visor follows the shell surface without intersecting it.

[Measured JSON](iteration-3-driver-performance.json): headed Chrome 155.0.8059.85, Apple M5 Pro/ANGLE Metal, 1440×900 CSS pixels, DPR 1. Isolated model harness with floor and two directional shadow lights: four seconds warmup followed by 600 real-time rAF frames of public ReferenceReplay commands per camera/driver-visibility combination. No errors or Barrier contacts. Hide/show compares the same scene and presets, rather than claiming cross-machine speedups.

| View | Driver | Render calls | Rendered triangles | Mean frame interval | p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| Chase Cam | Hidden | 32 | 16,340 | 8.326 ms | 9.2 ms |
| Chase Cam | Shown | 45 | 22,200 | 8.325 ms | 9.2 ms |
| Helmet Cam | Hidden | 23 | 12,884 | 8.323 ms | 9.3 ms |
| Helmet Cam | Shown | 32 | 16,872 | 8.319 ms | 9.3 ms |

The source driver is **5,860 triangles in 13 material-batched meshes**. Scene renderer counters increase by **13 calls / 5,860 triangles in Chase Cam**, and **9 calls / 3,988 in Helmet Cam**. These totals are from this harness's actual lighting/frustum; full-venue shadow cost is measured separately at integration. The driver adds **zero image textures and zero texture bytes**; the six existing harness textures include the existing model textures and shadow maps. At this 120 Hz display cadence the intervals are refresh limited, so the tiny differences do not establish a driver speedup. No quality downgrade was needed for this isolated scene. Full-venue quality presets, both Ghost Karts, cumulative twelve-lap cost and broad laptop claims belong to the final integrated verification.

## Validation

TDD at the approved public Session boundary: the new seated-eye/sightline behavior failed at the old 0.78 m height, then passed after calibration. The earlier camera-switch test was updated for the newly fitted adult eye position. Existing settings, disabled feedback, view/reset behavior, contact settling and physics/record independence remain covered. All 62 tests across 13 files, type checking and the production build pass. Vite retains its pre-existing large-bundle advisory; this change adds no runtime dependency or texture download.
