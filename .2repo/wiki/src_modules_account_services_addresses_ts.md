# src/modules/account/services/addresses.ts

## Purpose

Service-layer functions for the account module's address book. Every mutating endpoint returns the **full** book (`{ addresses }`) rather than a single entry, because the invariant "exactly one default" is a property of the list. Also provides the address-resolution helper that cart checkout consumes.

## Key elements

- **`AddressesView`** — interface matching the OpenAPI `AddressesResponse` shape: `{ addresses: Address[] }`.
- **`toAddress`** / **`toView`** — internal mappers from DB `AddressItem` → public `Address`, and from `AddressBookDocument | null` → `AddressesView`. Omit `label`/`phone` keys entirely when undefined (not set to `null`).
- **`addressesGet`** — fetches the user's book. Absence is the same as emptiness: always resolves to an empty view, never 404.
- **`addressAdd`** — inserts an entry; `default` defaults to `false` if the caller omits it. The repository owns the default-slot logic.
- **`addressUpdate`** — patches one entry by id. A foreign or bogus id is indistinguishable → 404 reject.
- **`addressRemove`** — deletes one entry; repository re-assigns the default slot.
- **`addressForCheckout(userId, addressId?)`** — resolves the ship-to address. Returns `AddressItem | null | undefined`: `undefined` = "no addresses, none named" (valid, address not required); `null` = "named an address that isn't theirs / doesn't exist" (checkout must refuse). Consumed by `cart/services/checkout.ts`.
- **`addressesDeleteByUserId`** — cascade-delete hook subscribed by `module.ts` on account removal.

## Relationships

| Neighbor | Interaction |
|---|---|
| `account/repository.ts` | All six exported functions call `addressBookRepository` for the actual read/write. |
| `account/model.ts` | Imports `AddressBookDocument` and `AddressItem` (DB-level shapes). |
| `@types/index.ts` | Imports public `Address`, `AddressInput`, `UpdateAddressRequest`. |
| `@infrastructure/http/response.ts` | Wraps results with `generateSuccess` / `generateReject`. |
| `@infrastructure/i18n/index.ts` | Calls `t('account.addresses.*')` for localized success/error messages. |
| `account/services/index.ts` | Re-exports these six functions as members of the single `accountService` handle. |
| `account/module.ts` | Subscribes `addressesDeleteByUserId` to the account-deletion event. |
| `cart/services/checkout.ts` | Calls `addressForCheckout` (via the `accountService` barrel) to resolve the shipping address. |

## Notes

- **No standalone namespace object.** The six exports are flat; they are grouped into `accountService` in `./index` rather than living under an `addressesService` sub-object. This is a deliberate one-layer-over-two-collections design (see the doc-comment in `./index`).
- **`addressesGet` never rejects / 404s.** A user with no book and a user whose book is empty both get `{ addresses: [] }`.
- **`addressForCheckout` tri-state is load-bearing.** Collapsing `null` and `undefined` would let a stale address id silently downgrade to "no address," causing a mis-shipment.
- **Default slot is the repository's concern.** The service never reassigns `default` itself; `addEntry` / `removeEntry` in the repository enforce the one-default rule.
