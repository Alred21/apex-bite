# Iteration 4 code review

Reviewed the complete integration against the immutable iteration-3 base `50c38c6`, initially at `5c5d3a0`, using `git diff 50c38c6...HEAD`. Standards and Spec were assessed independently. The focused review repair was implemented at `72ae393` and merged at `822539d`.

## Standards

Standards review: `50c38c6...5c5d3a0`

Read the full commit list and changed-file list, all changed production/code/test hunks, and the prescribed standards sources. Tooling-enforced issues excluded.

Documented standards: no confirmed violations. The changes preserve custom player dynamics and executable Reference Lap guidance (ADRs 0001–0003), retain older records, and test observable behavior through the approved Session, browser, and offline artifact seams. No internal mocking or tautological assertions identified. Commit-level diffs alone cannot establish every historical red-before-green cycle.

Judgement finding (baseline heuristic, optional; P3): **Duplicated Code / Shotgun Surgery** in `tools/experiment-reference-geometry.ts:30–55,132–140`, `tools/experiment-reference-controls.ts:40–60`, and `tools/adopt-reference-candidate.ts:20–23`. The same steering policy is repeated: `angles.slice(1).map((angle, index) => Math.abs(angle - angles[index]) / FIXED_TIMESTEP_SECONDS)`, p95/max/total-variation calculations, and the four robustness comparisons. Geometry and controls also duplicate the twelve-lap replay loop. Adoption already spells the timestep differently (`* 120`, `rate / 120`). A future measurement or gate correction must change three locations to keep search and adoption consistent. A small helper in the existing offline evidence utilities could own steering metrics, gate rejection, and retained-tape replay; keep the experiment protocols and search loops local. No current numerical discrepancy demonstrated, so this is maintenance feedback rather than a correctness blocker.

No other material baseline smells found; visual authoring constants, browser pixel crops, and focused experiment scripts do not justify broader abstraction work.

Resolution review (`5c5d3a0..72ae393`): P3 resolved. The focused four-file patch moves steering metrics, robustness gates, and twelve-lap replay into the existing `reference-evidence-helpers.ts`; all affected callers use these functions, including adoption without hard-coded 120 Hz arithmetic. Protocols and search behavior remain local. No new material standards issues found in this patch. Root reports bounded CLI equivalence, unchanged recipe/tape/signature/artifacts, and passing 88 tests/type/build; no redundant GPU rerun performed.

## Spec

No concrete Spec findings: no missing/partial requirement, unrequested product scope, or incorrectly implemented requirement identified in `git diff 50c38c6...5c5d3a0`.

Reviewed the canonical specification, accepted design, all ten tickets, glossary and ADRs against the changed production code, experiment/adoption tools, behavior tests, and retained raw evidence. Independently reran 23 tests covering new/legacy steering persistence, atomic rejection, reference adoption, guidance, records, all sixteen drills, and twelve uninterrupted clean replay laps; all passed.

The raw search reports select the fastest eligible 38.225-second candidate among the bounded trials. Its clearance/smoothness measurements satisfy the declared baseline-relative gates; the retained geometry/control artifact checksums match. Adoption evidence carries the selected controller, exact control-tape agreement, eleven Turn placements and sixteen clean drills with changed Flying Entries. Player dynamics and Circuit changes are absent from the production diff.

Inspected final Helmet/Chase and left/right steering images: separated current-model ghosts, driver presence, grip, readable sightlines, retained minimap numbers and absent floating labels agree with the requirements. The documented user approval satisfies the visual checkpoint. Rendering performance evidence distinguishes four clean browser laps from separate actually visible two-Ghost samples and reports cold-start hitches rather than claiming hitch-free startup.

The narrow drill HUD correction is consistent with the specification's requirement to keep drill timing and coaching synchronized: `src/ui/hud.ts:781` displays existing segment execution-card data as `LAST PASS`, or the target with `DELTA AFTER PASS` before completion. It does not introduce an unsupported live drill delta or warrant a scope-creep finding.

Review limits: retained browser artifacts were inspected, not freshly recaptured; broad hardware performance and exact historical steering reconstruction are explicitly outside the demonstrated claims.

## Repair verification

The repair consolidates measurements, robustness gates, and retained-tape replay in the existing offline evidence utility. It changes four tooling files and removes thirteen net lines, with no production, test, historical-evidence, or recipe changes. Bounded geometry/control outputs are byte-identical before and after except elapsed timing. Adoption reproduces the exact 38.225-second recipe and control tape; artifact and recipe hashes are unchanged. All 88 tests, type checking, production build, and diff checks pass. The merger independently reran both bounded CLI tests and type checking. The Standards reviewer confirmed resolution without new material issues.

The completed moving production benchmark remains valid because the repair changes offline tools only. Full searches and GPU tests were not needlessly repeated. See [implementation and performance evidence](iteration-4-implementation-report.md).

Summary: Standards — one optional P3 finding, resolved; zero remaining. Spec — zero findings. Worst original Standards issue: duplicated offline policy; resolved. Worst Spec issue: none.

