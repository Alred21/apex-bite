# Iteration 6 Midpoint Visual & Zero-Overlap Review Packet (`#56`)

**Branch:** `ticket/iteration-6-56` (based on `feat/iteration-6` at `b5a5f03`)
**Scope:** Verification, static/kinematic Blender `BVHTree` overlap audit, Cycles close-up renders, Playwright browser QA & live screenshots before starting Lighting/FX (`#57`), Camera (`#58`), HUD (`#59`), and Audio (`#60`) polish slices.

---

## 1. Typecheck, Unit Tests & Production Builds

| Check | Command | Result | Details |
| --- | --- | --- | --- |
| TypeScript check | `npm run typecheck` (`tsc --noEmit`) | **PASS** | Exit code `0` |
| Unit & integration suite | `npm test` (`vitest run`) | **PASS** | **27** test files passed (`27/27`), **119** tests passed (`119/119`), `9.85s` |
| Production app bundle | `npm run build` (`tsc --noEmit && vite build`) | **PASS** | Built `dist/index.html` (`0.93 kB`), `dist/assets/index-HkXj1mUn.css` (`11.24 kB`), `dist/assets/index-BPb-dVbm.js` (`1,182.33 kB`) in `628ms` |
| Venue QA bundle | `npm exec vite build -- --config tests/browser/venue-vite.config.ts` | **PASS** | Built `dist/venue-qa/` (6 entry points) in `593ms` |

---

## 2. Blender `BVHTree` Static & Kinematic Overlap Audit

**Command:** `/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/audit-model-overlaps.py`
**Machine-readable evidence:** [`overlap-audit.json`](./overlap-audit.json)

- **Status:** **PASS** (exit code `0`)
- **Kinematic states evaluated:** **20** (`steer` ∈ `[-0.46, -0.23, 0.0, +0.23, +0.46]` rad × `throttle` ∈ `{0, 1}` × `brake` ∈ `{0, 1}`)
- **Static vs. Dynamic & Dynamic vs. Dynamic `BVHTree` overlaps:** **0** across all 20 states
- **Max four-bar tie-rod length error:** `1.67e-08 m` (threshold `< 0.0005 m`), unit scale verified
- **Brake pushrod coaxial alignment:** PASS (`dot >= 0.9999`)
- **2-bone Arm & Leg IK:** PASS (zero bone stretch/separation across full steering & pedal travel)
- **Min tire-to-bodywork/bumper clearance:** `20.9 mm` (threshold `>= 15.0 mm`)
- **Strict envelope bounds (Three.js coordinates, meters):**
  - `X`: `[-0.795, 0.870]` (limit `[-0.80, 0.88]`)
  - `Y`: `[-0.012, 0.875]` (`max_y` ∈ `(0.84, 0.89)`)
  - `Z`: `[-0.432, 0.432]` (`max(|Z|) <= 0.450`)

---

## 3. Playwright Browser QA Checks

Evaluated in headless/headed Google Chrome `158.0.8127.89` (`1440×900`, DPR `1`) against `tests/browser/racing-guidance.html` (Vite dev server) and `dist/venue-qa` (Vite preview on `:5196`):

| Script | Result | Observed Metrics |
| --- | --- | --- |
| `tests/browser/steering-direction-check.mjs` | **PASS** | `6` rendered steering/return/reverse samples (`centre` `718.8 px`, `left` `605.5 px`, `right` `822.2 px`, `return-centre` `718.8 px`, `reverse-left` `605.5 px`, `reverse-right` `833.5 px`); `0` errors |
| `tests/browser/ghost-model-check.mjs` | **PASS** | `4` both-camera current-model Ghost cases (`Chase Cam` / `Helmet Cam` × `Reference Lap` / `Personal Best`); `helmetPixels`: `208–463`, `outsideGhostPixels`: `0`, `0` errors |
| `tests/browser/ghost-overlap-check.mjs` | **PASS** | `16` both-camera Ghost presentation cases (coincident, partial, side, PB, both, separated, reverse + fade-through-separation sweep); `0` errors |
| `tests/browser/ghost-steering-check.mjs` | **PASS** | `2` both-camera ghost steering comparisons (`Chase Cam` `wheelPixels=158`, `Helmet Cam` `wheelPixels=391`, legacy fallback finite steering `0.0195 rad`, state/clock preserved); `0` errors |
| `tests/browser/hud-layout-check.mjs` | **FAIL (raw script)** / **PASS (post-boot)** | Raw script failed at `hud-layout-check.mjs:14` (`TypeError: Cannot read properties of null (reading 'textContent')`) because `#51` moved `src/main.ts` HUD mount behind async `await preloadRendererAssets()` + `#boot-loader`, and line 14 does not guard `#hud-speed-kph` before calling `.textContent`. When `#hud-speed-kph` is awaited post-boot, all HUD layout assertions (`Helmet Cam` bottom cluster `x=1120`, `1280×800` compact `x=960`, `Chase Cam` centered `x=293.8..986.2`, `REVERSE` badge, `T3`/`T6-T7-T8`/`T1` drill captions) pass with `0` errors. |

