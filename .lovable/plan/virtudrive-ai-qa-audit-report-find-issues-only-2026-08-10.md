# VirtuDrive AI — QA Audit Report (Find Issues Only)

No application code was modified. Everything below is observation, evidence, and classification.

## How this was tested

- Static inspection of all routes, wizards, physics/AI libraries, server functions, auth wiring.
- Full existing test suite: **176/176 passing**; TypeScript typecheck: **clean**.
- Authenticated end-to-end walkthrough (headless Chromium, 1280x1800) of `/`, `/auth`, `/dashboard`, `/vehicles`, `/roads`, `/simulate`, `/settings`, `/simulations/:id` with console + network capture and screenshots.
- Direct database inspection: row counts, foreign-key delete rules, stored road/vehicle/simulation values.

## Application understanding

Single-role (no role table) authenticated SaaS. Auth: email/password + Google via the Lovable broker; protected subtree `_authenticated` gated client-side. Data: `profiles`, `vehicles`, `roads`, `simulations`, `simulation_samples`, all RLS-scoped to `auth.uid()` with `is_public` seeded rows readable by all. Physics runs **in the browser** (`src/lib/physics/*`), results and downsampled samples are written to the database from the client. One server function (`explainSimulation`) calls the Lovable AI gateway. PDF is generated client-side.

---

## BUG-001

**Title:** AI report server function is callable without authentication
**Severity:** Critical · **Priority:** P0 · **Category:** Security / API
**Location:** `src/lib/ai/explain.functions.ts` (`explainSimulation`)
**Preconditions:** None.
**Steps to Reproduce:** 1. Inspect the server function declaration. 2. Note `createServerFn({ method: "POST" })` with `.inputValidator()` and `.handler()` only. 3. No `.middleware([requireSupabaseAuth])`, no caller identity check, no rate limiting.
**Expected:** Only authenticated users can spend AI credits, ideally scoped to a simulation they own.
**Actual:** The RPC is publicly reachable; any caller who can post to the endpoint triggers a paid Gemini call with attacker-controlled prompt content.
**Reproducibility:** Always
**Evidence:** Handler reads `process.env.LOVABLE_API_KEY` and calls the gateway with no identity check; `requireSupabaseAuth` is not imported anywhere in the file.
**Possible Root Cause:** Missing auth middleware (strong evidence — declaration is complete and visible).
**Developer Investigation Area:** `src/lib/ai/explain.functions.ts`, `src/integrations/supabase/auth-middleware.ts`.

## BUG-002

**Title:** LLM prompt is built from unsanitised user-controlled strings (prompt-injection surface)
**Severity:** High · **Priority:** P1 · **Category:** Security / AI
**Location:** `src/lib/ai/explain.functions.ts`, prompt template
**Steps to Reproduce:** 1. Create a vehicle or road whose `name`/`manufacturer` contains instruction text. 2. Run a simulation with it. 3. Click **Generate** on the AI Engineering Report.
**Expected:** User data is treated as data, delimited/escaped, and cannot alter system behaviour.
**Actual:** `data.vehicle.name`, `manufacturer`, `road.name` and heuristic `key_risks` strings are interpolated raw into the instruction body with no delimiting or length cap.
**Reproducibility:** Always (structurally present)
**Evidence:** Template literal at lines ~59–80 of the handler.
**Developer Investigation Area:** Prompt construction; consider separating untrusted fields into a data block and capping length.

## BUG-003

**Title:** Deleting a road or vehicle silently destroys every simulation that used it
**Severity:** High · **Priority:** P1 · **Category:** Database / Data loss
**Location:** `/roads/:id`, `/vehicles/:id` delete actions; FK constraints
**Steps to Reproduce:** 1. Run one or more simulations against a road you own. 2. Open the road detail page. 3. Click the delete (trash) icon. 4. Open Dashboard.
**Expected:** Either the delete is blocked while simulations reference the road, or the user is warned that N simulations will be destroyed.
**Actual:** `simulations_road_id_fkey` and `simulations_vehicle_id_fkey` are `ON DELETE CASCADE`, and `simulation_samples_simulation_id_fkey` cascades further. All related runs and telemetry disappear with no warning.
**Reproducibility:** Always
**Evidence:** `pg_constraint` query — `confdeltype = 'c'` for both FKs.
**Developer Investigation Area:** Migration defining the FKs; delete UX in `roads.$id.tsx` / `vehicles.$id.tsx`.

## BUG-004

