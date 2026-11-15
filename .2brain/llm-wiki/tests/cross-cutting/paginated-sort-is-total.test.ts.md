---
source: tests/cross-cutting/paginated-sort-is-total.test.ts
sha256: f556f02125cdb2b161c2cce571d209bc736a47f3722b4ee77fe012f2ea6250cc
generated_at: 2026-11-14T23:05:35.024138+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

Guard test that enforces a single invariant across the entire `src/` tree: any aggregation pipeline that pages (`$skip`) must sort by a **total** order — i.e. its last sort key is unique (`_id` or `id`). Without this, the separate count and page queries can disagree on tie order, causing documents to appear on two pages or be skipped by both. The check is purely syntactic (regex over source) so it covers pipelines nobody has written yet, not just the ones currently exercised.

## Key elements

- **`SORT_STAGE`** (regex) – matches every `$sort:` occurrence, capturing either an inline `{…}` literal or an identifier (optionally with a `?? fallback`).
- **`sortKeys(literal)`** – extracts key names from an inline sort spec in declaration order.
- **`isTotal(spec)`** – determines whether a spec is total: the final key is in `UNIQUE_KEYS`, the spec is a known `TOTAL_SORT_CONSTANTS` name, or (for `a ?? b` expressions) the *fallback* side is itself total.
- **`pagedSortStages()`** – walks `src/`, reads every `.ts` file that contains `$skip`, and returns all its `$sort` stages with a repo-relative path.
- **`listSourceFiles(dir)`** – recursive `.ts` collector; skips `src/**/tests/` directories (module tests and fixtures are not application queries).
- **`UNIQUE_KEYS`** – `{'_id', 'id'}`; the keys that make a sort total.
- **`TOTAL_SORT_CONSTANTS`** – `{'DEFAULT_SORT'}`; the repo's published sort constant, already guaranteed to end in `_id`.
- **Test: "finds no pipeline paging through a sort that can tie"** – asserts the filtered (non-total) set is empty.
- **Test: "actually finds the pipelines it claims to scan"** (canary) – asserts `pagedSortStages().length > 0` is equivalent to `isDeployed('orders')`, so an empty result means "all total," never "the regex stopped matching."

## Relationships

- **`tests/support/paths.ts`** – imports `REPO_ROOT` (to locate `src/`) and `isDeployed` (to gate the canary test on whether the `orders` service, the one repository that pages through an aggregation pipeline, is present in the deployment).

## Notes

- The scanner is **deliberately syntactic**: it reads `$sort` stage declarations rather than driving a database. A plain `find().sort().skip()` chain (e.g. `inventory`'s stock board) is *not* matched by `SORT_STAGE` by design; only aggregation-pipeline `$sort` stages are in scope.
- `??` fallbacks are handled by recursing into the right-hand side; the left side (a caller's `resolveSort`) is assumed to already close on `_id`.
- The inline-literal capture uses a non-greedy match to the first `}` because MongoDB sort specs cannot nest objects.
- The canary test is deployment-aware: when `orders` is absent, an empty scan result is legitimate and the assertion passes.
