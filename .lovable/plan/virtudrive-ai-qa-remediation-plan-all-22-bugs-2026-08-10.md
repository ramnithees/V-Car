# VirtuDrive AI — QA Remediation Plan (all 22 bugs)

Fixes every issue from the audit, ordered by risk. Each phase ends with typecheck + the 176-test regression suite, plus a browser walkthrough at the end.

## Phase 1 — Blockers (Critical + High)

- **BUG-001** Require a signed-in user on the AI report endpoint, and verify the caller owns the simulation before spending an AI call. Add a simple per-user cooldown so the endpoint can't be hammered.
- **BUG-002** Rebuild the AI prompt so vehicle/road names and risk strings go into a clearly fenced, length-capped data block that the model is instructed to treat as data only.
- **BUG-003 + BUG-004** Stop one-click data loss: every delete (simulation, road, vehicle) gets a confirmation dialog that states exactly how many simulations and telemetry rows will be destroyed, and deletes navigate client-side instead of reloading the page.
- **BUG-005** Bound road geometry: base slope 0–20°, bank −15°..+15°, enforced in the road validator, in the wizard inputs, and as database constraints. Existing out-of-range rows (e.g. the 26° / ±60° sample road) are clamped in the same change.
- **BUG-006** Rework the safety verdict so it reflects how long the vehicle sat at its physical limit and which constraint bound it — a run that is rollover-limited for 74% of its length must not read 100/100 with 0% risk. Score, skid probability, and rollover probability all become functions of `at_limit_fraction`, the limiting-factor mix, and peak lateral g. Charts, KPI tiles, and the PDF pick this up automatically.
- **BUG-007** Detail pages (simulation, road, vehicle) get real error and not-found states with a retry action instead of a permanent "Loading…".

## Phase 2 — Data integrity, validation, performance

- **BUG-008** Persist runs atomically: write the run as pending, insert all telemetry, then mark it completed; clean up the parent row if telemetry fails.
- **BUG-009** Validate driver target speed (blocking message for empty, non-numeric, or out-of-range values) before the physics run starts.
- **BUG-010** Move the physics run off the main thread into a worker with progress reporting and a cancel button.
- **BUG-011** Fetch only the telemetry columns actually used, decimate large runs for the charts, and memoise the recomputed safe-speed profile.
- **BUG-012** Load the profile once and share it, instead of three identical requests per navigation.
- **BUG-016** Stop writing a client-supplied email into the profile; the email stays sourced from the auth identity.

## Phase 3 — Functional gaps and polish

- **BUG-013** New `/simulations` list page with search, sort, and pagination; the dashboard KPI and nav link to it.
- **BUG-014** Dashboard KPIs use one consistent scope, with separate "yours" vs "library" counts so 18/17 is no longer misleading.
- **BUG-015** Forgot-password flow on the sign-in page plus a `/reset-password` page, and a change-password section in Settings.
- **BUG-017** Per-route titles, descriptions, and social metadata on every page.
- **BUG-018** AI report can always be regenerated, with the existing report shown until the new one lands.
- **BUG-019** 3D playback starts paused.
- **BUG-020** Empty states for telemetry charts before data exists and for the vehicle/road selects when the account has none, with a link to create one.
- **BUG-021** Remove the deprecated Three.js clock usage causing the console warning.
- **BUG-022** Re-measure fuel consumption on a slope-clamped road after BUG-005 lands and report whether the figure is now realistic; fix only if it is still off.

## Technical notes

- Auth: `.middleware([requireSupabaseAuth])` on `explainSimulation`, ownership checked through `context.supabase` (RLS-scoped) before the gateway call.
- Geometry limits: `validate.ts` rules + `CHECK` constraints on `roads.base_slope_deg` and a trigger validating `bank_deg` inside the `curves` JSON, with a data-clamp update in the same migration.
- Safety scoring lives in `src/lib/ai/heuristics.ts` (`predictFromResults`); it will consume `summary.at_limit_fraction` and the `limiting` histogram already present in stored results, so no re-run of historical simulations is needed.
- Worker: physics entry wrapped in a module worker; `runSimulation` and `computeSafeProfile` stay pure so the existing 176 tests keep covering them unchanged.
- Route error handling via `errorComponent` / `notFoundComponent` on the three detail routes.

## Out of scope

No changes to the 3D scene geometry, road-corridor placement engine, or PDF layout beyond what the safety-score fix changes.