**Title:** No confirmation on any destructive delete; simulation delete does a hard page reload
**Severity:** High · **Priority:** P1 · **Category:** Functional / UX
**Location:** `src/routes/_authenticated/simulations.$id.tsx` (line ~62, ~228), `roads.$id.tsx`, `vehicles.$id.tsx`
**Steps to Reproduce:** 1. Open a simulation. 2. Single-click the red trash button.
**Expected:** Confirmation dialog; on success, client-side navigation.
**Actual:** Data is deleted immediately on one click, there is no undo, and success calls `window.location.href = "/dashboard"` — a full document reload that discards the router/query cache.
**Reproducibility:** Always
**Developer Investigation Area:** Add `AlertDialog` + `navigate()`.

## BUG-005

**Title:** Road geometry limits are enforced only in the client wizard; out-of-range roads are persisted
**Severity:** High · **Priority:** P1 · **Category:** Database / Validation
**Location:** `src/lib/roads/validate.ts`, `src/components/roads/wizard/RoadWizard.tsx`, `public.roads`
**Steps to Reproduce:** 1. Create a road, set base slope to 26° and a curve bank to 60° (or −50°). 2. Save.
**Expected:** Slope and bank bounded to physically meaningful ranges (validator already caps _segment_ slope at 0–20°) and enforced server-side.
**Actual:** `base_slope_deg` and every `bank_deg` are completely unvalidated, and the table has no CHECK constraints. A stored road (`sample road-12`) has `base_slope_deg = 26` over 8 km with curve banks of `−50°` and `+60°`, which then drives the physics engine, the 3D corridor, and the PDF.
**Reproducibility:** Always
**Evidence:** DB row for `sample road-12`; `validate.ts` contains no `bank_deg` or `base_slope_deg` rule.
**Developer Investigation Area:** `validate.ts`, wizard inputs, DB CHECK constraints.

## BUG-006

**Title:** Safety verdict contradicts the physics — 100/100 with 0% risk while the vehicle sat at its rollover limit for 74% of the run
**Severity:** High · **Priority:** P1 · **Category:** Functional / Business logic
**Location:** `src/lib/ai/heuristics.ts` (`predictFromResults`), sim results header
**Steps to Reproduce:** 1. Open simulation `SAMPLE TEST ON (8.8.26)`. 2. Compare the KPI tiles with the stored summary.
**Expected:** A run whose controller is rollover-limited for most of its length, at 1.27 g peak lateral, should not read as a perfect safety score with zero skid and rollover probability.
**Actual:** KPIs show **Safety score 100/100, Skid P 0%, Rollover P 0%, Peak lateral 1.27 g**, while the stored summary has `at_limit_fraction = 0.736` and hundreds of `limiting: "rollover"` events. Because the adaptive controller keeps the vehicle _at_ the safe cap, `min_safety_score`/`avg_safety_score` stay at 100 and every derived probability collapses to 0.
**Reproducibility:** Always
**Evidence:** DB `results->'summary'` for that simulation; `overshoot = (100 - min_safety_score)/20` in `heuristics.ts`.
**Developer Investigation Area:** Safety scoring must account for `at_limit_fraction` and limiting-factor mix, not only margin below the cap.

## BUG-007

**Title:** Route pages get stuck on "Loading…" forever when a query fails or the id does not exist
**Severity:** High · **Priority:** P1 · **Category:** Functional / Error handling
**Location:** `simulations.$id.tsx` line 213, `roads.$id.tsx`, `vehicles.$id.tsx`
**Steps to Reproduce:** 1. Navigate to `/simulations/<valid-uuid-you-do-not-own>` (or disconnect the network and reload).
**Expected:** "Not found" or an error state with retry.
**Actual:** The guard is `if (isLoading || !data) return "Loading…"`. On error, `isLoading` is false and `data` is undefined, so the page shows a permanent loading string. No `errorComponent` / `notFoundComponent` is defined on these routes.
**Reproducibility:** Always
**Developer Investigation Area:** Query error branches and route-level error boundaries.

## BUG-008

