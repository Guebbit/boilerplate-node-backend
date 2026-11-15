---
source: src/modules/users/tests/unit/actions.test.ts
sha256: 81494b53c167c04afb188fe5d042f865ff91b3158e64fcc77e8204f697f7eb09
generated_at: 2026-11-14T22:39:52.355943+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/actions.test.ts

## Purpose

Unit-test table for `userActionsFor`: every combination of caller role and account state is pinned to the exact set of permission flags it must return. The file's header positions it as the pure, in-process counterpart to the users contract suite (which exercises the same matrix over real routes).

## Key elements

- **`liveAccount`** – minimal `ActionsSubject` fixture (`{ id: 'owner' }`) representing a live, active, unheld account.
- **`holdInForce`** – a `purchaseHold` object with a far-future `until`, a `'staff'` reason, and a `setAt` timestamp; used to exercise hold-related flags.
- **`callerOf(role, id?)`** – wraps `callerContextAs` to produce a `request.caller`-shaped object for the named role.
- **`describe` "the keys"** – verifies which flags each role (moderator, support, admin) unlocks on a live account, including the `assign:Role` / `revoke:Role` gating and the tenant-vs-platform role distinction.
- **`describe` "the protection of staff accounts"** – asserts all-flags-false when the target is staff and the caller lacks manage rights; confirms no self-privilege shortcut.
- **`describe` "the account's state"** – covers `restore` (bounded by `purgeAt`), soft-delete vs. hard-delete, `activate`/`deactivate` toggling, default-when-`active`-missing, and `liftPurchaseHold` triggered by either a hold or a review flag (`it.each`).

## Relationships

- **`src/modules/users/services/actions.ts`** – the system under test. The file imports `userActionsFor` and the `ActionsSubject` type from here.
- **`tests/support/callers.ts`** – provides `callerContextAs`, used by the local `callerOf` helper to build role-scoped caller fixtures.

## Notes

- The fifth argument to `userActionsFor` (a `now` date) is optional; the restore-window test passes it explicitly to control the `purgeAt` comparison without mocking the clock.
- A missing `active` property on the subject is treated as *active* — the "reads a missing `active` as active" test locks this in.
- `revokeRole` is gated on `hasTenantRole` (second boolean arg), not merely `hasAnyRole`; the test explicitly asserts a platform-only role (`true, false`) does **not** enable revoke.
- `placePurchaseHold` remains `true` even when a hold already exists (intended to allow extension); this is non-obvious and pinned by a dedicated test.
