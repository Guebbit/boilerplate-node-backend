---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: a1bc15a7a530a639d8a9726ca84c96ce94426085e514aaa810a6141b9e836901
generated_at: 2026-11-08T02:48:19.874118+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates the rate-limit budget table embedded in `docs/tools/security.md` by reading `RateLimitBudget` entries from every enabled module's manifest and from `INFRASTRUCTURE_RATE_LIMITS`, then writing (or checking) the Markdown table between marker comments. Exists to keep the doc in lockstep with code without a human remembering to edit both.

## Key elements

- **`rows`** — Merges all budgets from `enabledModules` (via `resolveRateLimits`) with `INFRASTRUCTURE_RATE_LIMITS`, tagging each with its `owner` (module name or `'infrastructure'`).
- **`windowCell`** — Renders the Window column: `'shared'` becomes the `NODE_RATE_LIMIT_WINDOW_MS` env-var reference; a number becomes `<n>ms`.
- **`budgetTable()`** — Builds the full Markdown table (header + one row per budget) as a single string.
- **`checkOnly`** — Set from `hasFlag('check')`; when true the script reports drift instead of rewriting the file.
- **`applyMarkerBlocks` call** — Writes the table between the `<!-- rate-limit-budgets:start/end -->` markers in the target page, or exits non-zero on drift in check mode.

## Relationships

- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT` used to resolve the page path.
- **`scripts/cli.ts`** — Supplies `hasFlag` to detect `--check`.
- **`scripts/fail-script.ts`** — Supplies `failScript` as the rejection handler.
- **`scripts/docs/marker-block.ts`** — Supplies `applyMarkerBlocks`, the shared write-or-check mechanism used by all generated doc blocks.
- **`src/modules.ts`** — Supplies `enabledModules`, the list of modules whose manifests are read.
- **`src/kernel/registry.ts`** — Supplies `resolveRateLimits`, which extracts `RateLimitBudget[]` from a module's registry.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies `INFRASTRUCTURE_RATE_LIMITS` (the non-module budgets).
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Define the `RateLimitBudget` shape that drives the table columns.

## Notes

- The script trusts that `tests/cross-cutting/rate-limit-budgets.test.ts` has already validated internal consistency of the budgets; it does no consistency checking itself.
- `windowMs` of `'shared'` is a sentinel, not a number — it is rendered as the env-var name, so the table never shows a raw `ms` value for shared windows.
- `onStoreError` defaults to the literal string `'memory'` when a budget omits it.
- The script is invoked with `tsx` (shebang) and is part of the `complete` pipeline (check mode) and the docs-generation flow (write mode).
