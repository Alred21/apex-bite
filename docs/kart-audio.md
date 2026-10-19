# Electric Kart audio

Audio is original Web Audio synthesis authored for Apex Bite. There are no sound samples, downloads, third-party recordings, or paid assets to attribute. It is an electric rental Kart sound design, not a recording or a claimed acoustic reproduction of a particular motor.

A three-tone motor follows observable speed and throttle load, with a quieter harmonic whine rather than combustion-engine pulses. Filtered noise supplies rolling/tire friction; measured slip and Axle Scrub add tire feedback. A separate low-frequency noise envelope responds to increases in Barrier contact count, weighted by observed deceleration and speed loss. Repeated observations of the same impact do not trigger another envelope. Reset/mode teleports, mute and pause clear old contact tails.

The **Sound: Enable** button creates and resumes audio inside a user gesture. The button then mutes/unmutes; volume is adjustable from 0–100%. Volume and mute preference use a separate optional local-storage key and never change training data or physics. Audio remains unactivated on page load regardless of saved preferences. A small output meter shows actual post-master audio amplitude while running. Browser policy/device failures leave driving available and expose an unavailable/paused state for retry.

When the page loses focus, becomes hidden, opens a dialog, or completes its Time Trial, audio fades out and suspends. Focus/visibility return resumes an already gesture-activated graph when the browser permits it; otherwise the Sound button can resume it. Page exit closes the context, stops sources, and disconnects nodes. Back/forward cache suspension preserves the owner for later resumption.

One owner allocates at most one lazy AudioContext and one fixed graph: six continuous sources, seven gains, two filters, one compressor, one analyser, and one shared one-second mono noise buffer. Updates, impacts, session resets, and mode switches allocate no audio nodes. One cancellable fade timer bounds suspension scheduling. Disposal is idempotent. Paused/muted updates continue observing contact counts but do not schedule synthesizer automation, so old impacts are not queued for resumption.

## Verification

The approved seam is browser behavior alongside the public SimulationSession API. No tests couple to oscillator internals or private helper formulas. Run the ordinary automated suite for unchanged session/record behavior, then serve the application and open `tests/browser/kart-audio.html` for a brief browser-only check. Its visible button activates actual Web Audio, drives ordinary session inputs, records actual output RMS, changes volume, mutes, pauses, resets 25 times, reaches a Barrier, and repeatedly observes that contact. A separate Dispose button checks repeated teardown. Switching browser tabs produces real focus/visibility observations.

Human acoustic audition is not available through the current tools; sound realism and comfort still need human listening. Browser activation/output/lifecycle observations are recorded after the smoke check below.


### Browser evidence — 2026-10-18

Chrome 155, using the actual browser AudioContext and analyser. Before the gesture: Off, RMS 0. Activated motor: Running, RMS 0.050571 at 35% volume. At unchanged driving state, 10% volume produced RMS 0.014672 and 50% produced 0.074110. Mute and pause reported zero output; unmute/resume returned to Running (RMS 0.074332/0.073528). Twenty-five resets retained Running state and comparable output (0.069830). A real session Barrier contact raised its contact count to one; fifty observations of the same snapshot left that count at one. Calling disposal twice ended Closed with zero output and no browser console errors. The fixed graph allocation sites were inspected to confirm resets/updates/contact envelopes never construct audio nodes.

The full public browser observations are retained in [kart-audio-browser-check.json](kart-audio-browser-check.json). Opening/closing an automation-created tab did not emit real window blur/visibility events in this environment; native focus transitions are therefore unverified. The public pause/resume path was verified, and the production blur/visibility/dialog/finish wiring was inspected. Acoustic realism, speaker/headphone comfort, and perceived motor/tire balance still require human listening.
