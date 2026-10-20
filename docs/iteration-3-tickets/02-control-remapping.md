## Parent

[Iteration 3 specification #23](https://github.com/Alred21/apex-bite/issues/23)

## What to build

Remap the core driving actions in Driving & view and immediately drive with the selected keys, retaining Space as the default progressive Brake/Reverse action.

## Acceptance criteria

- [ ] Accelerator, Brake/Reverse, Steer Left, and Steer Right have a small understandable remapping interface with visible current bindings and restoration of defaults.
- [ ] Defaults retain W/Up acceleration and A/D or Left/Right steering, make Space the primary Brake/Reverse binding, and keep S/Down as secondary Brake/Reverse aliases unless remapped.
- [ ] Conflicting driving bindings are detected and resolved explicitly; unsupported or browser-reserved chords are not silently accepted.
- [ ] Held keys are cleared when bindings change; key repeat and multiple aliases cannot accidentally trigger reverse or cancel another still-held alias.
- [ ] Bindings remain consistent across reset and practice-mode changes; user-visible control hints reflect the active bindings.
- [ ] Typing in forms and using modifiers retain normal browser behavior. Leaving settings restores driving focus and requires fresh input; gamepad controls remain independent.
- [ ] Real browser checks use the actual controls/HUD integration to demonstrate remapping, conflict handling, default restoration, focus return, and progressive Brake/Reverse through the public Session. Avoid a second simulated keyboard adapter.
