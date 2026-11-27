## Parent

[Iteration 6 specification #50](https://github.com/Alred21/apex-bite/issues/50)

## What to build

Deliver GRID Legends-inspired indoor lighting, reflections, grounded contact ambient occlusion, High-tier selective bloom, and restrained tire/Barrier particles—preserving clean 60 FPS performance and strict Ghost Kart isolation.

## Acceptance criteria

- [ ] A custom high-contrast indoor-arena image-based lighting environment featuring bright overhead LED strip banks and dark structural ceiling bays replaces the generic room environment, producing crisp overhead strip highlights on clearcoat bodywork, visor, alloy hubs, and sealed concrete.
- [ ] Painted Kart bodywork, helmet, iridium visor, and track surfaces use clearcoat physically based shading tuned for indoor specular contrast.
- [ ] Soft grounded contact ambient occlusion decals beneath the Kart chassis and all four steered tire contact patches keep the Kart visually planted across Performance, Balanced, and High quality tiers.
- [ ] High quality applies restrained selective high-dynamic-range bloom strictly above unit brightness threshold so only emissive arena and Kart LEDs glow, while Balanced and Performance remain post-process-free.
- [ ] A zero-allocation pooled particle system emits subtle low-lying rear-tire rubber scrub dust and brief Barrier-graze scuff puffs in Balanced and High without obscuring track sightlines.
- [ ] Ghost Karts cast zero physical shadows, emit zero particles, and produce zero bloom bleed outside their bounds so overlap suppression and separated Ghost Kart pixel checks stay clean.
