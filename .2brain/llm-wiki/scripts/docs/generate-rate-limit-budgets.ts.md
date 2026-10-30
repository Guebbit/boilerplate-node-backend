---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: a1bc15a7a530a639d8a9726ca84c96ce94426085e514aaa810a6141b9e836901
generated_at: 2026-10-29T01:35:14.539115+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates (or checks) the rate-limit budget table embedded in `docs/tools/security.md`. The table is produced from live `RateLimitBudget` data read off every enabled module's manifest plus the shared `INFRASTRUCTURE_RATE_LIMITS`, so that code-side changes to defaults, windows, or env vars are reflected in the doc automatically instead of rotting silently.

## Key elements

- **`checkOnly`** — boolean set by the `--check` CLI flag; when true the script reports drift and exits non-zero without rewriting the page.
- **`PAGE`** — resolved path to `docs/tools/security.md`.
- **`START` / `END`** — HTML-comment markers (`<!-- rate-limit-budgets:start|end -->`) that delimit the generated block.
- **`rows`** — the flat list of all budgets (module-owned and infrastructure), each tagged with an `owner` string.
- **`windowCell`** — renders a `windowMs` value: the literal env-var name for `'shared'`, otherwise `"<n>ms"`.
- **`budgetTable()`** — assembles the full Markdown table (header, separator, one row per budget).
- **`applyMarkerBlocks(...)`** — writes the table between the markers, or diffs and reports drift in `--check` mode; sets `process.exitCode`.

## Relationships

- **`scripts/cli.ts`** — imports `hasFlag` to detect `--check`.
- **`scripts/docs/marker-block.ts`** — imports `applyMarkerBlocks`, which performs the actual file read/replace or drift-report within the marker delimiters.
- **`scripts/fail-script.ts`** — imported as the `.catch` handler to normalise uncaught errors into a consistent exit.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` as the base for resolving the doc page path.
- **`src/modules.ts`** — imports `enabledModules` to enumerate which modules' manifests to read.
- **`src/kernel/registry.ts`** — imports `resolveRateLimits` to extract budget entries from each module's manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — imports `INFRASTRUCTURE_RATE_LIMITS`, the set of budgets not owned by any app module.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — provides the `RateLimitBudget` type used for `rows` and `windowCell` signatures.

## Notes

- The script intentionally does **not** re-validate internal consistency of budgets (e.g. that a named env var is actually registered); it trusts `tests/cross-cutting/rate-limit-budgets.test.ts` to have already run as part of `complete`.
- `onStoreError` may be `undefined` in the source; the table renders it as the fallback string `'memory'`.
- Follows the same marker-block + `--check` pattern as `generate-role-matrix.ts`; add a new column here only if the column exists on `RateLimitBudget`.
