---
source: src/modules/account/tests/unit/revocation-table.test.ts
source_sha256: a73997e930eba71048a8a67ddd98b480c019c3f695179ce666a302f5b2d1f5ba
context_sha256: ac75aea49d857e6de104652628d497ec6bae64ccbc5945a6dec77a8cbcd32a4d
generated_at: 2026-11-22T04:07:55.761257+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose
Unit tests asserting cross-cutting invariants of the `REVOCATION` table, which maps each `RevocationCause` to its revocation behavior. These checks catch breakage that no single cause's own test would notice, such as a flag changing on one row that violates a rule shared by many rows.

## Key elements
- `CAUSES`: all keys of `REVOCATION`, cast to `RevocationCause[]`. Every test iterates over it.
- **Announce set**: the causes for which `announces(cause)` is true must be exactly `email-change-undo`, `logout-all` and `password-reset`. These are the causes a subscriber must treat as a compromise.
- **Pending purge set**: the causes with `pending` set must be exactly `deactivation`, `deletion-scheduled`, `email-change-undo`, `password-change` and `password-reset`. These are the credential changes that purge pending one-time links and challenges.
- **Caller-keeps epoch rule**: every cause with `callerKeeps` must have `epoch === 'with-write'`, so the caller's session rides the epoch in its own write.
- **Caller-keeps announce rule**: no cause with `callerKeeps` may have `announce` set, so a caller that keeps its session is never told it was compromised.
- **Mode restriction**: the only cause with `modes === 'jwt'` is `refresh-reuse`, since refresh-token reuse exists only in `jwt` mode.

## Relationships
Imports `REVOCATION`, `announces` and the `RevocationCause` type from `src/modules/account/domain/revocation.ts`. That module is the only code under test. The tests read the table's fields (`pending`, `callerKeeps`, `epoch`, `announce`, `modes`) and call `announces`.

## Notes
- The expected lists are hard-coded and compared after `toSorted()`. Adding a cause that should announce or purge pending items means updating the expected arrays here.
- The caller-keeps tests compare against `[]`, so a failure prints the offending causes.
- The announce set is checked through the `announces` function. The caller-keeps rule is checked against the raw `announce` field.
