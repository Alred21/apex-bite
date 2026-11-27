# Bundled Asset Provenance & Licenses

## Zero-External-Runtime-Requests Policy

Apex Bite bundles all 3D models, physically based textures, and runtime scripts locally under `public/`.
At runtime, the application makes **zero** external network requests (no CDNs, remote fonts, remote models, or remote texture fetches).

## Runtime Libraries

- **Three.js** (`three`, `three/addons/loaders/GLTFLoader.js`, `three/addons/utils/BufferGeometryUtils.js`)
  - **License**: MIT License ([`three.txt`](./three.txt))
  - **Copyright**: Copyright © 2010–2025 three.js authors

## Original 3D Models

- **OTL Superleggero Kart & Articulated Driver** (`public/models/otl-superleggero.glb`, `assets/otl-superleggero.blend`)
  - **Author**: Apex Bite project (original Blender-authored geometry)
  - **License**: Project original asset (all rights reserved to repository terms)
- **Indoor Karting Arena Props** (`public/models/venue-props.glb` — added in subsequent Iteration 6 tickets)
  - **Author**: Apex Bite project (original Blender-authored modular geometry)
  - **License**: Project original asset (all rights reserved to repository terms)

## Bundled Local PBR Textures

- **Venue Concrete & Protex HDPE Barrier PBR Maps** (`public/textures/`, generated via `tools/build-venue-textures.py` in Blender 5.2):
  - `track-concrete-albedo.png`, `track-concrete-normal.png`, `track-concrete-roughness.png`
  - `infield-concrete-albedo.png`, `infield-concrete-roughness.png`
  - `barrier-hdpe-albedo.png`, `barrier-hdpe-roughness.png`
  - **Author**: Apex Bite project (original deterministic procedural Blender-generated tileable 1024×1024 textures)
  - **License**: Project original asset (all rights reserved to repository terms)
- All bundled texture maps are locally authored/baked procedural maps or vetted CC0 textures, each documented here with source and license before inclusion.
