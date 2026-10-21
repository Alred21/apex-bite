# Iteration 3 directions

Status: accepted by the user after Q8. This is the design record for a focused iteration, not an implementation report.

## Agreed scope

Refine the existing solo K1 Toronto trainer through controls and recovery, driver/Kart proportions, and Racing Line geometry and readability. Preserve the current handling foundation, Circuit layout, realistic forward speed, and training modes. Additional work needs a concrete driving or learning benefit.

### Controls and recovery

- Space becomes the normal progressive brake, replacing immediate full braking. Provide a small control-remapping option.
- Holding Brake/Reverse to a stop leaves the Kart stationary. Releasing and pressing it again from standstill engages reverse.
- Cap reverse at 8 km/h and show a clear reverse indicator.
- While reversing, accelerator first stops backward motion, then resumes forward travel without an instantaneous direction change.
- Apply equivalent recovery behavior to gamepad controls. Keep R reset as a fallback.
- Preserve existing progressive steering and pedal behavior, focus/input release, and modal pause behavior.

### Driver and Kart presentation

- Add a believable helmeted rental-Kart driver: seated body in Chase Cam and appropriate hands/arms/body visibility in Helmet Cam.
- Keep hands on the turning wheel using modest animation. Prioritize scale, seating, grip, and camera clearance.
- Calibrate the driver, steering wheel, and Helmet Cam together. Review both physical wheel dimensions and apparent on-screen size.
- Inspect appropriately licensed free assets first; adapt or create missing geometry as needed. No asset is selected yet.
- Retain the adjustable graphics quality and 60 FPS target, measuring the cost of the added driver in both views.

### Racing Line

- Improve the actual path, using deliberate Turn entry, apex, and exit placement. Explore late apexes where appropriate and connected-Turn compromises that benefit whole-lap performance.
- Use the fastest achievable whole lap as the objective. Select the fastest validated candidate found and describe the evidence accurately; global mathematical optimality is not promised.
- Permit useful track-width use with whole-Kart Barrier clearance. Avoid retaining the existing small-offset search as the only family of candidates.
- Keep the path position fixed during play. Each upcoming section changes color according to live speed and the speed/braking demand needed to negotiate that section, including advance braking warning.
- Keep recovery explanations explicit in the HUD. Misalignment does not move the reference path.
- Make the ribbon visibly translucent. Review a broken/chevron treatment in both cameras.
- Keep the displayed path, Reference Lap speeds/timing, Ghost Kart, Apex Proximity targets, Corner Drills, and coaching consistent. A later selected apex must move the associated training target.

## Acceptance evidence

- Annotated full-Circuit overhead comparison of Circuit Centreline, current Racing Line, and selected new line, identifying entry, apex, and exit placement across all 11 Turns.
- Detailed examples for a hairpin and a connected-Turn sequence, explaining apex placement and exit/setup trade-offs.
- Compare achieved full-lap and relevant Complex times under identical dynamics, including current reference and centreline baselines. Demonstrate improvement without imposing an arbitrary percentage target.
- Demonstrate steering feasibility, swept whole-Kart clearance, stable start/finish continuity, and repeated contact-free complete-lap replay.
- Review Helmet Cam and Chase Cam in motion: seated proportions, wheel size, hand grip, clipping, line placement, opacity, and color readability.
- Verify stop/hold/repress reverse engagement, backing away from Barriers, accelerator transition to forward, reverse-speed cap, gamepad parity, and focus release.
- Verify reverse travel and Start/Finish or Sector recrossings cannot manufacture lap completion or invalid timing. Preserve Clean Lap rules.
- Verify line/Ghost/timing/drill/coaching agreement after changing the path and apex locations.

## Implementation direction and discretion

Use a small set of smooth entry/apex/exit controls and bounded alternatives for Turns and connected Turns, retaining shared-dynamics execution and full-lap comparison under ADR-0003. Publish the executed trajectory, rather than an unexecuted proposal. Existing Circuit-progress coordinates remain the common reference for timing and targets; check live braking lookahead when path shapes change.

