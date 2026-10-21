# Iteration 3 Racing Line cues — #29

The Racing Line stays at the selected executable Reference Lap's achieved positions. Live speed changes the color of upcoming sections; neither speed, recovery pose, display mode nor camera view moves the path or changes reference targets, Ghost Kart timing or coaching geometry.

## Speed and advance braking

Circuit stations continue to identify reference points and timing. Braking lookahead uses **physical distance along the observed reference path**, so wider placement and Late Apex paths do not silently inherit Circuit Centreline distances. Reference geometry and distance metadata are cached once, with no search or path optimization in live updates.

Each upcoming section gets a speed budget based on its target speed, remaining travel distance, a short reaction allowance, and conservative available rear-braking grip. A backwards pass propagates downstream constraints to their approach sections. Faster approaches therefore reveal red before the restrictive section; slowing clears the warning before the corner. Green indicates room to build speed, yellow a transition/coasting region, and red a speed/braking demand. The retained Reference Lap pedal command continues to distinguish appropriate progressive acceleration near the local target from coasting.

Recovery advice is deliberately distinct: a displaced/misaligned Kart still receives explicit conservative HUD guidance, but its low recovery target no longer paints false red speed warnings onto otherwise safe sections. Green acceleration cues within the upcoming horizon become yellow during recovery; genuine speed-based red remains. Reverse recovery uses a nonnegative forward speed calculation, a zero forward target and neutral yellow sections throughout the line, avoiding wrapped forward acceleration advice. A stopped, aligned forward-facing Kart can still receive progressive acceleration guidance.

## Appearance

The previous continuous 0.38 m / 88%-opaque ribbon is now a **0.34 m strip with forward-pointing broken chevrons at 1.6 m spacing and 55% material opacity**. The pavement and skid texture remain visible both through the strokes and in the clear gaps. The chosen values were reviewed in both camera views rather than inferred from GRID settings.

One generated 64×128 RGBA mask occupies 32 KiB before GPU allocation overhead, with no image download or animation. UVs follow actual path length and stay fixed in the world; speed changes only vertex colors. The existing single Racing Line mesh/draw call is retained. Positions and UVs are uploaded once, and the existing color buffer is updated live. No renderer or animation framework is introduced.

Full, Corners Only and Off retain their shortcut/HUD cycle. Corners Only includes approaches and exits; Off hides the ribbon and the existing guidance panel, while underlying guidance, physics, reference data and Ghost Karts remain unchanged.

## Evidence

The automated tests use the approved public SimulationSession boundary, with no state injection, teleportation API or helper-function test seam. The speed comparison naturally drives two approaches to nearly matching position and heading; its tolerances are **5 cm and 0.01 rad**, with a required speed difference greater than 10 km/h. Before Turn 1 entry, the faster approach must show advance red while the slower approach clears it, and every reference position/heading/target/time remains identical. The actual measured values and browser images are recorded in the companion JSON.

The recovery separation test was red under the old global recovery-color rule: a Kart travelling far below the upcoming section targets still painted those sections red merely because it exceeded the conservative recovery cap. It passes with the independent section budgets. The reverse test was also red: the previous forward target remained approximately 8 km/h and distant sections remained green. It now reports zero and neutral yellow. Existing connected-Turn tests cover braking in the T4–T5 and T6–T7–T8 sequences without prescribing which individual Turn must contain a brake phase; a changed reference may legitimately coast one Turn to prepare another.

The slow aligned/displaced comparison uses the existing independent analog test driver to follow the selected path or a parallel lane and stop. It no longer encodes tap counts tied to the previous reference placement.

Run `npm run dev`, then open `/tests/browser/racing-guidance.html`. This focused page extends the existing browser-review approach: actual Session inputs, public snapshots and the production renderer. Fast/Slowed approach, recovery, reverse, stop, camera, mode and Reference replay controls make the review repeatable. A QA-only browser interface operates those same public commands; no development controls enter the application UI.

Retained [browser evidence](iteration-3-guidance-browser.json) records headed Chrome 155, a 1440×900 viewport, DPR 1 and Balanced quality, with zero browser errors. Both views were inspected during Reference replay as well as paused comparisons. Representative [Chase fast](iteration-3-guidance-chase-fast.png)/[slow](iteration-3-guidance-chase-slow.png) and [Helmet fast](iteration-3-guidance-helmet-fast.png)/[slow](iteration-3-guidance-helmet-slow.png) images show the fixed placement and speed-driven color difference. [Corners Only](iteration-3-guidance-corners.png), [Off](iteration-3-guidance-off.png), [misaligned recovery](iteration-3-guidance-recover.png), [reverse](iteration-3-guidance-reverse.png) and [stopped](iteration-3-guidance-stopped.png) are also retained. These are functional/presentation checks; complete venue frame timing and the twelve-lap accumulation run belong to #30.
