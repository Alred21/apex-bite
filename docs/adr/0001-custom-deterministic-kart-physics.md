# Custom Deterministic 120 Hz Solid-Axle Kart Physics Engine

Indoor electric go-karts have no suspension, a solid rear live axle (no differential), rear-only braking, and an electronic top-speed limiter (45 km/h). General-purpose 3D rigid-body physics engines (such as Rapier3D or Cannon.js raycast vehicles) are built around independent-suspension 4-wheel passenger cars and struggle to model solid-axle inside-rear tire scrub, rear-only trail-braking rotation, and smooth indoor barrier rubbing without solver jitter.

We decided to build a custom deterministic fixed-timestep (120 Hz) planar/2.5D kart dynamics solver in TypeScript paired with spline-based track and barrier geometry, rather than integrating a third-party rigid-body physics engine. This gives us direct control over four-wheel weight transfer, solid-axle slip/scrub forces, progressive keyboard input shaping, and lightweight deterministic Ghost Kart replay recording.
