---
source: src/modules/users/tests/unit/actions.test.ts
sha256: 7b0c79ff553f0dcbb4c69b646fe2a84b46209b8e7af528a7a0f04e463240d042
generated_at: 2026-11-08T08:58:18.185964+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/actions.test.ts

## Purpose

Unit-tests `userActionsFor` as a pure decision table: given a caller role and an account state, which action flags are returned. Each test cell names the exact key or account field that drives the flag, making the permission contract explicit without hitting real routes (that coverage lives in the users contract suite).

## Key elements

- **`liveAccount`** – Minimal `ActionsSubject` (`{ id: 'owner' }`) representing a live, active, unheld account; the baseline row for most tests.
- **`holdInForce`** – A purchase-hold object with a far-future `until`, used to exercise hold-related flags.
- **`callerOf(role, id?)`** – Wraps `callerContextAs` to produce a `request.caller` for a given staff role; `id` defaults to `'caller'`.
- **`describe('userActionsFor — the keys')`** – Verifies the role→key matrix: moderator gets most flags except `assignRole`; support gets only `update`; admin adds `assignRole`; no rule blocks self-role-assignment.
- **`describe('userActionsFor — the protection of staff accounts')`** – Confirms a staff account returns all-false for a caller who cannot manage it, and that self-management is judged by keys alone.
- **`describe('userActionsFor — the account's state')`** – Covers state-dependent flags: `restore` window vs. `purgeAt`, deleted accounts, deactivated accounts, missing `active` field, `liftPurchaseHold` on a hold or flag, and `setPurchaseHold` still available while held (to extend).

## Relationships

- **`src/modules/users/services/actions.ts`** – Source under test. Imports `userActionsFor` (the pure function) and the `ActionsSubject` type.
- **`tests/support/callers.ts`** – Provides `callerContextAs`, the shared helper that fabricates a caller context for a given role, keeping role-identity logic out of this file.

## Notes

- The file intentionally avoids network or database setup; every test is synchronous and deterministic (dates are fixed).
- `userActionsFor` accepts an optional fourth `now` parameter (a `Date`) for time-sensitive checks (e.g., `purgeAt` window). Most calls omit it, relying on the default.
- The `it.each` block treats a purchase hold and a review flag as equivalent triggers for `liftPurchaseHold`; the assertion only checks that flag, not the others.
- Conventions: test names use the em-dash " — " to separate the function name from the sub-topic; role names are lowercase strings matching the permission-key namespace (e.g., `'support'`, `'moderator'`, `'admin'`).
