# Pose-aware Racing Line guidance

Ticket #15 keeps the selected executable Reference Lap's observed positions, headings, speeds and timing stable. Only live cues and visibility change. Guidance considers distance from the reference, heading error, slip/contact, available braking grip and upcoming reference speeds with a reaction allowance. A slow displaced or misaligned Kart receives conservative recovery advice rather than acceleration based only on its local target speed.

Aligned acceleration zones also consult the retained Reference Lap pedal command. This permits progressive acceleration near achieved reference speed without overriding pose or upcoming braking constraints. The instruction is to build speed progressively, not to apply unconditional full throttle. The guidance remains advisory; player inputs continue to control the Kart.

`L` and the HUD button cycle Full, Corners Only and Off. Corners Only includes Turn approaches and exits; Off hides both the ribbon and guidance panel. Mode selection leaves underlying guidance, reference timing, geometry, Kart state and Ghost Kart state unchanged.

## Verification

- Public `SimulationSession` tests cover a slow misaligned approach, a slow parallel but displaced Kart, anticipated braking at local reference speed, acceleration zones and braking across connected Turns, and mode-independent guidance/reference state.
- The acceleration regression was verified red with the previous rule: no aligned reference acceleration samples were advised to accelerate. Consulting the retained command makes this test pass while preserving recovery and braking tests.
- `npm test`: 59 tests pass after merging the latest integration changes, including the Reference Lap Corner Drills. `npm run build`: type checking and production build pass; Vite retains its existing bundle-size warning.
- One short Chrome check on the local development build verified `L` cycling all three modes in Chase Cam, switching to Helmet Cam with `C`, and cycling the HUD button there. The Full ribbon was visible in Chase Cam; Corners Only omitted the Flying Start straight while retaining the upcoming Turn segment in Helmet Cam. Off removed the ribbon in Chase Cam and hid the guidance panel in both views. Session tests establish that hiding the display does not change the underlying guidance.

This is behavior and presentation evidence, not a performance measurement or proof of optimal braking advice for every possible recovery pose.
