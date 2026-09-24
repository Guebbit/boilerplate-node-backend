---
source: tests/cross-cutting/paginated-sort-is-total.test.ts
sha256: 00de1e6d5a7013c81e41676bf5d916019d106a0d8824f16e8912b8a587931722
generated_at: 2026-09-23T19:58:15.359726+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

Cross-cutting guard that asserts every `$sort` stage in a paginated (i.e. `$skip`-using) pipeline ends with a unique key (`_id` or `id`). Without a total order, MongoDB's non-deterministic tie-breaking between the count query and the page query can duplicate or skip documents across pages. The test is deliberately syntactic (regex over source) rather than integration-based, so it also catches pipelines that don't exist yet.

## Key elements

- **`UNIQUE_KEYS`** – `Set(['_id', 'id'])`; the keys that make a sort total.
- **`TOTAL_SORT_CONSTANTS`** – `Set(['DEFAULT_SORT'])`; named sort constants the repo publishes that are already known to end in a unique key.
- **`listSourceFiles(dir)`** – Recursively collects `.ts` files under `src/`, skipping any `tests/` subdirectory (module-local tests and fixture pipelines are excluded by design).
- **`SORT_STAGE`** – Regex matching `$sort:` followed by either an inline object literal or an identifier (shared constant).
- **`sortKeys(literal)`** – Extracts key names from an inline `{…}` sort spec in declaration order.
- **`isTotal(spec)`** – Returns `true` if the spec is a known total constant or if the last key in an inline literal is in `UNIQUE_KEYS`.
- **`pagedSortStages()`** – Scans all source files that contain `$skip`, collects every `$sort` stage found, and returns `{ file, spec }` pairs.
- **`describe('every paged $sort is total')`** – Two assertions: (1) no non-total paged sort exists; (2) the scan finds ≥ 1 pipeline (canary to detect a silent regex regression, analogous to the audit-sweep pattern).

## Relationships

- **`src/modules/account/tests/unit/two-factor.test.ts`** – Lives under a `tests/` subdirectory within `src/`, which `listSourceFiles` explicitly skips. The graph edge reflects that this guard's exclusion rule governs whether files at that path (and similar module-local tests) fall inside or outside the scan. No code is imported between them.

## Notes

- The regex is intentionally narrow: it matches `$sort` inside aggregation pipelines only. A plain `find().sort().skip()` chain (e.g. the inventory stock board) is **not** captured, and that is documented as acceptable.
- The `tests/` skip in `listSourceFiles` means fixture pipelines and module-unit tests are never scanned; this is deliberate, not an oversight.
- The canary assertion (`≥ 1`) exists because an empty result from the regex would silently pass the first test while actually matching nothing. The `orders` repository is cited as the current pipeline that satisfies this.
- `spec` values are whitespace-collapsed (`replaceAll(/\s+/g, ' ')`) purely for readable failure output.
