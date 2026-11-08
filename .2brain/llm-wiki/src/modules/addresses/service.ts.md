---
source: src/modules/addresses/service.ts
sha256: bfd6d65109eb6ffe417175ecf35845d1255e7c1bb272f60f7a54f59beacf514f
generated_at: 2026-11-08T04:56:46.022835+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/service.ts

## Purpose

Service layer for the address-book module. It translates controller calls into repository operations, shapes the results via the presenter, and enforces the HTTP response contract (status codes, error payloads). It also exposes the lifecycle hooks (hard-delete, minimisation) and the checkout address-resolution logic that other modules depend on.

## Key elements

- **`addressService`** (exported object) — the module's single public API; every controller and sibling module goes through this.
- **`list(userId)`** — returns the caller's full book as an `AddressesView`; absence and emptiness both yield an empty view, never a 404.
- **`get(userId, addressId)`** — returns one entry or a 404 (foreign ids are indistinguishable from bogus ones).
- **`create(userId, entry)`** — adds an entry; returns 201 with the new entry, or 409 `ADDRESS_BOOK_LIMIT_REACHED`. Relies on `addEntry` appending so the new item is always `book.items.at(-1)`.
- **`update(userId, addressId, changes)`** — patches one entry; returns 200 with the updated entry or 404.
- **`setDefault(userId, addressId)`** — promotes an entry to default (demoting the previous holder); returns 200 with the promoted entry.
- **`remove(userId, addressId)`** — deletes an entry; returns 204 with an empty body.
- **`forCheckout(userId, addressId?)`** — resolves the shipping address: a named entry, the default, or nothing. Returns `AddressItem | null | undefined` (see Notes).
- **`removeByUserId(userId, session)`** — hard-delete hook (`personalData.erase`); participates in the caller's Mongoose transaction.
- **`minimise(userId)`** — inactive-account hook (`personalData.minimise`); same delete as above but without a transaction.
- **`reencrypt`** — re-export of `reencryptAddressBooks` from `./reencrypt`.

## Relationships

- **`./repository`** — all data access goes through `addressBookRepository`; the service never touches Mongoose directly (except the `ClientSession` passed to `removeByUserId`).
- **`./presenter`** — every outbound shape is produced by `presentAddress`, `presentAddressOf`, or `presentAddresses`.
- **`./model`** — provides the `AddressItem` type used by `forCheckout`.
- **`./reencrypt`** — imported and re-exposed as `addressService.reencrypt`.
- **`./module`** — registers the service and declares the lifecycle hooks this file fulfils.
- **Controllers** (`post-address`, `get-address`, `get-addresses`, `update-address`, `put-address-default`, `delete-address`) — call the corresponding `addressService` method and return its response.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build every HTTP envelope.
- **`@infrastructure/i18n`** — `t()` localises error messages.
- **`./index`** — re-exports the module's public surface (the service, types, etc.).

## Notes

- **`forCheckout` tri-state is intentional.** `undefined` means the user has no addresses and named none (checkout may proceed without a shipping address). `null` means the user named an id that is foreign or nonexistent — checkout must **refuse**, not silently ship nowhere. Collapsing the two would let a stale id degrade to "no address."
- **`create` assumes append-order.** It reads `book.items.at(-1)!` without an extra lookup; this correctness depends on `addEntry` in the repository always appending.
- **"Exactly one default" is a repository invariant.** The service never re-orders or demotes entries itself; it reports whatever the repository returns after the write.
- **`minimise` is idempotent by construction.** It calls the same `deleteByUserId` as `removeByUserId` minus the session, so a retried run is a safe no-op.
- **404 messaging is uniform.** Whether the id is foreign or simply absent, the response is the same 404 with `t('addresses.not-found')` — there is no "not yours" distinction.
