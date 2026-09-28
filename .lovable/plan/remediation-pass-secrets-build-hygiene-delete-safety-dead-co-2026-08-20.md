# Remediation Pass: Secrets, Build Hygiene, Delete Safety, Dead Code

Verified current state before planning. Findings from inspection:

- `.gitignore` does **not** list `.env`; there is no `.env.example`. `.env` here is platform-generated (Cloud keys) — publishable/anon only, no service-role key.
- `package.json` has `"@tanstack/react-router": "^1.170.25"` in dependencies but exact `1.170.25` in both `overrides` and `resolutions` — the npm conflict described.
- Both `bun.lock` and `package-lock.json` exist. No GitHub Actions workflow; this project builds with **bun** (`bunfig.toml`, text lockfile settings), so `bun.lock` is the real lockfile.
- Migration `20260717164743_...sql` did switch `simulations_road_id_fkey` / `simulations_vehicle_id_fkey` from `ON DELETE RESTRICT` (original `20260714090518`) to `ON DELETE CASCADE`. The road/vehicle detail pages already fetch a live dependent-simulation count and warn in the confirm dialog, but the delete still destroys them.
- Dead-code check with `noUnusedLocals`/`noUnusedParameters` produces exactly **7** findings (Environment.tsx x2, LiveMinimap.tsx, RoadsideKit.tsx x2, pdf/report.tsx, simulations.$id.tsx) — small, safe to clean.
- Confirmed generated-file headers: `src/routeTree.gen.ts`, `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher}.ts`. `types.ts` has no header banner but is Supabase-generated and will be excluded too.

## P0

1. **Secrets hygiene** — add `.env` (and `.env*.local`) to `.gitignore`, and add a `.env.example` with placeholder values documenting the required variables. Note: I cannot run git commands in this environment, so `git rm --cached .env` must be run by you; and on Lovable Cloud the `.env` file is regenerated automatically from managed keys. I will flag key rotation as an owner action rather than performing it.

2. **npm install conflict** — pin the direct dependency to exact `"@tanstack/react-router": "1.170.25"` so it matches the override. The override exists to force a single physical copy of router-core/react-router (a duplicate copy previously broke the `server:` route type augmentation), so the override stays as-is.

3. **Lockfile consolidation** — delete `package-lock.json`, add it to `.gitignore`, keep `bun.lock`. No dependency versions change.

4. **Cascading delete → RESTRICT + block** — new migration reverting both FKs to `ON DELETE RESTRICT` (old migration untouched). No evidence of intentional product cascading for road/vehicle, so the blocking approach is used. UI: on the road and vehicle detail pages, when the live dependent-simulation count is > 0, replace the delete button with a disabled state plus the message "N simulations use this road/vehicle — delete or reassign them first"; when the count is 0, the existing confirm-and-delete flow is unchanged. Simulation self-delete and its telemetry cascade are untouched.

## P1

5. **Re-enable dead-code checks** — `noUnusedLocals: true` and `noUnusedParameters: true` in `tsconfig.json`, drop the `"@typescript-eslint/no-unused-vars": "off"` override in `eslint.config.js`. Fix all resulting findings by deleting genuinely dead code (the 7 above plus any lint-only findings such as unused imports). No blanket suppressions; narrow, commented disables only if a value is load-bearing.

6. **Sonar exclusions** — add `sonar-project.properties` excluding the confirmed generated files: `src/routeTree.gen.ts`, `src/integrations/supabase/types.ts`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/client.server.ts`, `src/integrations/supabase/auth-middleware.ts`, `src/integrations/supabase/auth-attacher.ts`.

## Tests

Extend the regression suite with a delete-guard test module asserting the pure guard helper used by both delete flows: blocked when dependent simulation count > 0, allowed at 0, with the exact message text. All 176 existing tests must keep passing unchanged.

## Verification

`bun run lint`, `tsgo --noEmit`, `bun run test`, `bun run build`, then a preview click-through of sign-in, dashboard, vehicle/road create+view, simulation run, simulation detail (3D + charts), AI report, and both delete cases.

## Out of scope / owner actions

- Git history rewriting (not attempted).
- Running `git rm --cached .env` and rotating the Supabase URL/publishable key.
- No physics, 3D, road-generation, PDF, RLS, auth-middleware, or prompt-sanitization changes.
