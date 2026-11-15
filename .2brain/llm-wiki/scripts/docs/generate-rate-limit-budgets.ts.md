---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: 0bb5193f4b2bdcce1efa7d1404404278c8d0260d00485e77f09bc48c83e14ae0
generated_at: 2026-11-14T17:33:14.175250+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates (or validates, in `--check` mode) the rate-limit budget table inside `docs/tools/security.md`. It collects every `RateLimitBudget` from each enabled module's manifest plus the infrastructure-level list, renders them as a single Markdown table between HTML-comment markers, and writes it back to the page — keeping the doc in lock-step with what the code actually enforces.

## Key elements

- **`rows`** — Combined array of all budgets (module + infrastructure), each augmented with an `owner` string (`appModule.name` or `'infrastructure'`). Serves as the row source for the table.
- **`windowCell`** — Renders a `windowMs` value: the literal `'shared'` becomes the env-var reference `` `NODE_RATE_LIMIT_WINDOW_MS` ``; a number is formatted as `${n}ms`.
- **`budgetTable()`** — Builds the full Markdown table string (header, separator, one row per budget with columns for name, namespace, owner, env var, default, window, keyed-by, audited, Redis-down behavior).
- **`checkOnly`** — Boolean from `hasFlag('check')`; when true, `applyMarkerBlocks` reports drift instead of rewriting the file.
- **`START` / `END`** — HTML-comment markers (`<!-- rate-limit-budgets:start/end -->`) that delimit the generated block; all content between them is replaced.
- **`applyMarkerBlocks` call** — The single entry point that either writes the table or diffs it; sets `process.exitCode` on success, delegates to `failScript` on failure.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; the script iterates this list to gather per-module budgets.
- **`src/kernel/registry.ts`** — Imports `resolveRateLimits`; extracts the `RateLimitBudget[]` from a module's manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Imports `INFRASTRUCTURE_RATE_LIMITS`; the fixed set of budgets that don't belong to any single module.
- **`src/types/index.ts`** (re-exports `RateLimitBudget` from `src/types/rate-limit-budget.ts`) — Provides the `RateLimitBudget` type used throughout.
- **`scripts/docs/marker-block.ts`** — Imports `applyMarkerBlocks`; performs the marker-delimited replacement or drift check.
- **`scripts/cli.ts`** — Imports `hasFlag`; reads `--check` from the CLI args.
- **`scripts/fail-script.ts`** — Imports `failScript`; handles uncaught errors and sets a non-zero exit code.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`; used to resolve the absolute path to the target Markdown page.

## Notes

- In `--check` mode (invoked by `complete`), the script does **not** write to the page; it reports drift and exits non-zero on mismatch. This is the CI-relevant path.
- The script assumes `tests/cross-cutting/rate-limit-budgets.test.ts` has already validated internal consistency of the budgets (e.g., no duplicate names). It does not re-verify that here.
- `onStoreError` defaults to the string `'memory'` in the table when a budget doesn't specify it.
- The generated block is bounded by two static HTML comments; anything outside those markers in the target page is never touched.
