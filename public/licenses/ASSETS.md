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
  - **Author**: Apex Bite project (original Blender 5.2 procedural/sculpted geometry generated via `tools/build-kart-model.py`)
  - **License**: Project original asset (all rights reserved to repository terms)
- **Indoor Karting Arena Props** (`public/models/venue-props.glb` — added in subsequent Iteration 6 tickets)
  - **Author**: Apex Bite project (original Blender-authored modular geometry)
  - **License**: Project original asset (all rights reserved to repository terms)

## Bundled Local PBR Textures

All Kart PBR textures under `public/textures/` are 1024×1024 original deterministic procedural maps generated locally by `tools/build-kart-model.py` with zero external downloads:

- `public/textures/kart-livery-albedo.png` — Apex Bite #07 crimson/white/carbon flush bodywork livery (Original procedural asset, project license)
- `public/textures/kart-carbon-albedo.png` — 2×2 twill carbon fiber weave albedo (Original procedural asset, project license)
- `public/textures/kart-carbon-normal.png` — 2×2 twill carbon fiber weave tangent-space normal map (Original procedural asset, project license)
- `public/textures/kart-carbon-roughness.png` — 2×2 twill carbon fiber roughness map (Original procedural asset, project license)
- `public/textures/tire-albedo.png` — Molded indoor slick tire tread & sidewall lettering albedo (Original procedural asset, project license)
- `public/textures/tire-normal.png` — Tire rubber grain & molded sidewall rib normal map (Original procedural asset, project license)
- `public/textures/tire-roughness.png` — Scrubbed tread & matte sidewall roughness map (Original procedural asset, project license)
- `public/textures/metal-alloy-roughness.png` — Brushed/turned CNC billet alloy roughness map (Original procedural asset, project license)
