# Integrated browser QA and Helmet Cam HUD

The normal Helmet Cam previously placed the 692 px-wide Driver Cluster directly over the gloves, forearms and lower steering wheel. Its telemetry now uses a compact 300 px-wide lower-right arrangement in Helmet Cam. Pedals, speed/REVERSE, guidance, Trail Brake and Axle Scrub remain available. Chase Cam keeps its centred layout; camera geometry and simulation behavior are unchanged.

The approved actual-browser HUD seam was red with the centred cluster. It is green at 1440×900 and 1280×800, including a genuine stop/release/repress reverse sequence. Measured compact bounds were x1120/y738.52/300×145.48 at 1440×900 and x960/y610/300×174 at 1280×800. Chase remained centred at x293.81/width692.38 in the smaller view. The empty zero-pressure pedal fills are checked through their visible tracks; REVERSE is checked while actually reversing. Screenshots were inspected and no page errors occurred.

## Reproducible production validation

The existing venue harness now records cold Session/reference construction, functional preflight, renderer construction, first renderer/HUD CPU work and navigation/module-to-first-frame separately. Its public-input preflight covers all eleven Turns and five Corner Complexes, both real Ghost tapes, each selected actual Apex, matching timing/speeds/coaching, record portability and legacy separation. Following the user’s explicit update, the timed browser sample uses four uninterrupted real-time laps while the normal game still defaults to twelve. It retains Full Racing Line, Both Ghost Karts, production renderer/HUD/audio, one warmup lap, warmed Chase and Helmet laps, and a fourth-lap Chase comparison; browser accumulation beyond four laps is unmeasured. Frame means/percentiles/hitches, resources, long tasks, dropped wall time and errors remain in the raw report.

The QA-only recovery page now earns a genuine slower Clean Lap PB with the existing public-input test driver, then exposes normal Session commands for review. This permits separated Reference/PB Ghosts, public Data JSON export/import, ordinary key events, camera/FOV, physical reverse and actual drill cards without assigning internal Kart state. Normal app controls do not gain a replay driver.

```sh
npx vite build --config tests/browser/venue-vite.config.ts
npx vite preview --config tests/browser/venue-vite.config.ts
# Existing installed Playwright and Chrome required; visible hardware-rendered run:
node tests/browser/venue-check.mjs
# Separate focused checks against that production preview:
APEX_BITE_TEST_URL=http://127.0.0.1:5196 node tests/browser/controls-check.mjs
APEX_BITE_TEST_URL=http://127.0.0.1:5196 node tests/browser/hud-layout-check.mjs
APEX_BITE_TEST_URL=http://127.0.0.1:5196 node tests/browser/integration-check.mjs
```

Launchers accept `APEX_BITE_PLAYWRIGHT_MODULE` and `APEX_BITE_CHROMIUM_EXECUTABLE` overrides. `venue-check.mjs` additionally accepts `APEX_BITE_QA_URL` (full harness URL) and `APEX_BITE_QA_EVIDENCE` (output directory). It defaults to headed installed Chrome, 1920×936 CSS pixels, DPR 2, with cache disabled. It logs progress every thirty seconds and saves JSON plus a screenshot only after timing ends. Avoid other GPU work and keep the page visible. Controls/HUD evidence directories use `APEX_BITE_CONTROLS_EVIDENCE` and `APEX_BITE_HUD_EVIDENCE`.

`integration-check.mjs` saves separated-Ghost timing, FOV/steering/reverse/drill screenshots and actual normal-app Data import/view results under `APEX_BITE_INTEGRATION_EVIDENCE`. Its default output is a temporary directory. All launchers use the installed `playwright` module unless an explicit module override is supplied; no machine-specific paths are committed.

## Validation status

All **78 public-session tests**, type checking, normal/QA production builds and final actual-browser checks pass on their recorded scenarios. The final **four-lap** hardware sample preserves the normal game’s **twelve-lap default**, completes four clean laps and records warmed per-camera distributions, hitches and bounded resources. A separate 600-frame-per-view case proves both separated Ghost geometries actually draw. Longer browser accumulation is unmeasured; deterministic twelve-lap tests remain. See [the implementation report](iteration-3-implementation-report.md), [four-lap raw metrics](iteration-3-performance-2026-10-21.json), [separated/render/visual results](iteration-3-integration-browser.json), and [final controls checks](iteration-3-controls-final.json).

A first twelve-lap attempt was interrupted, and a later attempt was stopped when the user explicitly reduced browser acceptance to four laps. Neither is used as completed performance evidence. The report names the subsequent independent-review backward-PB drill alignment finding separately from the ordinary monotonic drill preflight; that edge awaits the review-fix pass. No production deployment is part of QA.
