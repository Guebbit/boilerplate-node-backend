---
source: src/modules/account/tests/unit/revocation-table.test.ts
sha256: a73997e930eba71048a8a67ddd98b480c019c3f695179ce666a302f5b2d1f5ba
generated_at: 2026-11-14T19:16:07.031965+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose

Cross-cutting invariant tests for the `REVOCATION` table. Each test asserts a relationship *between* fields across causes (e.g., "every `callerKeeps` cause must also have `epoch: 'with-write'`") that a per-cause test would not catch. The file exists so that adding or editing a cause in the domain table is immediately checked against these structural guarantees.

## Key elements

- **`CAUSES`** — `Object.keys(REVOCATION) as RevocationCause[]`; the full set of causes, used as the iteration domain for every filter.
- **`announces`** — imported predicate; used to select causes that must be surfaced to subscribers as a compromise.
- **Five `it` blocks** (inside `describe('the revocation table', …)`):
  - *announce set* — the `announces`-filtered causes equal exactly `['email-change-undo', 'logout-all', 'password-reset']`.
  - *pending-purge set* — causes with `REVOCATION[cause].pending` equal the five credential-change causes.
  - *callerKeeps ⇒ epoch* — every `callerKeeps` cause must have `epoch === 'with-write'`.
  - *callerKeeps ⇒ ¬announce* — a cause that keeps the caller's session must never also be marked `announce`.
  - *modes exclusivity* — only `refresh-reuse` has `modes === 'jwt'`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — sole dependency. Provides the `REVOCATION` table (the data under test), the `announces` predicate, and the `RevocationCause` type. The test file is read-only with respect to this module; it never mutates or extends the table.

## Notes

- The tests intentionally use `.toSorted()` on filtered arrays before comparing, so the assertion is independent of key insertion order in `REVOCATION`.
- The `callerKeeps` / `announce` / `epoch` tests are *implication* checks (if A then B), not equality checks on the full set. Adding a new cause that violates the implication will fail the suite even if its individual field values are internally consistent.
- The module JSDoc (`@module`) signals that this file is a namespace-level test with no exported symbols.
