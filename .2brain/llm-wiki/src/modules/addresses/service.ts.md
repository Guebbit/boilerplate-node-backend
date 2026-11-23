---
source: src/modules/addresses/service.ts
source_sha256: bfd6d65109eb6ffe417175ecf35845d1255e7c1bb272f60f7a54f59beacf514f
context_sha256: 4479ea13e87118f0e2c8fcaa10b793add4d80b444079484b348e869f804c4e2e
generated_at: 2026-11-22T04:15:57.790697+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/service.ts

## Purpose
The service layer for the address book, the one collection the addresses module owns. It turns repository results into HTTP-ready responses (`generateSuccess` / `generateReject`) and exposes a single `addressService` object that controllers and sibling modules use. A write to one entry answers that entry. The list and removals answer the whole book, because "exactly one default" is a property of the list.

## Key elements
- `list(userId)`: returns the presented book. A missing book and an empty book both give an empty view, never a 404.
- `get(userId, addressId)`: returns one entry from the caller's own book. A bogus id and another user's id both give 404 `addresses.not-found`.
- `create(userId, entry)`: calls `addressBookRepository.addEntry`. It returns the new entry (the last item) with 201. It returns 409 with `ERROR_CODES.ADDRESS_BOOK_LIMIT_REACHED` when the repository returns the `ADDRESS_BOOK_LIMIT_REACHED` sentinel (the cap is `NODE_ADDRESS_BOOK_MAX`). The repository decides the default slot.
- `update(userId, addressId, changes)`: returns the updated entry with 200, or 404.
- `setDefault(userId, addressId)`: makes the entry the default and demotes the previous holder. It returns the entry with 200, or 404.
- `remove(userId, addressId)`: returns 204 with no body, or 404. The repository keeps the one-default invariant.
- `forCheckout(userId, addressId?)`: returns the raw `AddressItem`, not a response.
  - If an id is given, it returns the matching entry, or `null` when the id doesn't match.
  - If no id is given, it returns the default entry, or `undefined`.
- `removeByUserId(userId, session)`: deletes the book inside the caller's `ClientSession`. Its comment describes it as the erase hook for hard account deletion.
- `minimise(userId)`: the same delete with no session. Its comment describes it as the minimise hook for inactive accounts, and it is safe to retry.
- `addressService`: the exported object bundling all of the above plus `reencrypt`, which is `reencryptAddressBooks` from `./reencrypt`.

## Relationships
- **`src/modules/addresses/repository.ts`**: all persistence goes through `addressBookRepository` (`findByUserId`, `addEntry`, `updateEntry`, `setDefault`, `removeEntry`, `deleteByUserId`). The service also imports the `ADDRESS_BOOK_LIMIT_REACHED` sentinel.
- **`src/modules/addresses/presenter.ts`**: `presentAddress`, `presentAddressOf`, `presentAddresses` and the `AddressesView` type shape the wire output.
- **`src/modules/addresses/model.ts`**: supplies the `AddressItem` type returned by `forCheckout`.
- **`src/modules/addresses/reencrypt.ts`**: `reencryptAddressBooks` is re-exposed as the service's `reencrypt` member.
- **`src/infrastructure/http/response.ts`**: provides `generateSuccess` and `generateReject` and the `ResponseSuccess` / `ResponseReject` types.
- **`src/infrastructure/i18n/index.ts`**: `t()` supplies the not-found and book-full messages.
- **`src/modules/addresses/controllers/*`** (get-address, get-addresses, post-address, update-address, delete-address, put-address-default): these are the controllers that sit on top of the service.
- **`src/modules/addresses/module.ts`**: the service's comments refer to its manifest as the place where the erase hook is wired to `removeByUserId`. Only that wiring is stated in this file.
- **`src/modules/addresses/index.ts`**: the module's public entry point, which sits alongside the service.

## Notes
- `forCheckout` deliberately keeps `null` (named an entry that isn't theirs or doesn't exist) separate from `undefined` (no addresses and none named). Checkout must refuse `null`. Merging the two would let a stale id downgrade to "no address".
- `create` takes the last item of the returned book as the new entry, relying on `addEntry` appending (`book.items.at(-1)!`).
- `remove`, `setDefault` and `create` can change which row is the default. `remove` answers with no body, and `setDefault` returns only the promoted entry. A client showing the whole book should refetch it after these writes.
- Ownership is enforced by looking up through the caller's own book, so there is no separate "forbidden" case.
