# Iteration 4: recorded Ghost Kart steering

Ticket #36 adds the observed front-wheel steering angle to new Personal Best recordings, including the first and last lap samples. Portable version-2 records retain the optional channel; existing files without it remain compatible. The replay interpolates this angle at the same clock as position, heading, and speed. The current Kart's 2.2:1 steering-wheel ratio supplies the rim/hand angle. Reference ghosts use both angles from the actual retained Reference Lap states.

The shared Kart renderer now receives the ghost's steering rather than a neutral pose or the player's current inputs. Its existing tire pivots, wheel, attached grips, and fitted arms provide the animation. Independent ghost tint, transparency, overlap suppression, and reappearance remain intact.

## Older records and validation

An older interval estimates steering from its wrapped heading change divided by signed distance travelled, using the existing wheelbase and steering limit. Direction comes from displacement along its recorded heading, so backing up reverses the inferred steering sign. Near-stationary intervals use neutral steering instead of amplifying tiny displacement noise. This is a presentation approximation, not a reconstruction of unrecorded controls. It never changes saved fields, ghost positions/headings/speeds, lap clocks, timing comparisons, or achievements.

Optional imported steering must be finite and within the current ±0.46-radian physical steering range. Invalid types, null, and out-of-range angles reject the complete import atomically. Absence alone does not create a new handling revision, archive a compatible lap, or discard an older ghost. Existing unsupported-version, legacy handling/Circuit, drill compatibility, and storage-error rules continue to apply.

## Observable verification

The public Session tests were red before each corresponding behavior was added: portable imports dropped steering, new lap recordings omitted the observed steering, older recordings stayed neutral, and impossible imported angles were accepted. Five passing tests now cover:

- Actual clean-lap steering samples matched against public observed states, including lap boundaries.
- Save/load and portable round trips, interpolation, exact sample boundaries, and replay-clock wrap.
- Reference ghost steering matching the independently replayed public Kart states.
- Older records with wrapped headings and reverse travel, with exact preservation of their exported frames and spatial replay.
- Atomic rejection of malformed or impossible steering without overwriting good records.

The actual-canvas browser regression changes only steering in a portable Personal Best fixture while keeping its earned trajectory and clock fixed. Before the renderer connection, opposite steering produced **zero** changed pixels despite the public pose exposing the requested angles; see [red evidence](iteration-4-ghost-steering-red.json). Afterward, the projected wheel/forearm region changes **290 pixels in Chase Cam** and **750 pixels in Helmet Cam**, with the ghost 9.40 m away and no player, spatial-pose, or clock changes. See [measurements](iteration-4-ghost-steering-check.json), [Chase Cam](iteration-4-ghost-steering-chase.png), and [Helmet Cam](iteration-4-ghost-steering-helmet.png). Images were inspected for occupied ghosts and coherent hand/wheel placement. These are headless Chrome 155 canvas checks, not a hardware frame-rate benchmark.

The existing [16 both-camera overlap cases](iteration-4-ghost-steering-overlap.json) also pass, covering both ghost types, one overlapping plus one separated ghost, partial/side overlap, reverse, and smooth separation. No browser errors were recorded. Final combined hardware performance remains the integration ticket's responsibility.

## Reproduce

Run the existing Vite app on port 5186, then execute `node tests/browser/ghost-steering-check.mjs`. `APEX_BITE_PLAYWRIGHT_MODULE` selects an installed Playwright entrypoint, `APEX_BITE_GHOST_STEERING_URL` overrides the harness URL, and `APEX_BITE_GHOST_STEERING_EVIDENCE` selects the output directory. The harness exposes ordinary public training-data import/export for the fixture; no private pose injection or scene-graph assertions are added.

Run the existing overlap launcher against the same harness with `APEX_BITE_GHOST_URL` and its existing evidence option. Public behavior tests, type checking, and the production build accompany the browser checks; the pre-existing large-bundle advisory is unchanged.

After merging the current integration tip (including floating-label removal and the geometry experiment), all **84 tests**, type checking, and the production build pass. The two-camera ghost-steering canvas regression was rerun successfully on that merged state.
