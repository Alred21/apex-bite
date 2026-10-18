# Indoor venue and graphics

The warehouse shell, beams, light housings, pavement aggregate and rubber scuffs, plastic Barrier wear, wall paint, and Apex Bite signage are original procedural artwork created for this project. Geometry uses the existing Circuit samples and leaves simulation dimensions, Turns, physics, and recorded timing unchanged. Blue painted infield, red/white Barriers, grid markings, and numbered Turns remain recognizable. The surrounding building is an authored indoor setting, not a surveyed reconstruction of the Toronto venue.

Three.js `RoomEnvironment` supplies a small prefiltered indoor reflection environment. Three.js is MIT licensed, copyright © 2010–2025 three.js authors; its full license is shipped in `public/licenses/three.txt`. System Arial supplies locally rasterized signage; no font files are redistributed. No third-party visual asset downloads, paid assets, photographic textures, or external runtime requests are used.

## Quality choices

| Setting | Drawing-buffer pixel-ratio cap | Dynamic shadows |
| --- | ---: | --- |
| Performance | 1 | Off |
| Balanced (default) | 1.25 | 1024 × 1024 |
| High | 2 | 2048 × 2048 |

The cap is combined with the device pixel ratio, so a lower-density display never gets an artificial upscale. Materials, markers, the Racing Line, and indoor lighting remain present at every setting. Quality is saved independently of training records, and unavailable preference storage does not prevent play. Resolution and shadow changes apply immediately; they never modify SimulationSession or driver inputs.

Barriers use three instanced draw calls for both sides combined (red, white, rubber), replacing one draw call per segment. Hall boxes are batched by five shared materials. Pavement uses a shared 512² color map and 512² bump map; plastic wear uses 256 × 128; signage uses 1024 × 256. No per-lamp shadow maps or screen-space postprocessing are used. One moving shadow region provides local Kart/Barrier contact depth in Balanced and High.

## Repeatable production sample

Run these commands from the repository:

```sh
npm run build
npm exec vite build -- --config tests/browser/venue-vite.config.ts
npm exec vite preview -- --config tests/browser/venue-vite.config.ts
```

Open `http://127.0.0.1:5181/tests/browser/venue-performance.html`. Choose graphics quality and camera, then press **Sample 10 seconds of driving**. The visible test-only driver sends ordinary controls through SimulationSession while rendering the production scene and HUD, including the Racing Line and Ghost Kart. It warms up for two seconds and reports ten seconds of animation-frame intervals, browser/GPU identity, viewport, device/effective pixel ratios, and Barrier contacts. It cancels if the tab is hidden. Repeat for both views and compare Performance/Balanced/High at a fixed viewport. This extra build entry point is a QA tool, separate from the normal application.

## Local production evidence — 2026-10-18

Hardware: MacBook Pro (Mac17,9), Apple M5 Pro CPU/GPU, 48 GB RAM, macOS 27.0.1. Browser: Chrome 155, ANGLE Metal renderer. Viewport: 1920 × 936 CSS pixels; device pixel ratio: 2. Production renderer includes the detailed Kart from ticket #17. Each sample uses the same public-input driving scenario, enabled Racing Line and Ghost Kart, two seconds of warmup, and ten measured seconds. All samples recorded zero Barrier contacts.

These measurements demonstrate this machine's observed behavior, not a guarantee for everyday laptops or the later full-session acceptance run. Near-120 FPS results are largely limited by this display's refresh rate. Small differences between settings are noise, not evidence that a higher setting is cheaper. The independently observed drawing-buffer sizes and shadow configuration establish that Performance reduces rendering work.

Both views were inspected while driving at all three qualities. The indoor shell stays above Chase Cam, road and blue infield remain distinct, Turn markers and start/grid markings remain present, and floor/plastic/metal detail remains legible. Dynamic shadows provide local contact/depth in Balanced and High. Soft tire scuffs replace the original opaque rectangular stamps and follow the detailed Kart's rear-tire spacing. The existing 25 public-session tests, including complete Time Trial timing/records, pass with unchanged simulation code in this ticket.


| Quality | View | Effective ratio / buffer | Average FPS | p95 / p99 frame interval (ms) | Frames over 25 ms |
| --- | --- | --- | ---: | --- | ---: |
| Performance | Chase Cam | 1 / 1920 × 936 | 119 | 8.5 / 9.7 | 2 |
| Performance | Helmet Cam | 1 / 1920 × 936 | 120 | 8.4 / 8.6 | 0 |
| Balanced | Chase Cam | 1.25 / 2400 × 1170 | 117.4 | 8.5 / 16.6 | 2 |
| Balanced | Helmet Cam | 1.25 / 2400 × 1170 | 120.1 | 8.6 / 9.8 | 0 |
| High | Chase Cam | 2 / 3840 × 1872 | 120 | 9.3 / 10 | 0 |
| High | Helmet Cam | 2 / 3840 × 1872 | 118.5 | 8.9 / 10.3 | 2 |

The complete machine-readable results are retained in [venue-performance-2026-10-18.json](venue-performance-2026-10-18.json). Browser console inspection reported no errors during the sample.
