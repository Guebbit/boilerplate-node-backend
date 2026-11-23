---
source: scripts/docs/generate-rate-limit-budgets.ts
source_sha256: e92433f51cdc32189bb26cf82e6114a565676b3ec09db3214a865b8cfc19624e
context_sha256: f3cdeb8beb9e51ecac14587327814536bc8528a264e3a5f250b03453f1438601
generated_at: 2026-11-22T02:03:44.895973+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose
A `tsx` script that generates the rate-limit budget table in a security documentation page (the `PAGE` path under the repo root). It reads budget data from every enabled module's manifest plus the infrastructure budgets, and rewrites the block between marker comments in that page. Prose outside the markers is left untouched. It exists so the doc can't silently go stale when a budget's default, window or env var changes in code. It follows the same shape as `generate-role-matrix.ts`.

## Key elements
- `checkOnly` — true when the `--check` flag is passed. The script then reports drift instead of rewriting the page. This is the mode `complete` runs.
- `PAGE` — path to the target documentation page, built by joining the repo root with a hard-coded relative path.
- `START` / `END` — the markers `<!-- rate-limit-budgets:start -->` and `<!-- rate-limit-budgets:end -->`. Everything between them is replaced.
- `rows` — the table data. For each module in `enabledModules`, it calls `resolveRateLimits([appModule])` and tags each budget with `owner: appModule.name`. It then appends `INFRASTRUCTURE_RATE_LIMITS` with `owner: 'infrastructure'`.
- `windowCell` — renders a window. `'shared'` becomes `` `NODE_RATE_LIMIT_WINDOW_MS` ``, and a number becomes `<n>ms`.
- `budgetTable` — builds the Markdown table. Its columns are Budget, Namespace, Owner, Env var, Default, Window, Keyed by, Audited and Redis down. `onStoreError` falls back to `memory` when unset.
- The `applyMarkerBlocks(...)` call at the bottom does the file update or drift check. It sets `process.exitCode` from the returned code and routes errors to `failScript`.

## Relationships
- `src/modules.ts` supplies `enabledModules`, the list of modules whose budgets are tabulated.
- `src/kernel/registry.ts` supplies `resolveRateLimits`, which extracts each module's budgets.
- `src/infrastructure/http/middlewares/rate-limit.ts` supplies `INFRASTRUCTURE_RATE_LIMITS`, the non-module budgets.
- `src/types/index.ts` supplies the `RateLimitBudget` type. The type is defined in `src/types/rate-limit-budget.ts`.
- `scripts/docs/marker-block.ts` supplies `applyMarkerBlocks`, which replaces the marked block or reports drift.
- `scripts/modules-on-disk.ts` supplies `REPO_ROOT`, used as `ROOT`.
- `scripts/cli.ts` supplies `hasFlag`, used to read `--check`.
- `scripts/fail-script.ts` supplies `failScript`, the rejection handler.

## Notes
- The script does not validate the budgets. It relies on `tests/cross-cutting/rate-limit-budgets.test.ts` having already checked them for consistency in `complete`.
- Rows are computed at module load time, so the table reflects whatever `enabledModules` contains when the script runs.
