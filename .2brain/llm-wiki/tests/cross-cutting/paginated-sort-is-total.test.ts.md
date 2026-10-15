---
source: tests/cross-cutting/paginated-sort-is-total.test.ts
sha256: 95f67f6de9f96ab66a50b302e4e6022489bebefffaabef736b3d86d2c26c6fed
generated_at: 2026-10-15T12:39:21.450302+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

Cross-cutting guard that asserts every `$sort` stage co-located with a `$skip` in the source tree is *total*—its final key is unique (`_id` or `id`). Without a total sort, MongoDB's lack of a guaranteed tie order between the count query and the page query can duplicate or drop documents across pages. The test is purely syntactic (regex over source text) so it also covers pipelines that no test exercises yet.

## Key elements

- **`UNIQUE_KEYS`** — `Set(['_id', 'id'])`; the keys that guarantee a total order.
- **`TOTAL_SORT_CONSTANTS`** — `Set(['DEFAULT_SORT'])`; named sort constants already known to close on a unique key.
- **`listSourceFiles(dir)`** — recursively collects `.ts` files under `src/`, skipping any `tests/` subdirectory (fixture pipelines are excluded).
- **`SORT_STAGE`** (regex) — matches `$sort:` values as either an inline object literal `{…}` or an identifier with an optional `?? fallback`.
- **`sortKeys(literal)`** — extracts declared key names from an inline `{…}` sort spec, in order.
- **`isTotal(spec)`** — decides whether a sort spec ends in a unique key; resolves `??` by recursing on the right-hand side, looks up named constants, or checks the last key of an inline literal.
- **`pagedSortStages()`** — walks all source files containing `$skip` and returns every `$sort` stage found, with the spec whitespace-collapsed for readable failure output.
- **`describe('every paged $sort is total')`** — two assertions: (1) no non-total paged sort exists, (2) canary that the scanner actually matched ≥ 1 pipeline when the `orders` module is deployed.

## Relationships

- **`tests/support/paths.ts`** — imports `isDeployed` to gate the canary assertion behind the presence of the `orders` module, so the test doesn't fail in deployments where that module (the only one that pages through an aggregation pipeline) is absent.

## Notes

- Deliberately **syntactic only**: it matches `$sort:` in aggregation-pipeline syntax. A `find().sort().skip()` chain (as used by the `inventory` stock board) is *not* in scope for this regex.
- Skips `tests/` directories under `src/` because they hold fixture pipelines, not application queries.
- The `??` branch (`chosen ?? DEFAULT_SORT`) is handled by recursing into the fallback; the left-hand side is assumed to already close on `_id` by contract.
- The canary test (`toBeGreaterThanOrEqual(1)`) exists to catch a silent regression where the regex stops matching rather than a genuine "all sorts are total" pass.