Keep search work bounded and outside frame-by-frame driving updates. Retain caching; consider precomputation only if measured startup cost warrants it. Algorithm details, asset selection after inspection, precise opacity/width, camera calibration, and remapping UI details are implementation choices within these outcomes.

The scoped work does not call for new physics/transmission engines, opponent AI, AI training infrastructure, rewind, driver customization, or a broad venue rebuild. Reuse existing systems and add machinery only when a demonstrated problem warrants it.

## Why the current path is insufficient

Iteration 2 starts with the Circuit Centreline and tries four offset/phase alternatives for each of five Corner Complexes. Each adjustment is a single same-sign cosine envelope over the whole Complex, with new amplitude +/-0.45 m, phase +/-2 m, and total offset capped at 0.9 m. It cannot independently place each Turn's entry, apex, and exit or deliberately delay one apex. See src/simulation/reference-proposals.ts and src/simulation/reference-lap.ts.

The selected lap is 45.791667 s versus the centreline baseline's 45.983333 s (0.417% improvement). This establishes improvement among the searched candidates, not adequate coverage of racing-line choices. See iteration-2-reference-search.md.

referenceApexTarget currently samples the fixed Circuit Turn apex distance. A movable apex must also inform drill/coaching targets. The existing ribbon is fixed in position with opacity 0.88. The wheel's outer diameter is approximately 0.288 m; its apparent size is also affected by the nearby Helmet Cam.

## GRID research: established facts and limits

[EA's GRID Legends gameplay settings](https://www.ea.com/able/resources/grid/grid-legends/pc/gameplay) documents Racing Line On/Off/Corners Only, driver arms/wheel visibility, and camera feedback. [Its controls page](https://www.ea.com/able/resources/grid/grid-legends/pc/controls) documents configurable bindings and Brake/Reverse. These sources do not disclose the reference-path generator, target-speed calculation, live-color formula, opacity, exact keyboard defaults, or direction-transition behavior. No public developer disclosure of Legends' assist-line generation was located in this research.

In a [direct GRID Autosport developer interview](https://www.pcgamesn.com/how-codemasters-teach-ai-drive), James Nicholls describes designer-supplied guide lines, braking zones, track bounds, human benchmark times, and accelerated repeated simulations to refine AI driving data. A [2014 interview with producer Toby Evan-Jones](https://www.gamewatcher.com/interviews/grid-autosport-interview/11195) also describes repeated simulations varying corner entry, path, and throttle. These concern Autosport AI, not Legends' displayed player assist; they do not establish Legends' implementation or prove a global optimum.

Our recommendation is to author meaningful alternatives, validate with the Kart's dynamics, and refine through measured whole-lap comparisons. This is a project-specific recommendation consistent with the broad historical workflow, not a claim that we reproduce Legends' internals.

[Driver61's Different Corners, Different Techniques](https://driver61.com/uni/different-corner-technique/) explains why exit priorities and connected corners require different apex choices. Apply those principles to this Kart and validate the result.

## Asset shortlist

- [BELAZ race driver](https://sketchfab.com/3d-models/race-driver-e4e97df9865d466c8359fbb23e757308): listing describes FBX, 18k triangles, CC Attribution. Actual files, functional rig, textures, license details, and seated fit remain to inspect before adoption.
- [Kenney Car Kit](https://kenney.nl/assets/car-kit): CC0 and kart racers verified; separate driver geometry and rig remain unverified. A lightweight candidate if its style fits.
- [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html): possible rigged-body foundation requiring helmet/suit/pose work. Check the downloaded package and [current license](https://quaternius.com/license.html); legacy CC0 labels do not establish the license for a fresh download.

Retain source and required license/attribution records for any adopted asset. A candidate listing is not a validated in-game asset.
