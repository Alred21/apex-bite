# Electric rental Kart presentation

Iteration 4 refines the moulded bodywork, tire materials, steering hardware and binnacle while retaining the physical dimensions; see [Kart refinement and matching evidence](iteration-4-kart.md). The fitted driver is refined separately; see the [complete visual review packet](iteration-4-driver-review.md), whose user acceptance is pending.

Iteration 3 adds the seated driver and recalibrates the wheel, binnacle and Helmet Cam together; see [driver review](iteration-3-driver.md). The original iteration-2 model review below is retained as baseline evidence.

The Kart is custom geometry authored for Apex Bite. No downloaded models, paid assets, fonts, photographs, or third-party texture images are included. Rubber micrograin, seat weave, APEX/ELECTRIC labels, and the digital instrument display are drawn procedurally using Canvas; their source is part of the project. Browser system fonts are used when rasterizing labels. Three.js supplies the geometry and rendering utilities under the project's existing dependency license.

The model uses tapered, beveled plastic mouldings, a contoured bucket seat and rolled rim, powder-coated chassis tubes, a continuous rubber bumper, rear axle and brake disc, finned electric motor, cabling, pedals, and hubs with recessed spokes and fasteners. Rubber, plastic, woven seat, powder coat, and metal have separate roughness and reflectance. Hardware and static surfaces are batched by material; the steering and wheel assemblies remain animated.

Physical alignment uses the existing 1.06 m wheelbase and 0.45 m half-width. The bumper's control polygon stays at or inside 0.419 m and its tube radius is 0.021 m. Quadratic corner rounding avoids spline overshoot. Front wheel centres are at ±0.285 m; their 0.145 m radius and 0.071 m half-width give a maximum lateral extent below 0.447 m at any steering angle. Rear wheel centres are at ±0.335 m. The model does not change simulation dimensions or handling. Skid marks now originate at the visible rear tire tracks.

Rolling integrates speed over positive simulation elapsed time, independently of render frequency. Repeated snapshots and paused presentation do not continue wheel rotation. Reset teleports skip accumulated rolling distance. Front wheel pivots use the Kart steering angle, while the steering rim uses the steering-wheel angle. The digital dash updates when displayed speed changes, rather than uploading a texture every frame.

## Review

Run the development server and open `/tests/browser/kart-presentation.html`. The harness uses real SimulationSession inputs and snapshots. Detail view isolates material and geometry review; Chase Cam and Helmet Cam use session camera state. Exercise steering, acceleration, pause, and reset, then verify that paused snapshots leave the model stationary and that the digital speed agrees with the reported Kart speed.

In Chrome at a 1920×936 CSS viewport and DPR 2, the detail harness reported 32 render calls and 16,130 triangles including its floor, with six renderer textures including its two shadow maps. Helmet Cam culls parts behind the eye. This is a model budget observation, not a complete-session FPS claim. The full venue, Ghost Karts, and production frame-time measurement are covered by the integration review.

The baseline Helmet Cam points almost horizontally, which hides front tires and most of the fairing below the frame. The steering rim and dash remain visible; a comfortable downward sightline belongs to the separate camera-feedback work. This iteration contains no driver avatar, scanned manufacturer model, or branded manufacturer livery.