**Title:** Simulation persistence is non-atomic — a failed sample batch leaves an orphaned "completed" run
**Severity:** Medium · **Priority:** P2 · **Category:** Database
**Location:** `src/routes/_authenticated/simulate.tsx` lines 94–124
**Steps to Reproduce:** 1. Start a run. 2. Interrupt the network (or close the tab) after the `simulations` insert but during the chunked `simulation_samples` inserts.
**Expected:** Either the whole run is stored or nothing is.
**Actual:** The parent row is written first with `status: "completed"`, then up to ~3 sequential 200-row chunks. Any failure aborts the loop with a toast, leaving a row marked completed with missing telemetry; the detail page then renders empty 3D/telemetry panels. No rollback or cleanup.
**Reproducibility:** Often (under failure)
**Developer Investigation Area:** Wrap persistence in a server function / RPC, or write samples before marking the run completed.

## BUG-009

**Title:** Driver target speed accepts out-of-range and non-numeric values
**Severity:** Medium · **Priority:** P2 · **Category:** Functional / Validation
**Location:** `simulate.tsx` line 163 and `run()`
**Steps to Reproduce:** 1. Go to `/simulate`. 2. Clear the target speed field (becomes `NaN` via `Number("")` → `0`) or paste `999999`. 3. Run.
**Expected:** Blocking validation with a clear message before the physics run.
**Actual:** `min`/`max` are HTML hints only; `run()` never validates `targetKmh`. Empty input yields `0`, and arbitrarily large values are passed straight into the solver and stored in `params`.
**Reproducibility:** Always

## BUG-010

**Title:** Heavy simulation runs on the main thread with no cancel or progress
**Severity:** Medium · **Priority:** P2 · **Category:** Performance
**Location:** `simulate.tsx` `run()`, `src/lib/physics/simulation.ts`
**Steps to Reproduce:** 1. Create a 100 km road with many curves. 2. Run at 5 m step (20,000 stations).
**Expected:** Worker/off-thread execution or at least progress + cancel.
**Actual:** `runSimulation` plus `computeSafeProfile` execute synchronously in the click handler; the UI is frozen for the duration and the only feedback is a spinner. The button cannot be cancelled and repeated clicking is only blocked by `running`.
**Reproducibility:** Always at large road lengths

## BUG-011

**Title:** Simulation detail fetches every sample row with `select("*")` and no limit
**Severity:** Medium · **Priority:** P2 · **Category:** Performance / API
**Location:** `simulations.$id.tsx` line 54
**Actual:** All samples for the run are fetched, then `computeSafeProfile` is recomputed in the browser for the whole road on every load, feeding 3D playback, minimap, HUD, and six charts. `simulation_samples` already holds 5,179 rows across 16 runs and grows ~400 rows per run.
**Reproducibility:** Always
**Developer Investigation Area:** Column projection, pagination/decimation, memoised profile.

## BUG-012

**Title:** Duplicate profile requests fired three times per page load
**Severity:** Medium · **Priority:** P2 · **Category:** Performance
**Location:** `src/components/auth/UserMenu.tsx` (rendered in both desktop sidebar and mobile header)
**Evidence:** Network capture shows three identical `GET /rest/v1/profiles?select=full_name,avatar_url,email&id=eq.<uid>` per navigation.
**Reproducibility:** Always

## BUG-013

**Title:** No way to browse past simulations — only the 10 most recent are reachable
**Severity:** Medium · **Priority:** P2 · **Category:** Functional
**Location:** `dashboard.tsx` (`.limit(10)`); no `/simulations` index route exists
**Actual:** There is no list page, search, filter, sort, or pagination for simulations. Older runs are reachable only by pasting a UUID URL. The nav "Simulations" KPI links to `/simulate`, not to a list.
**Reproducibility:** Always

## BUG-014

**Title:** Dashboard KPI counts mix scopes (public seeded rows vs. own rows)
**Severity:** Medium · **Priority:** P2 · **Category:** Functional / Data
**Location:** `dashboard.tsx` counts query
**Actual:** "Vehicles 18" and "Roads 17" include the 15 seeded public vehicles and 5 seeded public roads visible through RLS, while "Simulations" counts only the user's own rows. The labels imply one consistent scope.
**Reproducibility:** Always

## BUG-015

**Title:** No password reset / forgot-password flow
**Severity:** Medium · **Priority:** P2 · **Category:** Functional / Auth
**Location:** `src/routes/auth.tsx`
**Actual:** Sign in and sign up only. A user who forgets a password has no recovery path in the UI (`resetPasswordForEmail` is not used anywhere), and there is no password change in Settings.
**Reproducibility:** Always

## BUG-016

