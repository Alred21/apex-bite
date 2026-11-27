## Parent

[Iteration 6 specification #50](https://github.com/Alred21/apex-bite/issues/50)

## What to build

Load bundled UV-mapped 3D models and local physically based textures cleanly before frame zero behind a lightweight startup screen, while preserving shared geometry with independent per-instance materials across the player Kart, Reference Lap Ghost Kart, and Personal Best Ghost Kart and keeping headless unit verification synchronous.

## Acceptance criteria

- [ ] A startup preload gate loads bundled local 3D model and texture assets before the first rendered frame, eliminating mid-session pop-in for both the player Kart and Ghost Karts.
- [ ] A lightweight synchronous fallback allows unit tests running without browser networking to instantiate the Kart rig at matching physical dimensions and collision bounds.
- [ ] Player Kart, Reference Lap Ghost Kart, and Personal Best Ghost Kart share GPU geometry while owning independent materials so Ghost Kart tinting, translucency, and overlap fading never mutate player appearance.
- [ ] All bundled texture and model origins, authors, and CC0 or original licenses are documented locally with zero external runtime network requests.
- [ ] Existing type checking, automated unit tests, production build, and browser verification harnesses remain green after the prefactor.
