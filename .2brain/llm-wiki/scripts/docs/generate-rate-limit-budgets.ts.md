---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: 8d01ae48a14e0123d93d0274915752a8f66113eab9e79b41e7f19b8136f1760f
generated_at: 2026-09-27T13:55:46.273727+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates the rate-limit budget table in `docs/tools/security.md` by reading `RateLimitBudget` data from every enabled module's manifest and from `INFRASTRUCTURE_RATE_LIMITS`. It exists so the table stays in sync with code automatically—eliminating the silent staleness that a hand-maintained table would accumulate when a budget's default, window, or env var changes. Runs as part of the `complete` pipeline (via the `docs:rate-limits` script).

## Key elements

- **`rows`** — Combined array of all budgets (one per module + infrastructure), each tagged with an `owner` string. This is the single source of truth for the table's data.
- **`windowCell(windowMs)`** — Renders a window value for the table: `'shared'` becomes the env-var name `NODE_RATE_LIMIT_WINDOW_MS`; a number is formatted as `<n>ms`.
- **`budgetTable()`** — Builds the full Markdown table (header + one row per budget) as a single string.
- **`checkOnly`** — Flag (`--check` in `argv`) that switches `applyMarkerBlocks` into report-drift-instead-of-rewrite mode; this is the mode `complete` uses.
- **`START` / `END`** — HTML comment markers (`<!-- rate-limit-budgets:start/end -->`) that delimit the generated block inside the target page.
- **`applyMarkerBlocks(...)` call** — The actual write/check entry point; sets `process.exitCode` to its return value.

## Relationships

- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, which performs the read-compare-write (or check-only) of the delimited block in the target page.
- **`src/modules.ts`** — Exports `enabledModules`; the script iterates over this list to know which manifests to query.
- **`src/kernel/registry.ts`** — Exports `resolveRateLimits`, called per module to extract its budget definitions from the manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Exports `INFRASTRUCTURE_RATE_LIMITS`, the budgets owned by the shared rate-limit middleware (not tied to a single module).
- **`src/types/rate-limit-budget.ts`** (via `src/types/index.ts`) — Defines the `RateLimitBudget` type that shapes every row in the table.

## Notes

- The script does **not** validate internal consistency of the budgets (e.g. matching env vars across modules). It trusts that `tests/cross-cutting/rate-limit-budgets.test.ts` has already passed in `complete` before this script runs.
- All content between the marker comments is wholesale replaced; any prose or formatting a developer placed there is lost on regeneration. Only edit outside the markers.
- `owner` is a synthetic field added by this script (`module.name` or the literal `'infrastructure'`); it is not part of the `RateLimitBudget` type.
