## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

See a fixed, visibly translucent Racing Line whose upcoming sections communicate speed and advance braking demand, without recovery misalignment moving the path or obscuring the track.

## Acceptance criteria

- [ ] Keep reference positions unchanged as speed, position, heading, or display mode changes; color/visibility changes never alter the selected Reference Lap.
- [ ] Evaluate each relevant upcoming section using current speed and the speed/braking demand needed to negotiate it. A faster approach shows red warning earlier; slowing appropriately clears it without waiting until the corner.
- [ ] Green communicates room to build speed and yellow a transition/coasting region; make recovery explanations explicit in the HUD and avoid misleading acceleration advice when poorly aligned.
- [ ] Make the ribbon visibly translucent against the pavement and review a broken/chevron treatment in both cameras; choose final opacity/width from visual evidence rather than copying an unverified GRID value.
- [ ] Preserve Full, Corners Only, and Off modes and the existing shortcut/HUD control. Off does not change physics, reference timing, or Ghost Kart behavior.
- [ ] Handle stopped/reversing recovery without wrapping the cue horizon into misleading forward acceleration advice or moving the reference path.
- [ ] Public-session scenarios cover identical pose/different speeds, advance braking, connected Turns, displaced/misaligned recovery, and display-mode invariance.
- [ ] Real render checks in both camera views verify fixed placement, speed-led color changes, transparency, ground readability, and visibility modes using the existing browser harness.
- [ ] No per-frame path optimization, new HUD system, or undocumented claim about GRID Legends' proprietary formula is introduced.
