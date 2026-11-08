---
source: tests/cross-cutting/paginated-sort-is-total.test.ts
sha256: a6accbcf88e397814cbdd367e8880c49765b44a43b3f3ff6f637f14ac0f1bfb8
generated_at: 2026-11-08T09:29:15.612218+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

A cross-cutting, syntax-level guard that scans every source file for `$sort` stages co-occurring with `$skip` and asserts the sort is *total* (its last key is unique). It exists because MongoDB gives no ordering guarantee among equal sort keys, and a paged read (separate count + page queries) will duplicate or drop documents when the tie order shifts between them. The check is deliberately regex-based rather than DB-driven so it covers every pipeline in the tree, including future ones.

## Key elements

- **`listSourceFiles`** – Recursively walks `src/` collecting `.ts` files; skips `tests/` subdirectories (fixture pipelines are not live queries).
- **`SORT_STAGE`** (regex) – Matches `$sort:` followed by either an inline object literal `{...}` or an identifier (optionally with a `??` fallback).
- **`sortKeys`** – Extracts declared key names from an inline sort literal, preserving order.
- **`isTotal(spec)`** – Returns `true` if the spec's final key is in `{_id, id}`, if it references a known `TOTAL_SORT_CONSTANTS` entry, or if its `??` fallback resolves to one of those.
- **`pagedSortStages()`** – Filters `listSourceFiles` results to files containing `$skip`, then extracts every `$sort` stage with a collapsed one-line spec for readable failure messages.
- **`describe('every paged $sort is total')`** – Two tests: (1) no paged sort may be non-total; (2) a canary asserting the scan actually finds ≥ 1 pipeline when `orders` is deployed, guarding against silent regex drift.

## Relationships

- **`tests/support/paths.ts`** – Imports `REPO_ROOT` (to locate the `src/` tree) and `isDeployed` (to gate the canary on the `orders` repo being present in the checkout).

## Notes

- The regex is intentionally narrow: it matches the `$sort` *operator* syntax only. A `find().sort().skip()` chain (e.g., `inventory`'s stock board) is invisible to this test by design; the module docblock calls this out.
- Inline sort specs are assumed to be flat (no nested objects), so the non-greedy `{[^{}]*}` match is exact.
- `UNIQUE_KEYS` is `{_id, id}`. A model could extend this set if it introduces its own unique-indexed field.
- The canary test is conditional on `isDeployed('orders')`; in a monorepo checkout lacking that service, only the universal "all total" assertion runs.
