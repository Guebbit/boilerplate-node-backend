---
source: src/modules/addresses/service.ts
sha256: 8dbe37e6784ef45aa44fbb38e8b612a04b2e709f037dfda2d01b6f2038e19616
generated_at: 2026-09-23T18:21:29.186114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/service.ts

## Purpose

Service layer for the address book. It translates user-facing operations (get, add, update, remove, checkout lookup, account deletion) into repository calls and returns wire-ready views. The module owns a single collection per user; the invariant "exactly one default" is a property of the whole list and is enforced by the repository, not here.

## Key elements

- **`AddressesView`** – exported interface matching the OpenAPI `AddressesResponse` shape: `{ addresses: Address[] }`.
- **`toAddress` / `toView`** – internal mappers. `toAddress` converts a stored `AddressItem` to the contract's `Address` (renames `_id` → `id`, omits optional fields rather than emitting `undefined`). `toView` maps a whole document (or `null`) to `AddressesView`.
- **`addressesGet(userId)`** – returns `AddressesView`. A missing or empty book both resolve to `{ addresses: [] }`; never a 404.
- **`addressAdd(userId, entry)`** – delegates to `repository.addEntry`; on success wraps the view in a `200` response with a localized message.
- **`addressUpdate(userId, addressId, changes)`** – delegates to `repository.updateEntry`; a `null` result (not found / not owned) yields a `404` reject.
- **`addressRemove(userId, addressId)`** – delegates to `repository.removeEntry`; same 404-on-missing semantics as update.
- **`addressForCheckout(userId, addressId?)`** – resolves the shipping address for the cart module. If `addressId` is provided, returns the matching `AddressItem` or `null` (stale/foreign id). If omitted, returns the default `AddressItem` or `undefined` (no addresses at all). The `null` vs `undefined` distinction is intentional: checkout must *refuse* on `null`, *proceed without a default* on `undefined`.
- **`addressesDeleteByUserId(userId)`** – hard-delete hook called on account removal; forwards to the repository.

## Relationships

- **`./repository`** – sole data-access dependency; all persistence and the one-default invariant live there.
- **`./model`** – provides `AddressBookDocument` and `AddressItem` types used in mapping.
- **`./index.ts` / `./module.ts`** – re-export these functions for DI; `module.ts` wires `addressesDeleteByUserId` into the account-deletion lifecycle.
- **`./controllers/get-addresses.ts`, `write-addresses.ts`, `delete-address.ts`** – thin HTTP handlers that call `addressesGet`, `addressAdd`/`addressUpdate`, and `addressRemove` respectively.
- **`../cart/services/checkout.ts`** – calls `addressForCheckout` to determine the shipping destination before completing an order.
- **`@infrastructure/http/response`** – supplies `generateSuccess` / `generateReject` for uniform response envelopes.
- **`@infrastructure/i18n`** – provides the `t()` function for localized success/error messages.
- **`@types`** – source of the shared `Address`, `AddressInput`, `UpdateAddressRequest` contracts.
- **`./tests/integration/addresses.test.ts`** – end-to-end tests exercising every exported function through the HTTP layer.

## Notes

- GET never returns 404. A user with zero addresses and a user who has never created a book are indistinguishable to the caller; both yield `{ addresses: [] }`.
- `addressForCheckout` returns a **three-state** value (`AddressItem | null | undefined`). Do not collapse `null` into `undefined` — `null` signals an invalid reference that must abort checkout, while `undefined` means "no preference, ship to default (of which there is none)."
- Optional fields (`label`, `phone`) are conditionally spread in `toAddress` so the serialized JSON omits them entirely rather than including `null`/`undefined` keys.
- The service contains no transactional or locking logic; concurrency on the one-default slot is the repository's concern.
