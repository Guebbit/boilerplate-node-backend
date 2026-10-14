---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: 5117597b9e210e366bb6fdd5df4d4515a9c283eb6a7270a3c764f1cc1240d5cc
generated_at: 2026-10-14T07:16:04.979578+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates the rate-limit budget table inside `docs/tools/security.md` by reading `RateLimitBudget` entries from every enabled module's manifest and from `INFRASTRUCTURE_RATE_LIMITS`. It exists so the table stays in sync with code—when a budget's default, window, or env var changes in source, regenerating the doc picks it up automatically instead of silently going stale.

## Key elements

- **`checkOnly`** – Set when `--check` is in `process.argv`; makes the script report drift rather than rewrite the page (the mode `complete` runs).
- **`rows`** – Combined array of every `RateLimitBudget & { owner }` in the app: one per budget from `enabledModules` (via `resolveRateLimits`) plus one per entry in `INFRASTRUCTURE_RATE_LIMITS` (owner labelled `'infrastructure'`).
- **`windowCell`** – Renders `windowMs` for the table: `'shared'` → the env-var name, a number → `<n>ms`.
- **`budgetTable`** – Builds the full Markdown table (header + one row per budget) as a single string.
- **`applyMarkerBlocks(...)` call** – Delegates the actual file read, block replacement (or drift check), and exit-code logic to the shared `marker-block` helper.

## Relationships

- **`scripts/docs/marker-block.ts`** – Supplies `applyMarkerBlocks`, which handles reading `PAGE`, locating the `<!-- rate-limit-budgets:start/end -->` markers, replacing the body (or comparing in `--check`), and returning an exit code.
- **`src/modules.ts`** – Exports `enabledModules`, the list of app modules whose manifests are inspected.
- **`src/kernel/registry.ts`** – Exports `resolveRateLimits`, which extracts the `RateLimitBudget[]` declared in a module's manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Exports `INFRASTRUCTURE_RATE_LIMITS`, the non-module (infrastructure-level) budgets appended as rows.
- **`src/types/index.ts`** – Re-exports the `RateLimitBudget` type used throughout this script.
- **`src/types/rate-limit-budget.ts`** – Defines the `RateLimitBudget` interface (the shape of each table row).

## Notes

- The script performs **no** consistency validation of its own; it trusts that `tests/cross-cutting/rate-limit-budgets.test.ts` has already passed in the `complete` pipeline.
- `windowMs` is a union: either a positive integer (milliseconds) or the literal string `'shared'` (meaning the window is set via the `NODE_RATE_LIMIT_WINDOW_MS` env var).
- `onStoreError` may be absent; the table cell falls back to `'memory'`.
- Run via `tsx` (see shebang); the npm script alias is `docs:rate-limits`.
