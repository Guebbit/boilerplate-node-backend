---
source: src/modules/addresses/presenter.ts
source_sha256: 65cf3d82d6e1f0c6104ffdf13037ae082352c3758839061f9e361257a953886b
context_sha256: 4db1fab498ebbbbb3d9c072763060b0131f665f055950d38a1becc7ce4d71780
generated_at: 2026-11-22T04:14:49.471810+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/presenter.ts

## Purpose
Converts address-book documents (the stored Mongo-style shape) into the wire shape declared by `openapi.yaml`. It is the single place where this mapping happens, so every endpoint that answers with an address book uses the same view.

## Key elements
- `AddressesView` — interface matching the contract's `AddressesResponse`: `{ addresses: Address[] }`.
- `presentAddress(item)` — maps one stored `AddressItem` to the contract's `Address`. `_id` becomes a string `id`. Optional fields `label` and `phone` are omitted entirely when `undefined`, not emitted as `undefined`.
- `presentAddressOf(book, addressId)` — finds one entry in a book by string id and presents it. Returns `undefined` if the book is `null` or has no matching entry. Meant for answering about the address just written.
- `presentAddresses(book)` — maps a whole book to an `AddressesView`. A `null` book and an empty book both yield `{ addresses: [] }`.

## Relationships
- `src/modules/addresses/model.ts` — supplies the `AddressBookDocument` and `AddressItem` types (type-only import) that the presenter reads from.
- `src/types/index.ts` (`@types`) — supplies the `Address` type, which is the presenter's output shape.
- `src/modules/addresses/service.ts` — the module header names it as the consumer: its endpoints answer with this same view (the whole book, never one entry).
- `src/modules/addresses/index.ts` — no direct interaction is visible in this file.

## Notes
- Functions accept `AddressBookDocument | null`, so callers can pass a missing book without a separate check.
- Ids are compared as strings (`String(entry._id) === addressId`).
- `presentAddressOf` returns a single entry, while the module header says service endpoints answer with the whole book.
