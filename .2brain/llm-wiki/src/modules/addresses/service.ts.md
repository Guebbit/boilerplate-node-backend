---
source: src/modules/addresses/service.ts
sha256: c50a239332bd1cb1ec9c91a1b58adb2e3a698310241d134176dda6fb4c778ac7
generated_at: 2026-10-29T03:09:51.389298+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/service.ts

## Purpose

Service layer for the address-book module. It is the single point through which every controller and sibling module reads and writes the address book, translating repository results into shaped HTTP responses (`generateSuccess` / `generateReject`) and localised error messages.

## Key elements

- **`addressService`** — The sole export. An object bundling all operations below so callers import one name.
- **`list(userId)`** — Returns the user's full book as an `AddressesView`. Absence and emptiness are the same state: always an empty view, never a 404.
- **`get(userId, addressId)`** — Returns one entry or a 404. A foreign id is indistinguishable from a bogus one.
- **`create(userId, entry)`** — Adds an entry (201) or rejects with 409 `ADDRESS_BOOK_LIMIT_REACHED`. Relies on the repository appending, so the new entry is `book.items.at(-1)`.
- **`update(userId, addressId, changes)`** — Partially updates one entry; returns the entry as it now stands (200) or 404.
- **`setDefault(userId, addressId)`** — Promotes one entry to default, demoting the previous holder. Returns the promoted entry; the demoted row is a different entry, so list-viewing clients should refetch.
- **`remove(userId, addressId)`** — Deletes one entry (204) or 404. The repository maintains the one-default invariant.
- **`forCheckout(userId, addressId?)`** — Resolves the shipping address. Returns `AddressItem | null | undefined` (see Notes).
- **`removeByUserId(userId, session)`** — Hard-deletes all of a user's addresses inside a Mongoose `ClientSession` transaction (GDPR `personalData.erase` hook).
- **`minimise(userId)`** — Same delete without a transaction (GDPR `personalData.minimise` hook for inactive accounts). Idempotent; safe to retry.
- **`reencrypt`** — Re-exports `reencryptAddressBooks` from `./reencrypt`.

## Relationships

- **`./repository`** — All data access. Imports `addressBookRepository` (CRUD + `deleteByUserId`) and the `ADDRESS_BOOK_LIMIT_REACHED` sentinel.
- **`./presenter`** — Transforms repository shapes into wire shapes via `presentAddress`, `presentAddressOf`, `presentAddresses`.
- **`./model`** — Imports the `AddressItem` type used by `forCheckout`.
- **`./reencrypt`** — Imports and re-exports `reencryptAddressBooks` into `addressService`.
- **`./module`** — Registers `removeByUserId` and `minimise` as lifecycle hooks in the module manifest (per their doc comments).
- **`./index`** — Re-exports `addressService` for external consumers.
- **Controllers** (`get-addresses`, `get-address`, `post-address`, `update-address`, `delete-address`, `put-address-default`) — Each calls the corresponding `addressService` method and returns the promise directly.
- **`@infrastructure/http/response`** — Provides `generateSuccess`, `generateReject`, and the `ResponseSuccess` / `ResponseReject` union types that every method returns.
- **`@infrastructure/i18n`** — `t()` localises user-facing error messages (`addresses.not-found`, `addresses.book-full`).

## Notes

- **`forCheckout` triple-state is deliberate.** `undefined` = the user has no addresses and named none (checkout may proceed without one). `null` = the caller named an id that does not resolve to their book (checkout must refuse). Collapsing the two would let a stale id silently downgrade to "no address."
- **`removeByUserId` vs `minimise`.** Both call `repository.deleteByUserId`. The former passes a Mongoose `ClientSession` to join the caller's hard-delete transaction; the latter omits it. The latter is safe to retry because deleting an already-empty set is a no-op.
- **Controllers never touch the repository directly.** The service is the single door; it also owns the 404 / 409 / 201 / 204 status decisions and the i18n messages.
- **`create` trusts the append invariant.** It reads `book.items.at(-1)!` without searching, relying on `addEntry` appending the new entry last.