### Observations Flagged for Polish Slices (No Code Mutated in `#56`)

1. **`tests/browser/hud-layout-check.mjs:14` (for `#59` or QA follow-up):** Guard `document.querySelector('#hud-speed-kph')?.textContent` (or wait for `#boot-loader` removal) so the script handles async GLB/PBR asset preloading cleanly.
2. **Top-center lap telemetry spacing (for `#59` HUD Polish):** In the `LAST / PB / REFERENCE / REAL-WORLD BENCHMARK` sub-row, `PB: 40.242s` and `REFERENCE: 38.225s` render tight against each other (`40.242s38.225s` visible in `browser-chase.png` / `browser-arena-gantry.png`). Adding horizontal gap/padding will improve legibility.

---

## 4. Blender Cycles High-Resolution Close-Ups (`1280×800`, 32 samples, CPU)

Rendered directly from `assets/otl-superleggero.blend`:

| File | Subject | Verification Notes |
| --- | --- | --- |
| [`blender-kart-34.png`](./blender-kart-34.png) | Front-left 3/4 full Kart + Driver view | Clean bodywork seams, Protex wraparound bumper clearance, OTL slick tire markings, carbon Nassau/dash binnacle, seated driver |
| [`blender-steering-bay.png`](./blender-steering-bay.png) | Steering bay mechanical cutaway (`OTL_Nassau_Fairing` & `OTL_Nose_Livery_Shell` hidden) | Upper column U-joint, lower bearing block, Pitman arm with dual ball studs, fixed-length tie rods with Heim joints & jam nuts, tilted kingpin C-yokes |
| [`blender-pedals-boots.png`](./blender-pedals-boots.png) | Footwell pedals & boots cutaway (`OTL_Nassau_Fairing`, `OTL_Nose_Livery_Shell`, `Kart_Wheel_FL` hidden) | Brake & throttle pedals on crossbar, coaxial brake pushrod, master cylinder & reservoir, driver boots seated cleanly on pedal faces |
| [`blender-rear-drivetrain.png`](./blender-rear-drivetrain.png) | Rear drivetrain, LED & Protex bumper | Rear live axle, left ventilated brake rotor & caliper, right sprocket, toothed drive belt & motor pinion, cooling fins, wraparound Protex rear bumper, roll-hoop brake LED |
| [`blender-driver-profile.png`](./blender-driver-profile.png) | Driver side/3/4 profile | Seated posture, anchored 4-point harness, helmet, headrest & roll hoop clearance |

---

## 5. Live Browser Screenshots (`1440×900`, Vite Preview `dist/venue-qa`)

Captured from `tests/browser/recovery.html` via public `recoveryHarness` and HUD controls:

| File | Scenario / View | Key Observed State |
| --- | --- | --- |
| [`browser-chase.png`](./browser-chase.png) | Chase Cam driving | `23.7 km/h`, station `18.34 m`, rubbered-in track, green racing line chevrons, corner marshal LED & mezzanine visible |
| [`browser-helmet.png`](./browser-helmet.png) | Helmet Cam driving | `26.3 km/h`, live carbon dash binnacle (`26 KM/H`), yellow 12-o'clock wheel marker, gloved hands, right-anchored compact telemetry |
| [`browser-steer-left.png`](./browser-steer-left.png) | Full left steering lock (`Chase Cam`) | `steerAngleRad = -0.46 rad`, `28.5 km/h`, front wheels/arms/helmet turned left |
| [`browser-steer-right.png`](./browser-steer-right.png) | Full right steering lock (`Chase Cam`) | `steerAngleRad = +0.46 rad`, `28.5 km/h`, front wheels/arms/helmet turned right |
| [`browser-pedals-brake-throttle.png`](./browser-pedals-brake-throttle.png) | Braking state (`Chase Cam`) | `brake = 1.0`, `throttle = 0.0`, `21.7 km/h`, roll-hoop rear brake LED lit red, HUD `BRK` bar filled |
| [`browser-ghosts-separated.png`](./browser-ghosts-separated.png) | Separated Ghost Karts (`Both` mode) | `Reference Lap` Gold (`10.90 m` ahead) & `Personal Best` Emerald (`8.43 m` ahead) articulated Ghost Karts both clearly visible |
| [`browser-hairpin-barriers.png`](./browser-hairpin-barriers.png) | Turn 3 hairpin (`Corner Drill` `T3`) | Station `80.41 m`, `26.5 km/h`, seamless spline-mitered Protex Barriers, rubbered-in racing line & Corner Execution Card |
| [`browser-arena-gantry.png`](./browser-arena-gantry.png) | Start/finish straight (`station 346.53 m`) | Overhead steel truss gantry, live 5-pod green start-light tree, digital timing scoreboard (`LAP 01/12 36.80`), pit/charging bay with 3 parked driverless Karts, grid boxes & Turn 1 marshal LED |
