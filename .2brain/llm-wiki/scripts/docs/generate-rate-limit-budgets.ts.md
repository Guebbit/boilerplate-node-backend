---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: aa05372e0a3e095b7188601393af9bf2b0cc1aad3e906c53f6c99118d912cc5f
generated_at: 2026-10-15T09:40:42.050114+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates (or checks) the rate-limit budget table inside `docs/tools/security.md`. The table is derived directly from module manifests and the infrastructure rate-limit constants, so it stays in sync with code. In `--check` mode (used by `complete`) it reports drift instead of rewriting.

## Key elements

- **`checkOnly`** — boolean; true when `--check` is in `process.argv`. Switches `applyMarkerBlocks` from write to report-drift.
- **`START` / `END`** — HTML-comment markers (`<!-- rate-limit-budgets:start/end -->`) that delimit the generated block in the target page.
- **`rows`** — the combined list of all `RateLimitBudget` objects, each tagged with an `owner` string (module name or `'infrastructure'`). Built from `enabledModules` → `resolveRateLimits` plus `INFRASTRUCTURE_RATE_LIMITS`.
- **`windowCell(windowMs)`** — renders the Window column: `'shared'` → `` `NODE_RATE_LIMIT_WINDOW_MS` ``, a number → `"…ms"`.
- **`budgetTable()`** — assembles the full markdown table (header + one row per budget).
- **`applyMarkerBlocks(…)`** — writes the table between the markers (or checks for drift). Exits with the returned code.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/docs/marker-block.ts` | Provides `applyMarkerBlocks`, the shared write/check mechanism. |
| `scripts/modules-on-disk.ts` | Provides `REPO_ROOT` used to resolve the page path. |
| `src/modules.ts` | Provides `enabledModules`, the list of active app modules. |
| `src/kernel/registry.ts` | Provides `resolveRateLimits`, which extracts budget configs from a module's manifest. |
| `src/infrastructure/http/middlewares/rate-limit.ts` | Provides `INFRASTRUCTURE_RATE_LIMITS`, the non-module budgets. |
| `src/types/index.ts` / `src/types/rate-limit-budget.ts` | Define the `RateLimitBudget` shape used throughout. |

## Notes

- The script **trusts** that `tests/cross-cutting/rate-limit-budgets.test.ts` has already validated internal consistency before it runs in `complete`; it does not re-validate budget semantics itself.
- `onStoreError` defaults to the string `'memory'` in the table when the budget omits it (`?? 'memory'`).
- The `windowMs: 'shared'` sentinel is not a number; it refers to the shared `NODE_RATE_LIMIT_WINDOW_MS` env var and is rendered as such.
- The table is the **only** generated content; surrounding prose in `security.md` is never touched.
