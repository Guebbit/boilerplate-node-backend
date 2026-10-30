---
source: src/modules/users/tests/unit/actions.test.ts
sha256: 7b0c79ff553f0dcbb4c69b646fe2a84b46209b8e7af528a7a0f04e463240d042
generated_at: 2026-10-29T06:23:46.557852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/actions.test.ts

## Purpose

Unit tests for `userActionsFor`, the pure permission-resolver that maps (caller role, account state) → a boolean action-flag object. Each test pins one cell of that table in isolation, without HTTP routes or a database. The module docstring positions this file as the "pure table" complement to a separate users contract suite that exercises the same logic over real routes.

## Key elements

- **`liveAccount`** — minimal `ActionsSubject` (`{ id: 'owner' }`) representing a live, active account with no hold.
- **`holdInForce`** — a fixed `purchaseHold` object (far-future `until`, `reason: 'staff'`) reused across hold-related assertions.
- **`callerOf(role, id?)`** — thin wrapper around `callerContextAs` that returns the `caller` field, letting tests declare "act as this role."
- **`describe('userActionsFor — the keys')`** — verifies role-based flag grants (moderator, support, admin) and the self-assignment edge case.
- **`describe('userActionsFor — the protection of staff accounts')`** — confirms staff accounts return all-false to non-managing callers, and that self-targeting is judged purely by the caller's keys.
- **`describe('userActionsFor — the account's state')`** — covers time-sensitive (`purgeAt`), `deletedAt`, `active`, `purchaseHold`, and `purchaseHoldFlaggedAt` variants, including an `it.each` pair for the two hold/flag shapes.

## Relationships

- **`src/modules/users/services/actions.ts`** — the system under test; this file imports `userActionsFor` (the function under test) and the `ActionsSubject` type.
- **`tests/support/callers.ts`** — provides `callerContextAs`, which the `callerOf` helper wraps to fabricate caller identities for each role scenario.

## Notes

- All dates are hard-coded absolute timestamps (2026, 2099) rather than relative offsets, so the test suite is fully deterministic and independent of the wall clock at run time.
- `userActionsFor` accepts an optional fourth `now` parameter (used in the `purgeAt` tests); when omitted the implementation presumably uses `Date.now()`.
- The `it.each` for hold/flag uses the `_what` parameter name (leading underscore) because the label string is only for human-readable output, not logic.
- Missing `active` field is treated as `true` (active) — the test "reads a missing `active` as active" makes this convention explicit.
