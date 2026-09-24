---
source: scripts/docs/generate-rate-limit-budgets.ts
sha256: 670e71fce6559493fb16f716895e9e14cf67b59c4f08ad11a78024c28df74213
generated_at: 2026-09-23T17:25:44.165686+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-rate-limit-budgets.ts

## Purpose

Generates the rate-limit budget table in `docs/tools/security.md` by reading `RateLimitBudget` data from every enabled module's manifest plus the infrastructure-level limits, then writes (or checks) the result between HTML-comment markers in that page. It exists so that budget changes in code are never silently out of sync with the documentation.

## Key elements

- **`rows`** — Combined array of all `RateLimitBudget` entries (from `enabledModules` via `resolveRateLimits`, and from `INFRASTRUCTURE_RATE_LIMITS`), each tagged with an `owner` string.
- **`windowCell`** — Renders a budget's `windowMs` for the table: the literal env-var name when the value is `'shared'`, otherwise a millisecond string.
- **`budgetTable`** — Builds the full Markdown table (header + one row per budget) as a string.
- **`apply`** — Reads `docs/tools/security.md`, splices the new table between the `<!-- rate-limit-budgets:start/end -->` markers, formats the whole page with Prettier, then either reports drift (`--check`) or writes the file back.
- **`checkOnly`** — Boolean flag set when `--check` is in `process.argv`; switches `apply` from write-to-report mode.

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, the list of app modules whose manifests are queried for rate-limit budgets.
- **`src/kernel/registry.ts`** — Provides `resolveRateLimits`, which extracts the `RateLimitBudget` array from a module's manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Exports `INFRASTRUCTURE_RATE_LIMITS`, the shared/infrastructure-level budgets included as additional rows.
- **`src/types/index.ts`** / **`src/types/rate-limit-budget.ts`** — Define the `RateLimitBudget` interface that shapes every row.

## Notes

- The script formats the entire page with Prettier before comparing bytes, because `complete` also runs `prettier --check` over `docs/`; skipping the format step would leave the two checks demanding different bytes.
- `--check` mode is what `complete` invokes; it exits non-zero with a remediation message instead of writing.
- The script does not re-validate budget consistency itself — it trusts that `tests/cross-cutting/rate-limit-budgets.test.ts` has already run in the same pipeline.
- Follows the same marker-and-splice pattern as `generate-role-matrix.ts`.
