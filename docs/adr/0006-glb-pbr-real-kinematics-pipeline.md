# UV-Unwrapped GLB Asset Pipeline, Local PBR Maps, and Real Mechanical Kinematics

- **Status**: Accepted (extends and supersedes [ADR-0004](0004-blender-authored-kart-and-driver-pipeline.md))
- **Date**: 2026-11-27

## Context

In Iteration 5 ([ADR-0004](0004-blender-authored-kart-and-driver-pipeline.md)), Blender-authored Kart and driver geometry was exported as a 1.4 MB inline TypeScript vertex array (`src/render/otl-superleggero-meshes.ts`) with zeroed UV coordinates (`src/render/blender-batches.ts`), so PBR normal, roughness, AO, fabric, carbon-weave, and livery textures could not map onto the model. Furthermore, front steering tie rods scaled dynamically in `scale.z` rather than moving as rigid fixed-length bars, driver boots stayed fixed relative to moving pedals, and Barrier walls used overlapping `BoxGeometry` segments.

## Decision

1. **UV-Unwrapped `.glb` + Bundled Local PBR Textures**: Author the sculpted OTL Superleggero Kart, articulated driver (`assets/otl-superleggero.blend` -> `public/models/otl-superleggero.glb`), and indoor arena props (`assets/venue-props.blend` -> `public/models/venue-props.glb`) in Blender 5.2 with clean UV unwrapping, accompanied by reproducible Python scripts (`tools/build-kart-model.py`, `tools/build-venue-props.py`). Local PBR maps (original baked/procedural and vetted CC0 assets) are bundled under `public/textures/` with provenance documented in `public/licenses/ASSETS.md` and zero external runtime network requests.
2. **Async Preload Gate + Synchronous Node Fallback**: Browser entrypoints (`src/main.ts` and browser QA harnesses) await `preloadRendererAssets()` (`src/render/assets.ts`) before instantiating `createCircuitRenderer()`, preserving flicker-free frame-0 rendering and shared GPU geometry with per-instance material cloning for Player and Ghost Karts. Calling `createKartRig()` without preloaded assets in headless Node/Vitest constructs a lightweight synchronous kinematic rig matching exact `OTL_RIG_CONFIG` dimensions and collision envelope bounds.
3. **True Rigid-Body & Anatomical Kinematics**: All moving assemblies obey physical rigid-body or analytical 2-bone IK constraints (`src/render/kinematics.ts`): a 1-piece steering column + F1 yoke + welded Pitman arm driving constant-length rigid tie rods via exact 4-bar circle-sphere intersection to tilted kingpin knuckles, synchronized rear axle/rotor/sprocket/pinion/belt motion, connected pedal pushrod/TPS linkages, 2-bone IK arms/wrists, and pedal-tracking boots/legs.
4. **Automated 3D Overlap & Miter Integrity Audits**: `tools/audit-model-overlaps.py` (Blender `BVHTree`) verifies zero static or dynamic mesh interpenetration across full steering lock and pedal travel, while `src/render/barriers.ts` generates spline-mitered molded Protex barriers with zero corner pokethrough.

## Consequences

- Eliminates the 1.4 MB inline TypeScript mesh bundle from the main JS chunk while enabling full clearcoat PBR, normal/roughness detail, and flush UV livery.
- Browser entrypoints and browser test harnesses require an async `preloadRendererAssets()` call prior to `createCircuitRenderer()`.
- All `kart-v2` physics, Circuit dimensions, and training records remain strictly untouched.
