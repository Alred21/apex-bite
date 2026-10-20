## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

Follow and practice a representative hairpin with deliberate entry, movable Apex, and exit placement, with the displayed Racing Line, Reference Ghost Kart, and Corner Drill target reflecting the same achieved traversal.

## Acceptance criteria

- [ ] Choose a representative Circuit hairpin and expose meaningful smooth entry/Apex/exit path alternatives, including later Apex placement, rather than a whole-Complex sideways envelope alone.
- [ ] Use available corridor width with whole-Kart safety clearance and feasible steering; preserve the existing Circuit layout, handling parameters, and 45 km/h forward limiter.
- [ ] Execute alternatives with the shared player dynamics and retain achieved commands, poses, speeds, and times. Select from feasible candidates using achieved whole-lap performance; do not publish an unexecuted proposal as reference.
- [ ] Derive the training Apex from the selected traversal within the Turn window, rather than the fixed Circuit apex station or minimum speed alone.
- [ ] The ordinary Racing Line, Ghost Kart, timing comparison, Apex Proximity, and hairpin Corner Drill use that same Reference Lap and Apex. Preserve the rest of the existing reference consumers.
- [ ] Provide an annotated hairpin overlay with old/new placement and entry/Apex/exit stations, plus achieved time/exit-speed comparison and feasibility evidence.
- [ ] Public-session replay and drill tests verify the executed trajectory, actual Apex target, Ghost/timing agreement, whole-Kart clearance, and stable closure. Preserve existing candidate baselines for the next slice.
- [ ] Keep the extension bounded within the existing Reference Lap system and shared Circuit-progress coordinates; no new optimizer service or AI training infrastructure.
