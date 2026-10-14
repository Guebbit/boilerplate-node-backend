---
source: src/modules/account/tests/unit/revocation-table.test.ts
sha256: 5d64cecdd7c0e130d049678de85bf125e02998d9bf02ec173c0fad864dbd56f9
generated_at: 2026-10-14T09:22:38.314487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose

Cross-cutting invariant tests for the `REVOCATION` table. Where individual cause tests verify one row, this file asserts table-wide structural rules (which rows announce, which are epoch-locked, which are mode-specific) that only hold when the table is viewed as a whole.

## Key elements

- **`CAUSES`** – `Object.keys(REVOCATION) as RevocationCause[]`; the full set of table entries, used to drive `it.each` loops.
- **"announces exactly the causes…"** – Filters `CAUSES` through the `announces` predicate and asserts the resulting set is exactly `['email-change-undo', 'logout-all', 'password-reset']`.
- **"a caller that keeps its session rode the epoch in its own write"** – For every cause where `callerKeeps` is true, asserts `epoch` must be `'with-write'`.
- **"a caller that keeps its session is never told it was compromised"** – For every cause where `callerKeeps` is true, asserts `announce` is `false`.
- **"limits one cause to a single session mode"** – Asserts that `'refresh-reuse'` is the only cause whose `modes` field is the literal string `'jwt'`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** – The sole dependency. Imports the `REVOCATION` table (the data under test), the `announces` helper (used as a filter predicate), and the `RevocationCause` type.

## Notes

- The file deliberately hard-codes expected cause names (`'email-change-undo'`, `'logout-all'`, `'password-reset'`, `'refresh-reuse'`) rather than re-deriving them from domain logic. Adding or renaming a cause in `revocation.ts` will break these tests *and* require updating the literal strings here.
- Tests 2 and 3 are vacuous for causes where `callerKeeps` is falsy (the `if` guard skips the assertion), so they only constrain the "caller keeps" subset of the table.
- The JSDoc header positions this as a complement to per-cause tests, not a replacement; it exists to catch invariant violations that no single-row test would surface.
