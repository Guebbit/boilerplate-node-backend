# tests/cross-cutting/paginated-sort-is-total.test.ts

## Purpose

Cross-cutting invariant test that verifies every aggregation pipeline in `src/` which pages results (uses `$skip`) also sorts with a **total** ordering — i.e. its `$sort` spec's last key is unique (`_id`, `id`, or the known `DEFAULT_SORT` constant). Because a count query and a page query are separate round-trips, a non-total sort can duplicate or drop documents at page boundaries. The check is purely syntactic: it greps source for `$sort` stages rather than executing queries, so it also covers pipelines that don't yet exist in tests.

## Key elements

- **`UNIQUE_KEYS`** — `Set` of key names (`_id`, `id`) that guarantee a total ordering when they appear last in a sort spec.
- **`TOTAL_SORT_CONSTANTS`** — `Set` of shared sort constants (`DEFAULT_SORT`) already known to end in a unique key; used when the `$sort` value is an identifier rather than an inline literal.
- **`SORT_STAGE`** (regex) — matches `$sort:` followed by either an inline object literal (non-greedy, no nesting) or a bare identifier (a constant reference).
- **`listSourceFiles(directory)`** — recursively collects `.ts` files under `src/`, skipping any `tests/` subdirectory (fixtures and co-located unit tests are not application queries).
- **`sortKeys(literal)`** — extracts the declared key names (in order) from an inline `{…}` sort spec.
- **`isTotal(spec)`** — returns `true` if the spec is an identifier in `TOTAL_SORT_CONSTANTS`, or if its last inline key is in `UNIQUE_KEYS`.
- **`pagedSortStages()`** — the main scan: for every source file containing `$skip`, returns each `$sort` stage with a relative file path and a whitespace-collapsed spec string.
- **Test: "finds no pipeline paging through a sort that can tie"** — asserts the filtered list of non-total stages is empty.
- **Test: "actually finds the pipelines it claims to scan" (canary)** — asserts at least 2 paged sort stages are discovered, guarding against a silent regex regression that would make the first test vacuously pass.

## Relationships

No graph neighbors are recorded for this file. It is self-contained: it reads only the filesystem (`node:fs`, `node:path`) and the Jest/Vitest globals.

## Notes

- The regex for inline sort objects deliberately uses `{[^{}]*}` (non-greedy, no nesting) because MongoDB sort specs are flat key–direction pairs; a nested object would be invalid syntax.
- The test only inspects files that contain `$skip`. A `$sort` in a non-paged query is irrelevant to the invariant and is intentionally ignored.
- `spec` strings are collapsed (`\s+` → single space) purely so a failure message like `expected [{ createdAt: -1 }]` fits on one line in the diff output.
- The file is intentionally narrow and syntactic: it does **not** import the application, spin up a database, or evaluate the pipeline. It asserts a property of the *source text* so that it constrains future code automatically.