**Title:** Settings writes an arbitrary `email` value into `profiles`, diverging from the auth identity
**Severity:** Medium · **Priority:** P2 · **Category:** Database / Data integrity
**Location:** `settings.tsx` `save()` — `upsert({ id, email, full_name, organization })`
**Actual:** The email is sent from client state on every save. The field is disabled in the UI today, but the write path accepts any value, so `profiles.email` is not a trustworthy mirror of `auth.users.email`.
**Reproducibility:** Always (structurally)

## BUG-017

**Title:** Every page shares the root document title and description
**Severity:** Medium · **Priority:** P3 · **Category:** UI / SEO
**Location:** All route files — no route defines `head()`
**Actual:** `/`, `/auth`, `/dashboard`, `/vehicles`, `/roads`, `/simulate`, `/settings`, `/simulations/:id` all report the title "VirtuDrive AI — Virtual Vehicle Performance Testing". Browser tabs, history, and bookmarks are indistinguishable; the public landing page has no page-specific metadata.
**Evidence:** `page.title()` identical across all seven routes in the walkthrough.

## BUG-018

**Title:** AI report cannot be regenerated once produced
**Severity:** Low · **Priority:** P3 · **Category:** Functional / AI
**Location:** `simulations.$id.tsx` line 309 — `{!data.ai_summary && (<Button …>)}`
**Actual:** The Generate button is unmounted after the first report. If the model returns the degraded fallback (the `NoObjectGeneratedError` path writes "Regenerate the report to retry structured analysis"), the user is told to regenerate but has no control to do so.
**Reproducibility:** Always

## BUG-019

**Title:** 3D playback auto-plays on page open
**Severity:** Low · **Priority:** P3 · **Category:** UI/UX
**Location:** `src/components/Sim3DScene.tsx` / playback store
**Evidence:** Screenshot of a freshly opened simulation shows the transport in **Pause** state (i.e. already playing) at 0.7 s with the vehicle moving before any user input.

## BUG-020

**Title:** Empty telemetry charts and empty selects have no empty state
**Severity:** Low · **Priority:** P3 · **Category:** UI/UX
**Location:** `LiveTelemetry`, `/simulate` selects
**Actual:** At t≈0 the six telemetry charts render axes with a single vertical marker and no series, reading as broken rather than "no data yet". On `/simulate`, if the account has no vehicles or roads, the dropdowns open empty with no "create one first" guidance.

## BUG-021

**Title:** Deprecated Three.js API warning on every playback mount
**Severity:** Low · **Priority:** P3 · **Category:** Compatibility
**Evidence:** Console — `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`

## BUG-022 (needs developer verification, not a confirmed defect)

**Title:** Fuel figure of 28.99 L/100 km on an 8 km route
**Severity:** Medium · **Priority:** P2 · **Category:** Functional / Physics
**Evidence:** That run is on a road with `base_slope_deg = 26°` sustained for 8 km at ~131 km/h average, which can legitimately produce a very high figure. The number is therefore **not** classified as a defect here; it is entangled with BUG-005 (unbounded slope). Re-verify after slope validation is fixed.

---

## QA TEST SUMMARY

**Application Status:** PASS WITH ISSUES

**Total Issues:** 22

- Critical: 1 (BUG-001)
- High: 6 (BUG-002, 003, 004, 005, 006, 007)
- Medium: 11 (BUG-008–017, 022)
- Low: 4 (BUG-018, 019, 020, 021)

**Functional:** BUG-004, 006, 007, 009, 013, 014, 015, 018, 022
**UI/UX:** BUG-017, 019, 020
**API:** BUG-001, 002, 011
**Database:** BUG-003, 005, 008, 016
**Security:** BUG-001, 002
**Performance:** BUG-010, 011, 012
**AI:** BUG-001, 002, 018
**Compatibility:** BUG-021

**Areas that passed:** RLS scoping (per-user policies on all five tables, cross-user reads correctly blocked; no orphan sample rows found), route protection (`/dashboard` and every protected route redirect to `/auth` without a session), sign-out hygiene (cancel + clear + replace), no horizontal overflow at 1280 px on any page, 176/176 regression tests green, clean typecheck, and no secrets in client code (only the publishable key is exposed, which is correct).

**Critical blockers before production:**

1. BUG-001 — unauthenticated paid AI endpoint.
2. BUG-003 + BUG-004 — one-click cascading data loss.
3. BUG-006 — safety verdict contradicts the physics; this is the product's core output.
4. BUG-005 — unbounded road geometry feeding the engine and reports.
5. BUG-007 — permanent loading state on any failed detail fetch.

**Production Recommendation:** NOT READY FOR PRODUCTION
