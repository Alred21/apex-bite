# Iteration 3 — Configurable keyboard driving controls (#25)

Implemented on `ticket/iter3-25`, initially based on integration commit `b84a2c5` containing #24.

Driving & view now shows all four driving actions with their current keys. Select a binding and press one letter, number, arrow key or Space to replace that action's aliases. Conflicts identify the existing action and retain the old binding. Fixed camera/line/Ghost/mode/reset shortcuts, unsupported keys, and modifier chords are explicitly rejected. Escape cancels a capture; Tab cancels and keeps ordinary focus navigation.

Defaults retain W/Up, A/Left, D/Right, and Space/S/Down, with Space shown first for Brake/Reverse. Restore default keys restores all aliases. The visible driving hint follows the active bindings. Bindings stay in the browser controls adapter through reset and practice changes; this ticket does not add account or storage infrastructure, or promise persistence through a page reload.

Changing bindings clears held inputs and Session direction engagement. Alias holds are aggregated, so releasing Space while S remains held does not release Brake/Reverse or create a new reverse press. Browser key repeat cannot recreate a cleared hold, including the key just captured. Form typing, modifier shortcuts, settings focus return, gamepad inputs, and #24's progressive Brake/Reverse behavior remain intact.

## Verification (2026-10-20)

Approved seam: actual browser controls adapter and HUD, producing inputs for the public SimulationSession. No replacement keyboard adapter or new test framework.

- Red: first browser check failed because Driving & view had no Brake/Reverse remapping control.
- Red: Tab stayed trapped on the binding button during capture. It now cancels capture and moves focus normally.
- Red: Shift+Space was prevented and drove the Kart. Modifier chords now retain normal browser behavior.
- Green: **31 browser checks** passed in isolated Chromium, including all four remapped actions, live hints, conflicts/current owner, reserved/unsupported/modifier rejection, Escape/Tab, removed aliases, default restoration, reset/mode retention, gamepad independence, old/new repeated holds, ordinary form typing, actual bootstrap wiring, and the existing settings/data/results close/cancel/restart focus suite.
- Remapped F's first progressive pressure was `0.0378788`; default Space still engaged deliberate reverse at `8 km/h` (within floating-point tolerance). Holding a secondary Brake/Reverse alias after releasing the primary held the stopped Kart without reversing. No page errors.
- Visually inspected settings screenshots at 1440 × 1000 and actual application settings at 1280 × 800. The native dialog scrolls at shorter viewport heights; controls and close action remain reachable.
- Complete headless suite: **68 tests passed** across 14 files. Type checking and production build passed, with the existing Vite chunk-size advisory.

Durable browser harness: `tests/browser/controls.html`. The portable launcher `tests/browser/controls-check.mjs` uses an existing Playwright installation and defaults to a Vite server at `http://127.0.0.1:5195`:

```sh
npm run dev -- --host 127.0.0.1 --port 5195 --strictPort
# In another terminal, with Playwright available:
node tests/browser/controls-check.mjs
```

Optional environment settings: `APEX_BITE_PLAYWRIGHT_MODULE` for an installed module entrypoint, `APEX_BITE_TEST_URL` for the server URL, and `APEX_BITE_CONTROLS_EVIDENCE` for screenshots/JSON. Default artifacts go to the OS temp directory under `apex-bite-controls-evidence`. This session's artifacts are also retained in `/tmp/apex-bite-iteration-3-context/` for integration review.
