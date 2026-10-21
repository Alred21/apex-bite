## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

Keep the player Kart and seated driver readable when a Reference Lap or Personal Best Ghost Kart reaches the same position. Suppress distracting intersecting ghost geometry near the player and restore useful spatial comparison as the Ghost Kart separates, in both Chase Cam and Helmet Cam.

## Acceptance criteria

- [ ] Reproduce the reported Ghost Kart/player overlap through ordinary public Session replay and the production renderer, retaining before/after visual evidence.
- [ ] Coincident and intersecting Ghost Karts do not obscure or tint the player Kart, steering wheel, hands, or forward view in either camera.
- [ ] A separated Ghost Kart remains readable and returns smoothly as it leaves the overlap region; crossing into and out of that region does not cause distracting flicker.
- [ ] Reference Lap, Personal Best, Both, and Off retain their intended behavior. Handle each Ghost Kart independently so a nearby ghost does not hide a separated one.
- [ ] Keep actual Ghost positions, timing, live comparisons, records, physics, and collisions unchanged; this is a presentation repair.
- [ ] Verify coincidence, partial overlap, separation, and reverse recovery through the existing browser/render harness, including both camera views. Run relevant regression checks, type checking, and the production build.
- [ ] Record the fix and affected visual/performance checks in the iteration-3 implementation report. Avoid a new ghost system or general rendering framework.

## Blocked by

None (can start immediately).
