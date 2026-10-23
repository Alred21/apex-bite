# Iteration 4: Turn labels

Ticket #39 removes the eleven floating numbered sprites from the production Circuit renderer and deletes their now-unused sprite builder. The minimap, HUD Turn badge, drill selector, Corner Execution Card, and coaching remain unchanged. No simulation or training code changes.

## Focused browser inspection

Using the existing recovery browser harness, ordinary public Reference Lap inputs advance 300 ticks with camera motion disabled and ghosts off. Matching before/after views show the floating numbers removed in [Chase Cam](iteration-4-turn-labels-after-chase.png) and [Helmet Cam](iteration-4-turn-labels-after-helmet.png); the [before Chase Cam view](iteration-4-turn-labels-before-chase.png) retains the original large floating Turn 1 marker.

The [minimap](iteration-4-turn-labels-after-minimap.png) still contains all eleven numbers. Its canvas image is byte-identical before and after at the same public snapshot. The full public Session snapshot also hashes identically, including Circuit geometry, reference targets, Kart state, and timing.

All eleven individual Turn choices and five Corner Complex choices retain their labels. Public replay completes T3 and T6–T7–T8 drills; both Corner Execution Cards, per-Turn Apex Proximity labels, timing, and Coaching Insights are identical before and after. The [Complex result screenshot](iteration-4-turn-labels-after-drill-T6-T7-T8.png) visibly retains T6/T7/T8 identification and the coaching card.

[Inspection evidence](iteration-4-turn-labels.json) records the matching hashes, complete selection labels, sampled result cards, and zero browser errors. This is focused browser inspection through the existing production scene/HUD seam, not a new implementation-mirroring test suite.

## Reproduce and verification

Open the existing recovery harness at `/tests/browser/recovery.html`. Set `recoveryHarness.settings({motionStrength: 0})`, set ghosts Off, and call `recoveryHarness.replay(300)`. Switch views with the normal camera control or `recoveryHarness.view(...)`. Check the minimap, then use `recoveryHarness.drill('T3')` and `recoveryHarness.drill('T6-T7-T8')` to inspect completed results. These harness operations send public Session inputs and render the actual HUD.

Inspected in installed Chrome headless at 1440×900, DPR 1. Type checking and production build pass. The existing bundle-size advisory remains. No new tests or test-only production interfaces were added for this small presentation removal.
