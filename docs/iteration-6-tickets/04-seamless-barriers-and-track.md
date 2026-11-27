## Parent

[Iteration 6 specification #50](https://github.com/Alred21/apex-bite/issues/50)

## What to build

Replace overlapping rectangular Barrier boxes and uniform tiled pavement with continuous spline-mitered molded Protex Barriers, a physically based sealed indoor concrete track surface featuring a darker, glossier rubbered-in Racing Line groove, and continuous dual rear-tire skid ribbons, without altering physical Barrier chords or Circuit geometry.

## Acceptance criteria

- [ ] Continuous spline-mitered molded Protex HDPE Barriers follow the exact physical Barrier corridor thickness with beveled shoulders, alternating red/white modular UV mapping, vertical interlock pins, a flush continuous rubber rub-rail, and outer steel shock-mount brackets.
- [ ] Acute inner hairpin miters at tight corners such as Turn 3 and Turn 10 resolve cleanly with zero corner pokethrough, inverted faces, self-intersections, or z-fighting.
- [ ] The Circuit floor renders as sealed indoor concrete with expansion joints, painted edge stripes, weathered start/finish checkers and starting grid boxes, and a darker, glossier rubbered-in groove aligned along the validated Racing Line.
- [ ] Heavy Axle Scrub and tire slip emit smooth continuous dual rear-tire skid ribbons aligned to the rear track width using a pre-allocated zero-allocation ring buffer that breaks cleanly on resets and teleports.
- [ ] Automated geometry checks confirm zero degenerate or inverted Barrier miter faces and strict alignment to the physical Circuit corridor across all eleven Turns.
