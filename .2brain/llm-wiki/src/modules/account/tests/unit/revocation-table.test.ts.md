---
source: src/modules/account/tests/unit/revocation-table.test.ts
sha256: 600cedba4161f441582972d144401ff1e958c342d1d332537468b1aa33dacc95
generated_at: 2026-10-15T10:15:21.420860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose

Cross-cutting invariant tests for the `REVOCATION` table. It verifies global constraints across all revocation causes that no single per-cause test would catch (e.g., "every cause that keeps the caller's session must ride the epoch in its own write").

## Key elements

- **`CAUSES`** — derived array (`Object.keys(REVOCATION)`) typed as `RevocationCause[]`; the canonical list of every cause, used to drive `it.each` loops and whole-table assertions.
- **`announces` filter test** — asserts that exactly `email-change-undo`, `logout-all`, and `password-reset` are flagged as compromise announcements.
- **`pending` filter test** — asserts that exactly `email-change-undo`, `password-change`, and `password-reset` purge pending one-time links/challenges.
- **`it.each(CAUSES)` — caller-keeps ⇒ epoch** — for any cause where `callerKeeps` is truthy, `epoch` must be `'with-write'`.
- **`it.each(CAUSES)` — caller-keeps ⇒ no announce** — for any cause where `callerKeeps` is truthy, `announce` must be `false`.
- **`modes` exclusivity test** — asserts that `refresh-reuse` is the *only* cause whose `modes` is `'jwt'` (refresh-token reuse is the sole session-mode-specific trigger).

## Relationships

- **`src/modules/account/domain/revocation.ts`** — sole import source. Pulls in the `REVOCATION` constant (the table under test), the `announces` predicate (used as a `Array.filter` callback), and the `RevocationCause` type for `CAUSES` annotation.

## Notes

- The module docblock is explicit: these tests exist for invariants that *no individual cause's test* would detect. Don't duplicate per-cause assertions here; add new cross-cause rules instead.
- `it.each(CAUSES)` cases are *conditional* — they only assert when `callerKeeps` is truthy, so adding a new cause with `callerKeeps: false` will pass vacuously.
- The `announces` import is a function, not a data flag; the test uses it as a filter predicate rather than reading `REVOCATION[cause].announce` directly in the first assertion.
