---
source: src/modules/users/services/index.ts
sha256: 2c9c75fa7bb717a3b457e9d5c032f3e9974bd0ce519e581950110c484d08ebe5
generated_at: 2026-11-14T22:28:22.289506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/index.ts

## Purpose

Barrel module that aggregates the User document's admin-facing CRUD, search, role management, and purchase-hold operations into a single `userService` object. It exists so controllers and sibling modules have one stable import point rather than reaching into individual sub-module files. Deliberately excludes authentication, registration, verification, 2FA, and erasure flows, which belong to the `account` module behind `../friends/account.ts`.

## Key elements

- **`userService`** — the sole public surface object. Controllers call through this; they never import the bare sub-module functions. Includes `search`, `getById`, `create`, `updateById`, `activate`, `deactivate`, `removeById`, `restoreById`, `assignUserRole`, `revokeUserRole`, the five `purchaseHold*` functions, `findAuthenticatableById`, `touchApiKeyUse`, and the presenter helpers `toAccount`, `toUserContract`, `toUserListItems`.
- **Re-exported types** — `TwoFactorSecretRing`, `ActivePurchaseHold`, `StaffContact` for consumers that only need the shape.
- **Re-exported predicates / helpers** — `isAuthenticatable`, `isRestorable`, `personalDataSubjectOf`, `privacyFrontendLink` (GDPR Art. 14(3)(b) link used by `account`'s setup mail).
- **Sub-module imports** (not re-exported individually): `./read`, `./activation`, `./create`, `./update`, `./role`, `./remove`, `./purchase-hold`, `./lookups`, `./credentials`, `../presenter`.

## Relationships

- **`src/modules/orders/services/purchase-hold.ts`** — Consumes the `purchaseHold*` exports to set, lift, flag, and query holds during order processing.
- **`src/modules/orders/services/crud.ts`** / **`src/modules/orders/services/notify.ts`** — Read user data via `getById` / presenter helpers when composing order operations and notifications.
- **`src/modules/cart/services/checkout.ts`** — Checks purchase-hold state and user authenticatability during checkout validation.
- **`src/modules/api-keys/services/api-keys.ts`** / **`src/modules/api-keys/services/resolver.ts`** — Call through `userService` for user-credential bookkeeping during API-key operations.
- **`src/modules/notifications/services/staff.ts`** — Consumes `staffContacts` to resolve recipients for staff-facing notifications.
- **`src/modules/example/services/notify.ts`** / **`src/modules/example/services/owner.ts`** — Sibling example flows that read user data through the service surface.
- **Integration tests** (`account/tests/…`, `api-keys/tests/…`, `cart/tests/…`, `delivery/tests/…`) — Exercise the service surface through `userService` rather than reaching into sub-files, confirming the barrel is the contract.

## Notes

- The barrel intentionally does **not** re-export presenter functions as named top-level exports; a sibling that needs to shape an account for a response goes through `userService.toAccount` (which is `presentAccount` under the hood).
- Role mutations (`assignUserRole`, `revokeUserRole`) are the "role door" and enforce the grant at the document level; the broader permission check happens in `updateById` / `activate` / `deactivate` / `removeById`, which load by id and ask the staff-role question first.
- One-file-per-flow convention (see `docs/theory/layers.md`): each sub-module (`./create`, `./update`, etc.) handles a single operation. This index file adds no logic of its own beyond re-export and object assembly.
