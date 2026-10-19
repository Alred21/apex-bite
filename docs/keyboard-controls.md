# Keyboard Assistance

W / Up and S / Down progressively apply the accelerator and rear brake. The accelerator reaches full input in 300 ms; the brake reaches full pressure in 220 ms. Releasing a key returns its pedal promptly, while Space remains immediate full braking. Brake demand inhibits motor drive in the shared Kart solver.

A / Left and D / Right approach a steering target progressively. Short taps make small corrections; holding a key retains the speed-based limit instead of unlocking full steering after a timeout. At low speed, full steering remains available for tight Turns. Reversal crosses centre predictably, and releasing the key recentres steering. Keyboard steering sensitivity, adjustable from 50–175% in **Driving & view**, changes response speed rather than tire grip or the sustained steering limit. The default is 100% and survives resets and practice-mode changes.

Direct analog and gamepad inputs bypass keyboard ramps. Gamepad neutral returns analog steering/pedals to zero immediately, while merely connecting a neutral gamepad leaves keyboard response unchanged. Multiple key aliases are tracked independently: releasing W while Up remains held does not cancel the accelerator.

Losing focus, hiding the tab, or entering a form clears held keys and Keyboard Assistance state. Modal dialogs pause the session and audio. Input fields, selectors, buttons, and editable text do not invoke driving shortcuts; browser modifier chords remain available. Returning focus requires fresh keyboard input, preventing a released key from remaining latched.

## Circuit review and scale assessment

`tools/review-keyboard.ts` exercises binary keyboard commands through the public SimulationSession, with a new decision every 100 ms retained through twelve 120 Hz ticks. Run it with `node_modules/.bin/vite-node tools/review-keyboard.ts`. It is an explicit CLI review driver, not a game feature or hidden assistance. The game does not follow the Racing Line automatically.

The recorded review covers all eleven individual Turns and all five Corner Complexes:

| Scenario | Completed clean | Barrier contact |
| --- | ---: | ---: |
| Conservative target speeds (80% of Reference Lap) | 16 / 16 | 0 / 16 |
| Same pace with a 100 ms wrong-direction steering pulse and recovery | 16 / 16 | 0 / 16 |
| Full accelerator throughout, no braking | 1 / 16 | 15 / 16 |

The complete binary-key Time Trial finished one clean timed lap in 59.033 seconds, with no Barrier contacts. The full-throttle misuse scenario reached the preserved 45 km/h limiter; T5 was its only clean completion. Each per-target time, steering-change count, contact result, and scenario duration is retained in `keyboard-review-2026-10-18.json`.

These results support retaining the corrected estimated Circuit geometry: 363.107 m with the existing variable widths. No additional scaling or higher maximum speed was introduced by the keyboard work. The geometry correction in the Reference Lap work addressed physically impossible joins and clearance in the original estimate; it is not a claim that the venue has been surveyed. Automated binary-key driving establishes control feasibility and consequences of overspeed, not a human usability score. The browser smoke check exercised an actual W hold, the sensitivity slider, data typing without shortcuts, and focus return; further human preference tuning can use the existing sensitivity setting.

Session tests cover first pedal presses, sustained input, emergency braking, short steering taps, centring, reversal, hold limits at speed, release, settings, analog neutral, and neutral-gamepad coexistence. Existing axle/brake tests compare equal analog commands so changed keyboard shaping is not mistaken for a physics regression.
