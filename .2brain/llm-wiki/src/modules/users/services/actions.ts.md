---
source: src/modules/users/services/actions.ts
sha256: e46c99de16f0a267e5add06f3d7b1411a84f72c8cabd17e4f61a13dbf42b6e32
generated_at: 2026-11-14T22:25:53.480149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/actions.ts

## Purpose

Computes the `User.actions` boolean block for a single account — the set of operations a given caller is permitted to perform against that account. It exists so that a client can render only the actions the server will actually accept, keeping the UI and the authorization boundary in lockstep. The function is pure: all external lookups (staff-role check, caller's rule set) are performed by the caller and passed in as plain values.

## Key elements

- **`ActionsSubject`** — a `Pick` of `UserWire` containing only the fields the action flags depend on (`id`, `active`, `deletedAt`, `purgeAt`, `purchaseHold`, `purchaseHoldFlaggedAt`). Lets callers pass a minimal slice instead of the full wire type.
- **`userActionsFor`** (exported const) — the sole logic entry point. Accepts an `ActionsSubject`, two booleans pre-resolved by the caller (`ownerHoldsRole`, `ownerHoldsTenantRole`), the `Caller` object, and an injectable `now` (defaulting to `new Date()` for the purge-window check). Returns a `UserActions` object with flags: `update`, `assignRole`, `revokeRole`, `delete`, `hardDelete`, `restore`, `placePurchaseHold`, `liftPurchaseHold`, `activate`, `deactivate`.

## Relationships

- **`src/kernel/ability.ts`** — imports `heldRules` to resolve the caller's held rule set into a `Set<string>` checked via `.has(...)`.
- **`src/modules/access/domain/protection.ts`** / **`src/modules/access/index.ts`** — imports `mayChangeAccount` (re-exported through the access index) to gate staff-account protection; the function's `reachable` result drives every `update:*` / `delete:*` / `ban:*` flag.
- **`src/modules/users/model.ts`** — imports `UserWire` to define `ActionsSubject`.
- **`src/modules/users/services/purchase-hold.ts`** — imports `hasPurchaseHoldToClear` to decide whether `liftPurchaseHold` is surfaced.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — imports `Caller` and `UserActions` types used in the signature and return value.
- **`src/modules/users/services/read.ts`** — upstream consumer; performs the staff-role and caller-key lookups once per request/page, then delegates to `userActionsFor`.
- **`src/modules/users/tests/unit/actions.test.ts`** — unit-test coverage for the flag logic.

## Notes

- **Ban-class flags are unified.** `placePurchaseHold`, `liftPurchaseHold`, `activate`, and `deactivate` all key off `ban:User` rather than a distinct rule; an inactive account *is* a ban. Support does not hold `ban:User` separately.
- **`assignRole` vs. `revokeRole`.** `assignRole` is the permission *grant* (anyone holding `assign:Role` passes staff protection); `revokeRole` additionally requires the target to hold a tenant-level role (`ownerHoldsTenantRole`).
- **Restore window.** `restore` is suppressed once `purgeAt` has elapsed relative to `now` — the row is then awaiting the purge job with no rollback path.
- **No I/O inside the function.** The two lookups (staff role, caller keys) must be resolved by the caller; this keeps `userActionsFor` trivially testable and safe to call multiple times per page.
