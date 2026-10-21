# Integrated browser QA and Helmet Cam HUD

The normal Helmet Cam previously placed the 692 px-wide Driver Cluster directly over the gloves, forearms and lower steering wheel. Its telemetry now uses a compact 300 px-wide lower-right arrangement in Helmet Cam. Pedals, speed/REVERSE, guidance, Trail Brake and Axle Scrub remain available. Chase Cam keeps its centred layout; camera geometry and simulation behavior are unchanged.

The approved actual-browser HUD seam was red with the centred cluster. It is green at 1440×900 and 1280×800, including a genuine stop/release/repress reverse sequence. Measured compact bounds were x1120/y738.52/300×145.48 at 1440×900 and x960/y610/300×174 at 1280×800. Chase remained centred at x293.81/width692.38 in the smaller view. The empty zero-pressure pedal fills are checked through their visible tracks; REVERSE is checked while actually reversing. Screenshots were inspected and no page errors occurred.

## Reproducible production validation

The existing venue harness now records cold Session/reference construction, functional preflight, renderer construction, first renderer/HUD CPU work and navigation/module-to-first-frame separately. Its public-input preflight covers all eleven Turns and five Corner Complexes, both real Ghost tapes, each selected actual Apex, matching timing/speeds/coaching, record portability and legacy separation. The timed run retains twelve uninterrupted real-time laps, Full Racing Line, Both Ghost Karts, production renderer/HUD/audio, one warmup lap, warmed Chase and Helmet laps, and late Chase accumulation measurements. Frame means/percentiles/hitches, resources, long tasks, dropped wall time and errors remain in the raw report.

The QA-only recovery page now earns a genuine slower Clean Lap PB with the existing public-input test driver, then exposes normal Session commands for review. This permits separated Reference/PB Ghosts, public Data JSON export/import, ordinary key events, camera/FOV, physical reverse and actual drill cards without assigning internal Kart state. Normal app controls do not gain a replay driver.

```sh
npx vite build --config tests/browser/venue-vite.config.ts
npx vite preview --config tests/browser/venue-vite.config.ts
# Existing installed Playwright and Chrome required; visible hardware-rendered run:
node tests/browser/venue-check.mjs
# Separate focused checks against that production preview:
APEX_BITE_TEST_URL=http://127.0.0.1:5196 node tests/browser/controls-check.mjs
APEX_BITE_TEST_URL=http://127.0.0.1:5196 node tests/browser/hud-layout-check.mjs
```

Launchers accept `APEX_BITE_PLAYWRIGHT_MODULE` and `APEX_BITE_CHROMIUM_EXECUTABLE` overrides. `venue-check.mjs` additionally accepts `APEX_BITE_QA_URL` (full harness URL) and `APEX_BITE_QA_EVIDENCE` (output directory). It defaults to headed installed Chrome, 1920×936 CSS pixels, DPR 2, with cache disabled. It logs progress every thirty seconds and saves JSON plus a screenshot only after timing ends. Avoid other GPU work and keep the page visible. Controls/HUD evidence directories use `APEX_BITE_CONTROLS_EVIDENCE` and `APEX_BITE_HUD_EVIDENCE`.

## Validation status

The HUD/QA packet passes all **78 public-session tests**, type checking, production build, and the actual-browser HUD red/green checks. Vite retains the existing large-chunk advisory. A first hardware run reached lap eleven, then its browser was closed before completion during a session interruption. It has no final report and is **discarded as full-session performance evidence**. Final #30 performance/report acceptance remains open until the subsequent Ghost-overlap fix (#32) and a complete measured run are integrated. See the eventual iteration-3 implementation report for final measurements and limits.
