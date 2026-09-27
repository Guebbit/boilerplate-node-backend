---
source: src/modules/addresses/service.ts
sha256: 2f3832a9f18be597ae7f73173b48f8525081af4cd748ae9bc118b257b20b7018
generated_at: 2026-09-27T14:39:55.818108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/service.ts

## Purpose

Service layer for the address book. It translates controller intents into repository calls, maps stored documents to the public `AddressesView` wire format, and wraps results in standardized success/reject responses. All endpoints answer the whole book (never a single entry) because the "exactly one default" invariant is a property of the list.

## Key elements

- **`AddressesView`** — exported interface; the wire contract `{ addresses: Address[] }` matching `openapi.yaml`.
- **`toAddress` / `toView`** — internal mappers. Convert `_id → id`, omit `label`/`phone` keys when undefined (not set to `undefined`). `toView` treats `null` book the same as empty items.
- **`addressesGet(userId)`** — returns the full book as a view. Absence and emptiness are identical: `{ addresses: [] }`, never a 404.
- **`addressAdd(userId, entry)`** — delegates to `addressBookRepository.addEntry`; returns 200 with the updated book.
- **`addressUpdate(userId, addressId, changes)`** — updates one entry; 404 + localized message if the id isn't in the caller's book.
- **`addressRemove(userId, addressId)`** — removes one entry; same 404 semantics. Repository is responsible for maintaining the one-default invariant.
- **`addressForCheckout(userId, addressId?)`** — resolves the shipping address for checkout. Returns `AddressItem | null | undefined` (see Notes).
- **`addressesDeleteByUserId(userId, session)`** — hard-delete hook (DDD-D6 `personalData.erase`); joins the caller's Mongoose transaction via the `ClientSession` parameter.

## Relationships

- **`repository.ts`** — sole data-access dependency; every function calls a method on `addressBookRepository`.
- **`model.ts`** — imports `AddressBookDocument` and `AddressItem` types used in mapping and checkout resolution.
- **`@infrastructure/http/response`** — imports `generateSuccess`, `generateReject`, and the two response union types for all write operations.
- **`@infrastructure/i18n`** — imports `t` for localized success/error messages.
- **`@types`** — imports `Address`, `AddressInput`, `UpdateAddressRequest` as the shared contract types.
- **Controllers (`get/post/update/delete-address.ts`)** — thin HTTP handlers that call the exported service functions and send the resulting response.
- **`module.ts`** — registers `addressesDeleteByUserId` as the `personalData.erase` hook in the module manifest.
- **`cart/services/checkout.ts`** — calls `addressForCheckout` to resolve the shipping address before completing an order.
- **`addresses.test.ts` / `cart/tests/integration/service.test.ts`** — integration tests exercising the exported functions.

## Notes

- **`addressForCheckout` tri-state:** `undefined` means the user has no addresses (checkout may proceed without one); `null` means the caller named an id that doesn't belong to them or doesn't exist (checkout **must refuse**). Collapsing `null` to `undefined` would let a stale id silently downgrade to "no address."
- **Omitted keys vs. `undefined`:** `toAddress` conditionally spreads optional fields so the JSON payload omits `label`/`phone` entirely when absent, rather than emitting `"label": null` or `"label": undefined`.
- **All writes return the full book:** callers never receive a single address; the response shape is always `AddressesView`.
