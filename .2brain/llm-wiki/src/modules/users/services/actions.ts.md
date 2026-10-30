---
source: src/modules/users/services/actions.ts
sha256: 596f2161de208604e739e8c6d4bb32ae223cbb0db2bbbf8aec7a5a0cf9f40011
generated_at: 2026-10-29T06:15:05.889564+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/actions.ts

## Purpose

Computes the `User.actions` block — a set of boolean flags telling a client exactly which operations a given caller may perform on a given account. By folding route-level rules (`heldRules`), staff-account protection (`mayChangeAccount`), and the account's own state into one pure calculation, the UI never offers a move the server would refuse.

## Key elements

- **`ActionsSubject`** — a `Pick` of `UserWire` narrowing to the six fields the action flags actually read (`id`, `active`, `deletedAt`, `purgeAt`, `purchaseHold`, `purchaseHoldFlaggedAt`). Lets callers pass a lightweight projection instead of the full wire object.
- **`userActionsFor`** (exported const) — the sole exported function. Accepts an `ActionsSubject`, a pre-resolved `ownerHoldsRole` boolean, the `Caller`, and an optional `now` timestamp. Returns a `UserActions` object with these flags:
  - `update`, `assignRole` — require `reachable` + `update:User` (and `assign:Role` for the latter).
  - `delete`, `hardDelete` — require `reachable` + `delete:User`; `delete` is additionally suppressed if the row is already soft-deleted.
  - `restore` — requires `delete:User`, the row to be deleted, and `purgeAt` (if set) to be in the future.
  - `setPurchaseHold`, `liftPurchaseHold` — ride on `ban:User`; lift additionally requires `hasPurchaseHoldToClear`.
  - `activate`, `deactivate` — ride on `ban:User`; mutually exclusive based on current `active` state.

## Relationships

- **`@kernel/ability`** — imports `heldRules` to translate the caller's raw permissions into a `Set<string>` of held rule keys.
- **`@modules/access`** (re-exported via `@modules/access/index.ts`) — imports `mayChangeAccount` to enforce protection of staff accounts before any other flag is considered.
- **`@types`** (`src/types/index.ts`) — imports `Caller` and `UserActions` (the shape of the returned block).
- **`../model`** — imports the `UserWire` type; `ActionsSubject` is a structural subset of it.
- **`./purchase-hold`** — imports `hasPurchaseHoldToClear` to gate the `liftPurchaseHold` flag on whether there is actually something to lift.
- **`../tests/unit/actions.test.ts`** — unit-test suite exercising the flag logic.

## Notes

- **Pure / no I/O.** The two lookups the function *would* need (staff-role check, caller's held rules) are performed by the caller and passed in. This keeps the function trivially testable and reusable across server routes and any server-side rendering pass.
- **`active` defaults to `true`.** `user.active ?? true` means a missing field is treated as "account is active", so `deactivate` is offered and `activate` is not.
- **All ban-class flags share one permission key.** `setPurchaseHold`, `liftPurchaseHold`, `activate`, and `deactivate` all require `ban:User`; there is no separate `purchaseHold` or `lifecycle` key.
- **`now` parameter** (defaults to `new Date()`) exists so tests can pin the clock when asserting the `restore` vs. purge boundary.
- **`assignRole` implies `update`.** It is `mayUpdate && holdsAssignRole`, so a caller without `update:User` can never get `assignRole` even if they hold `assign:Role`.
