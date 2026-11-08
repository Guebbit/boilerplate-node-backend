---
source: tests/unit/infrastructure/persistence/sort.test.ts
sha256: 763f8018c05f303d44bcdaa40e2adce60051e8e552efd736976e85d09813b3ac
generated_at: 2026-11-08T10:22:44.845763+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/sort.test.ts

## Purpose

Unit tests for the repository-side sort resolution logic exported by `@infrastructure/persistence/search`. Covers `resolveSort`, `sortOf`, and `withTiebreaker`—the path from a contract-validated token array (e.g. `['-price','title']`) to a concrete Mongo sort object, including whitelist enforcement, tiebreaker guarantees, and prototype-safety.

## Key elements

- **`withTiebreaker`** – Appends `_id: -1` to a sort object when `_id` is absent; leaves the object untouched (including direction) when `_id` is already a key.
- **`resolveSort(tokens, sortable)`** – Core function under test. Maps wire-field tokens to column names via the `sortable` whitelist, applies ascending/descending (`-` prefix), preserves caller order, lets the first mention of a field win, drops non-whitelist tokens, ignores non-string entries, and always closes the sort on `_id`. Returns `undefined` when nothing survives (no tokens, no whitelist, or all tokens rejected), signalling the caller to fall back to a default.
- **`sortOf(filterBag, sortable)`** – Thin adapter that pulls the `sort` array off a filter-bag object and delegates to `resolveSort`. Returns `undefined` when the bag has no `sort` key.

## Relationships

- **`src/infrastructure/persistence/search.ts`** – Sole import target. All three tested functions (`resolveSort`, `sortOf`, `withTiebreaker`) are imported from this module. The test file exercises them in isolation with a small local `sortable` whitelist; no other files are imported.

## Notes

- The file's doc header explicitly scopes out the transport half (`parseFormCsvList`, CSV-in-query parsing), which lives in `request.test.ts`. A bare CSV string like `'-price,title'` is expected to yield `undefined` here because splitting is the transport's responsibility.
- Prototype-chain tokens (`constructor`, `__proto__`, `toString`) are verified to resolve to `undefined`, not to accidentally pick up inherited properties from the whitelist object.
- The `sortable` whitelist is a plain local constant (`{ price: 'price', title: 'titleColumn', createdAt: 'createdAt' }`); the `title → titleColumn` rename is the one non-trivial mapping the tests exercise.
