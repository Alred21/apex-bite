# Apex Bite

A 3D indoor electric go-kart training simulator modeled after K1 Speed Toronto, designed to help drivers improve Racing Line choice, cornering technique, and real-world lap performance.

## Language

### Track & Geometry

**Circuit**:
The complete closed-loop K1 Speed Toronto indoor track layout, consisting of the start/finish straight and 11 clockwise-ordered Turns (T1–T11) bounded by continuous indoor Barriers.
_Avoid_: Map, level, stage, course

**Turn**:
One of the 11 officially numbered corners on the Circuit (T1 through T11), with an entry, an apex target derived from the Reference Lap, and an exit.
_Avoid_: Curve, bend

**Corner Complex**:
A curated multi-turn sequence where the exit of one Turn directly dictates the entry line and speed of the next: `T1–T3` (Opening Sequence), `T2–T3` (Sweeper into Hairpin 1), `T4–T5` (North Double-Right), `T6–T7–T8` (Esses into Far-Right Sweeper), and `T9–T10–T11` (Final Hairpin & Carousel Complex).
_Avoid_: Chicane group, turn combo, section

**Sector**:
One of three contiguous timing divisions of the Circuit used to break down a full lap into comparable split times: Sector 1 (`T1–T3`), Sector 2 (`T4–T8`), and Sector 3 (`T9–T11`).
_Avoid_: Stage, checkpoint zone, split

**Barrier**:
The continuous red-and-white physical wall enclosing the indoor track surface; grazing it scrubs speed through tangential friction, while steeper contact deflects the Kart and invalidates a Clean Lap.
_Avoid_: Fence, guardrail, off-track, runoff

**Circuit Centreline**:
The path through the middle of the Circuit's track corridor. It describes the Circuit layout and is distinct from the Racing Line.
_Avoid_: Optimal line, Racing Line

**Racing Line**:
The validated reference path for a fast, physically achievable full lap, with deliberate entry, apex and exit placement and compromises between connected Turns. Its position stays fixed during a session while its colors indicate live speed and upcoming braking demand.
_Avoid_: Guide line, path, driving line, trajectory

**Apex**:
The clipping point of a Racing Line through a Turn, where the Kart passes nearest the inside Barrier. The training target follows the selected Reference Lap's actual placement within that Turn.
_Avoid_: Mandatory midpoint, fixed apex pin

**Late Apex**:
An Apex placed farther through a Turn than the geometric mid-corner clipping point, to favor the exit or positioning for the following Turn.
_Avoid_: Late braking

### Kart & Physics

**Kart**:
An indoor direct-drive electric go-kart capped at 45 km/h with instant low-end motor torque, a rigid suspensionless frame, a solid rear live axle, and rear-only mechanical and motor-drag braking.
_Avoid_: Car, vehicle, auto

**Axle Scrub**:
Speed loss and resistance to rotation caused by the solid rear axle forcing both rear tires to rotate at the same angular velocity through a tight Turn when the inside rear tire is not unloaded.
_Avoid_: Understeer drag, diff lock, tire bind

**Trail Braking**:
Carrying controlled rear-only braking past the turn-in point to shift weight onto the front tires, unload the rear axle, and induce smooth rear rotation toward the apex.
_Avoid_: Drift braking, handbrake turn, powerslide

**Keyboard Assistance**:
The translation of steering and pedal key presses into progressive Kart inputs, with steering response adapted to speed. The driver remains responsible for the Racing Line, braking points, and recovery from mistakes.
_Avoid_: Autopilot, auto-steering, self-driving

### Cameras & Views

**Helmet Cam**:
The first-person camera perspective positioned at the driver's eye level looking over the rotating steering wheel, digital dash, front fairing, and front tires.
_Avoid_: Cockpit cam, hood cam, bumper cam

**Chase Cam**:
The third-person camera perspective positioned slightly above and behind the Kart, showing all four tires and chassis rotation relative to the Racing Line and Barriers.
_Avoid_: Follow cam, drone view, orbit cam

### Training & Telemetry

**Time Trial**:
A solo full-Circuit practice mode initialized from a Flying Start, tracking lap times, Sector splits, and live time-delta against a reference lap. A session has a selected lap limit, defaulting to 12 timed laps, or explicitly selected unlimited practice, with results presented after a limited session finishes.
_Avoid_: Free roam, arcade mode, race mode, grand prix

**Flying Start**:
The initial rolling start state in Time Trial where the Kart spawns exiting Turn 11 at realistic corner-exit speed (~36 km/h) so that Lap 1 is immediately a full-speed timed lap across the start/finish line.
_Avoid_: Standing start, grid launch

**Corner Drill**:
A targeted practice mode focused on a single Turn (`T1–T11`) or Corner Complex, starting from a Flying Entry and producing a Corner Execution Card upon crossing the exit gate, with instant one-key reset.
_Avoid_: Mini-game, checkpoint mode, turn challenge

**Flying Entry**:
The initial state at the start of a Corner Drill where the Kart spawns prior to the braking or turn-in zone already traveling at a realistic approach speed and heading along the Racing Line.
_Avoid_: Rolling spawn, boosted start, hot spawn

**Time-Delta Bar**:
A live horizontal HUD indicator showing the time difference between the current run and the active Reference Lap or Personal Best at the same Circuit progress point.
_Avoid_: Split bar, gap meter

**Reference Lap**:
A complete simulated lap validated against the same Kart dynamics used by the driver, supplying consistent Racing Line speeds, Ghost Kart timing, and coaching targets. Its lap time is the outcome of an achievable traversal, rather than a prescribed real-world time.
_Avoid_: Track Record Lap, synthetic record, target-time lap

**Real-World Benchmark**:
A lap time reported for the physical K1 Toronto Circuit, kept separate from the simulated Reference Lap. The supplied 24.499-second time is a comparison benchmark, not a constraint on simulated grip or lap timing.
_Avoid_: Simulation record, Reference Lap

**Corner Execution Card**:
The post-attempt telemetry summary displayed after completing a Corner Drill, showing Segment Time and Delta, Entry/Min Apex/Exit Speeds, Apex Proximity, and a Coaching Insight.
_Avoid_: Scoreboard, results popup, grade screen

**Apex Proximity**:
The minimum distance, in centimeters, between the Kart's inside front tire and the Reference Lap's inside-front-tire apex target during a Turn pass.
_Avoid_: Corner distance, clip score, apex miss

**Coaching Insight**:
An evidence-based diagnostic message generated from a Turn pass describing measured execution and time loss or gain. A causal explanation is included only when the recorded driving evidence supports it.
_Avoid_: Tip, hint, AI advice

**Clean Lap**:
A completed lap in Time Trial (or attempt in Corner Drill) executed with zero Barrier contacts; only Clean Laps are eligible to set official Personal Best records.
_Avoid_: Valid lap, legal lap, penalty-free lap

**Ghost Kart**:
A non-colliding translucent replay of the Reference Lap or the driver's Personal Best, using the current Kart and driver appearance for spatial comparison on the Circuit. Replays from earlier handling or Circuit versions remain legacy records, separate from current comparisons.
_Avoid_: Shadow car, AI opponent, bot
