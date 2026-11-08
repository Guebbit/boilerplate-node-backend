---
source: src/modules/users/services/actions.ts
sha256: 596f2161de208604e739e8c6d4bb32ae223cbb0db2bbbf8aec7a5a0cf9f40011
generated_at: 2026-11-08T08:48:15.022127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/actions.ts

## Purpose

Computes the `User.actions` flag block for a single account from the perspective of a single caller. It encodes, at the route level, whether the caller may update, delete, ban, or toggle purchase-hold state on the target account, factoring in the caller's ability rules, the target's staff protection, and the account's current lifecycle state. This lets a client render only the controls the server will actually accept.

## Key elements

- **`ActionsSubject`** — a `Pick` of `UserWire` narrowed to the fields the flag logic reads (`id`, `active`, `deletedAt`, `purgeAt`, `purchaseHold`, `purchaseHoldFlaggedAt`). Serves as the minimal input shape.
- **`userActionsFor(user, ownerHoldsRole, caller, now?)`** — the sole runtime export. Pure: no I/O or lookups. Returns a `UserActions` object with the booleans `update`, `assignRole`, `delete`, `hardDelete`, `restore`, `setPurchaseHold`, `liftPurchaseHold`, `activate`, `deactivate`. The `now` parameter (defaults to `new Date()`) is used only to judge whether a scheduled purge has elapsed.

## Relationships

- **`src/kernel/ability.ts`** — `heldRules(caller)` resolves the caller's effective ability keys; the function then checks membership for `assign:Role`, `update:User`, `delete:User`, and `ban:User`.
- **`src/modules/access/index.ts`** / **`src/modules/access/services/protection.ts`** — `mayChangeAccount` encodes the staff-account protection rule (a caller must hold `assign:Role` to act on a staff account). The index re-exports it; the implementation lives in `protection.ts`.
- **`src/modules/users/model.ts`** — supplies the `UserWire` type from which `ActionsSubject` is derived.
- **`src/modules/users/services/purchase-hold.ts`** — `hasPurchaseHoldToClear(user)` gates the `liftPurchaseHold` flag so it is only offered when a clearable hold actually exists.
- **`src/modules/users/services/read.ts`** — the documented caller: it performs the two external lookups (owner's role, caller's keys) once per request and passes the results into `userActionsFor`.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — source of the `Caller` and `UserActions` types.
- **`src/modules/users/tests/unit/actions.test.ts`** — unit tests covering the flag matrix.

## Notes

- The function is intentionally side-effect-free so it can be called multiple times per page render (e.g., for list rows) without re-querying. The two lookups it depends on are the caller's responsibility.
- Ban-class operations (`setPurchaseHold`, `liftPurchaseHold`, `activate`, `deactivate`) all share the `ban:User` ability key; there is no separate `deactivate:User` rule.
- `restore` is suppressed when `purgeAt` has already elapsed relative to `now`—the row is waiting on the purge job, not a human.
- `active` defaults to `true` when the field is absent (`user.active ?? true`), so a missing field is treated as "account is live."
