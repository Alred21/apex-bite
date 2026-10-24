## Parent

[Iteration 4 specification #33](https://github.com/Alred21/apex-bite/issues/33)

## What to build

See Reference Lap and Personal Best Ghost Karts use the same current Kart and driver appearance as the player, while preserving readable translucent comparisons.

## Acceptance criteria

- [x] Replace the obsolete standalone ghost shape with the current Kart-and-driver visual definition. Complete the necessary local prefactoring within this demoable change so later visual upgrades flow to player and ghosts together.
- [x] Keep ghost tint, transparency, opacity, and visibility independent of player materials and of the other ghost.
- [x] Preserve independent overlap suppression and smooth restoration for both ghost types in both cameras, including partial/side overlap and one overlapping plus one separated ghost.
- [x] Demonstrate a separated ghost visibly matching current Kart proportions and driver presence. Keep all replay positions/timing, collisions, training results, and records unchanged.
- [x] Exercise Reference Lap, Personal Best, Both, and Off through the existing production-renderer/browser seam and public Session behavior. Record visible-ghost rendering cost and run relevant checks.

## Blocked by

None (can start immediately).

