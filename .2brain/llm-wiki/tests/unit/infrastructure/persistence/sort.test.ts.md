---
source: tests/unit/infrastructure/persistence/sort.test.ts
sha256: 9db205767d330755cd1f8b0ebcbd0c335a97f5391167133da9d8c6b2617a0c69
generated_at: 2026-10-15T13:18:37.673555+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/sort.test.ts

## Purpose
Unit tests for the repository-side sort-resolution functions (`resolveSort`, `sortOf`) exported by `search.ts`. They pin down how a contract-validated token array is turned into a Mongo sort object via a per-collection whitelist, and what the function returns (or doesn't) in edge cases.

## Key elements
- **`sortable`** – shared whitelist fixture mapping wire field names to Mongo column names (e.g. `title` → `titleColumn`).
- **`describe('resolveSort')`** – nine cases covering: non-string entries are silently skipped; `"-"` prefix means descending; caller token order is preserved; `_id: -1` is always appended last for stable paging; first mention of a duplicated field wins; non-whitelisted fields are dropped; prototype-pollution tokens (`constructor`, `__proto__`, `-toString`) resolve to `undefined`; a bare string (CSV not yet split) returns `undefined`; empty/absent input returns `undefined` so the caller can fall back to its default sort.
- **`describe('sortOf')`** – two cases confirming it reads the `sort` key off a filter bag and delegates through the same whitelist, returning `undefined` when the key is missing.

## Relationships
- **`src/infrastructure/persistence/search.ts`** – the module under test; provides `resolveSort` and `sortOf`. All assertions in this file exercise those two exports directly.
- The file's header comment notes that the *transport* half of the sort grammar (`parseFormCsvList`, CSV→token splitting) lives elsewhere and is covered by `request.test.ts`; this file deliberately does **not** test CSV parsing.

## Notes
- `resolveSort` expects an **array** of tokens. Passing a raw CSV string is a contract violation and is tested to return `undefined` rather than throw—splitting is the transport layer's responsibility.
- The whitelist argument is the second parameter. Omitting it (as in the last `resolveSort` test) means no field can match, so the result is `undefined`.
- `_id: -1` is appended unconditionally by `resolveSort` when at least one whitelisted field survives; tests assert this via `toHaveProperty('_id')` and full-object equality.
