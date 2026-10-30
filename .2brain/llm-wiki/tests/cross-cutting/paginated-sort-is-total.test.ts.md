---
source: tests/cross-cutting/paginated-sort-is-total.test.ts
sha256: a6accbcf88e397814cbdd367e8880c49765b44a43b3f3ff6f637f14ac0f1bfb8
generated_at: 2026-10-29T06:47:59.833239+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

Cross-cutting guard that every MongoDB aggregation pipeline using `$skip` (pagination) declares a `$sort` whose last key is unique, so the tie order cannot differ between the count query and the page query. It works syntactically—reading source files and matching `$sort` stages with a regex—rather than driving a database, so it covers all current and future pipelines in the tree.

## Key elements

- **`SOURCE_ROOT`** — Resolved path to `src/` under the repo root; the scan boundary.
- **`UNIQUE_KEYS`** — `Set(['_id', 'id'])`; keys that guarantee a total (tie-free) sort.
- **`TOTAL_SORT_CONSTANTS`** — `Set(['DEFAULT_SORT'])`; named constants the repo publishes that already close on a unique key.
- **`listSourceFiles(directory)`** — Recursively collects `.ts` files under a directory, skipping any `tests/` subdirectory (fixtures are not real queries).
- **`SORT_STAGE`** — Regex matching `$sort:` followed by an inline object literal or an identifier (optionally with a `??` fallback expression).
- **`sortKeys(literal)`** — Extracts the declared key names (in order) from an inline sort object literal.
- **`isTotal(spec)`** — Returns `true` when a sort spec's final key is in `UNIQUE_KEYS`; resolves `??` fallbacks to their right-hand side; delegates named constants to `TOTAL_SORT_CONSTANTS`.
- **`pagedSortStages()`** — Scans all source files containing `$skip` and collects their `$sort` stage specs as `{ file, spec }` pairs (whitespace collapsed).
- **Test: "finds no pipeline paging through a sort that can tie"** — Asserts the filtered set of non-total paged sorts is empty.
- **Test: "actually finds the pipelines it claims to scan"** — Canary: if `orders` is deployed, at least one paged sort stage must be found, preventing a silent regex failure from producing a vacuous pass.

## Relationships

- **`tests/support/paths.ts`** — Supplies `REPO_ROOT` (base for resolving `SOURCE_ROOT`) and `isDeployed('orders')` (gates the canary assertion to environments where the `orders` service exists).

## Notes

- Deliberately syntactic: the regex matches `$sort` in aggregation pipelines only. `inventory`'s `find().sort().skip()` chain is intentionally not scanned.
- `src/tests/` subdirectories are excluded from the walk to skip fixture pipelines.
- The `??` fallback in a sort expression (e.g. `resolveSort ?? DEFAULT_SORT`) is total iff its *right-hand* side is; the test resolves only the last operand.
- The canary test is conditional on `isDeployed('orders')`; in environments without that service the lower-bound assertion is skipped entirely.
