# Ghost Kart overlap repair — #32

The production renderer previously displayed every available Ghost Kart at 42% opacity, even when its true replay pose intersected the player. Exact public ReferenceReplay commands reproduced the reported yellow geometry over the Kart and hands: at a 4.6e-14 m pose gap, Ghost-on versus Off changed **24,881 pixels in Chase Cam and 146,563 in Helmet Cam**. This was ordinary ghost geometry, not replay drift or the player's cast shadow.

The repair changes presentation only. Each Ghost Kart is hidden within **2.2 m** of the player and returns with a smoothstep fade over the next **1.3 m**, reaching the existing 42% opacity at **3.5 m**. The player envelope (0.88 m forward / 0.45 m half-width) and the Ghost's conservative visual bounds (0.90 m / 0.76 m) have combined bounding radii below 2.2 m. This protects partial intersections at any relative heading, rather than special-casing identical centre points. The flat-ended, distance-based transition is deterministic while paused and independent of frame rate.

Reference Lap and Personal Best meshes each retain their own material/opacity and exact replay pose. Both uses the same bounded adjustment independently for each mesh; an overlapping PB cannot hide a separated reference. Off and absent poses retain their existing behavior. No simulation, timing, comparison, record, collision, camera or Racing Line code changed. No new setting, telemetry API, geometry, texture, shader pipeline or ghost lifecycle framework was introduced.

## Red/green evidence

The test extends the existing actual Session/production-renderer browser harness. It drives retained public replay commands, normal analog steering/braking/reverse, and an independently driven clean slow lap to earn a genuine Personal Best. It never assigns a Kart pose, Ghost pose or replay clock. Pixel comparisons capture the actual WebGL canvas against Off at the same paused Session state; whole snapshots and portable records must match after restoring the selected mode.

The initial red command was `node /tmp/apex-bite-iteration-3-context/ghost-overlap-check.mjs` against the unmodified renderer. It failed in both views with the counts above. See [before JSON](iteration-3-ghost-before.json), [Chase before](iteration-3-ghost-before-chase.png) and [Helmet before](iteration-3-ghost-before-helmet.png). The identical minimal reproduction then passed with **zero changed pixels**: [after JSON](iteration-3-ghost-after.json), [Chase after](iteration-3-ghost-after-chase.png), [Helmet after](iteration-3-ghost-after-helmet.png).

The retained portable regression is `tests/browser/ghost-overlap-check.mjs`; run a dev server on 5178, then run it with `APEX_BITE_PLAYWRIGHT_MODULE` pointing at an installed Playwright module. Optional `APEX_BITE_GHOST_URL` and `APEX_BITE_GHOST_EVIDENCE` select the page and output directory. No new browser dependency is added to the application.

[Final results](iteration-3-ghost-overlap-check.json): headed Chrome 155.0.8059.85, 1440×900, DPR 1, Balanced quality, **16 cases pass with zero browser errors**:

- Exact Reference and PB coincidence, 0.273 m partial overlap, and a 0.433 m angled steering pass produce zero ghost-induced pixel changes in both cameras.
- In Both, the PB is coincident while the Reference is 4.034 m ahead. Both matches Reference-only exactly; the separated Reference still changes 8,338 Chase / 38,393 Helmet pixels. See [independent Both](iteration-3-ghost-both-helmet.png).
- Separated Reference geometry remains visible; see [separated](iteration-3-ghost-separated-helmet.png), compared with [partial overlap](iteration-3-ghost-partial-helmet.png).
- A genuine release/repress reverse recovery at a slow Turn leaves the Ghost 2.028 m away and produces zero ghost tint in either view.
- Sixteen successive braking states per view cross the fade band. Geometry is fully absent inside the protected radius, visibly returns through the band, and is visible after 3.5 m. Repeated paused captures are byte-identical, with no temporal oscillation or popping state machine.
- Restoring modes leaves complete Session snapshots and exported portable records identical in every case.

The full 78-test public-Session suite, type checking and production build pass. The fix adds two bounded scalar calculations per rendered frame and can skip the existing seven draws per fully suppressed Ghost; it adds no render resources. Exact-tape production benchmarking must label coincident Ghost Karts as **selected but suppressed**, not visible load. #30 performs the final twelve-lap run and a separate genuinely separated-Ghost rendering check after this repair.
