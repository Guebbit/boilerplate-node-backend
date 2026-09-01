# src/modules/account/services/addresses.ts

## Purpose

Service layer for the account's address book: CRUD operations plus a checkout lookup, all scoped to a single user. It exists as a slice of the account service (`./index`) rather than a standalone namespace so the account's two aggregates (auth + addresses) share one service handle. The file owns the "exactly one default" invariant at the list level and maps the repository's document shape to the OpenAPI wire contract.

## Key elements

- **`AddressesView`** — The response shape (`{ addresses: Address[] }`) matching the `AddressesResponse` schema in `openapi.yaml`.
- **`toAddress` / `toView`** (internal) — Mappers from `AddressItem` → `Address` (rewrites `_id` → `id`, omits optional fields rather than emitting `undefined`) and `AddressBookDocument | null` → `AddressesView`.
- **`addressesGet(userId)`** — Returns the full book; absence and empty book are the same state (empty array, never 404).
- **`addressAdd(userId, entry)`** — Inserts an entry; repository decides the default slot. Returns `ResponseSuccess<AddressesView> | ResponseReject`.
- **`addressUpdate(userId, addressId, changes)`** — Modifies one entry in the caller's book; foreign or bogus ids produce the same 404 reject.
- **`addressRemove(userId, addressId)`** — Deletes one entry; repository maintains the one-default invariant.
- **`addressForCheckout(userId, addressId?)`** — Resolves the ship-to address for checkout. Returns `AddressItem | null | undefined`: `undefined` = no book / no named id (not required); `null` = caller named an id that doesn't exist or isn't theirs (checkout must refuse).
- **`addressesDeleteByUserId(userId)`** — Hard-delete hook called by the module's account-deletion subscription.

## Relationships

- **`src/modules/account/repository.ts`** — Sole data-access dependency (`addressBookRepository`); all reads/writes go through it.
- **`src/modules/account/model.ts`** — Imports `AddressBookDocument` and `AddressItem` (the stored shape this file maps from).
- **`src/types/index.ts`** — Imports `Address`, `AddressInput`, `UpdateAddressRequest` (the wire/API shapes).
- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` for the standard success/reject envelope.
- **`src/infrastructure/i18n/index.ts` + `context.ts`** — Pulls `t` for user-facing messages (`account.addresses.*`).
- **`src/modules/account/services/index.ts`** — Re-exports the six public functions as members of `accountService`; this file has no standalone namespace object.
- **`src/modules/account/module.ts`** — Subscribes `addressesDeleteByUserId` to the account-deletion event.
- **`src/modules/cart/services/checkout.ts`** — Consumes `addressForCheckout` to resolve the ship-to address.

## Notes

- **`undefined` vs `null` in `addressForCheckout` is intentional and load-bearing.** Collapsing them would let a stale address id silently downgrade to "no address" instead of forcing checkout to refuse. Callers must branch on both.
- **Optional fields are omitted, not set to `undefined`, in the wire output** (conditional spread in `toAddress`). This matters for JSON serialization: the key is absent rather than present-with-undefined.
- **`addressAdd` defaults `default` to `false`** if the caller omits it; the repository still owns the one-default slot decision.
- **No 404 on GET.** An absent book and an empty book are indistinguishable by design; only `update` and `remove` can 404.
- **These exports are not meant to be imported directly** — they live under `accountService` in `./index`. Importing from this file path is possible but bypasses the module's single service handle.
