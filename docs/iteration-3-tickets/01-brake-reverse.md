## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

Use Space or the gamepad brake to stop, deliberately engage low-speed reverse, steer away from a Barrier, and resume forward travel with reliable timing and feedback.

## Acceptance criteria

- [ ] Space applies the existing progressive brake response rather than immediate full pressure; forward braking inhibits motor drive as before.
- [ ] Holding Brake/Reverse after stopping keeps the Kart stationary. A release followed by a fresh press from standstill engages reverse; key repeat does not count as a fresh press.
- [ ] Reverse is capped at 8 km/h; steering and Barrier collision response remain controllable while backing away.
- [ ] Accelerator while moving backward first brakes to zero, then resumes forward movement without an instantaneous velocity reversal.
- [ ] Gamepad brake/accelerator provide equivalent direction transitions while retaining analog pressure and neutral-input behavior.
- [ ] The HUD clearly indicates reverse; visible wheel rotation and existing sound feedback agree with direction and speed without adding a transmission simulation.
- [ ] Reset, focus loss, dialog pause, and practice-mode changes clear held inputs and stale direction-engagement state; R remains a fallback reset.
- [ ] Reverse and repeated Start/Finish or Sector recrossings cannot manufacture lap completion, splits, or records. Barrier contact continues to determine Clean Lap eligibility; reversing alone does not introduce an unagreed penalty.
- [ ] Backward progress is handled safely in Ghost Kart recording/playback and live time comparisons; ambiguous comparisons do not fabricate a result. Existing compatible records remain usable and legacy records remain preserved.
- [ ] Public-session tests cover stopping, hold/repress, reverse cap, reverse steering/contact, forward transition, gamepad parity, timing boundaries, and unchanged forward-only reference behavior. A focused real-browser recovery check verifies Space and the HUD.
