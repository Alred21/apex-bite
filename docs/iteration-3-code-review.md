# Iteration 3 code review

Reviewed `d9e8ecd92330b5c9b5e9a23e0652d92a310ad0fb...bed480f478dbe2cd8ebb171a8d35625d9de2bbdf` with separate, parallel Standards and Spec reviewers. The fixed point resolves and the diff is non-empty. Both reviewers were read-only.

## Standards

No Standards findings. No documented rule breaches or actionable Fowler baseline smells found in the reviewed diff. Remaining small repetitions do not justify abstraction under the user's instruction to avoid overengineering.

## Spec

**[P2] Personal Best Ghost fabricates a Corner Drill start after a clean reverse lap.** The drill consumer in `session.ts` replaces an unavailable distance-based replay start with zero. Story 26 requires Ghost Kart and live comparisons to handle backward progress safely, without fabricated comparisons. The newly supported backward tape correctly makes distance lookup unavailable, but the fallback plays the beginning of the whole lap instead of an aligned drill segment.

Independently reproduced through ordinary public Session commands: earn a clean 47.05 s PB with 42 backward frames, export/import, select Personal Best, then T3. The Ghost appears at the first saved full-lap pose, 46.10 m from the Flying Entry. Suppress this unavailable drill comparison or establish a justified alignment while retaining valid full-lap time playback.

No other concrete missing requirement, incorrect implementation, or unrequested scope expansion identified. The four-lap browser acceptance sample preserves the twelve-lap product default, and measured startup cost supports the bounded offline Reference Lap recipe.

## Resolution

Resolved by suppressing the Personal Best Ghost in a Corner Drill when its Flying Entry time is unavailable. The Reference Ghost remains available in Both mode, while valid full-lap time playback and the original backward tape remain intact. The change only selects the existing replay clock in `getSnapshot`; it does not alter replay poses, records, physics, rendering, or the twelve-lap product default.

The existing clean recovery/portable Ghost test was extended through the public Session seam. Before the fix, its new T3 assertion failed with the lap-start pose instead of `null`. Afterward, Personal Best and Both suppress the unavailable drill comparison; Reference playback advances, mode changes preserve Kart/drill state, Time Trial PB playback advances again, and exported records remain byte-for-byte unchanged. All **78 tests**, type checking and the production build pass. The original four-lap browser measurements remain valid: ordinary full-lap and monotonic drill playback are unchanged, so no additional GPU benchmark was run.

Both reviewers independently checked the focused fix at `52b2398`. The Spec reviewer reran the public reproduction and all seven recovery tests, confirming the finding resolved; the Standards reviewer confirmed no new breaches or actionable smells.

Original review findings: Standards **0** (worst: none); Spec **1** (worst: P2, misaligned backward-PB drill Ghost), **resolved**. Remaining findings: **0**.
