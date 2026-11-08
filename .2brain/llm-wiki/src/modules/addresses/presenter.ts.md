---
source: src/modules/addresses/presenter.ts
sha256: 65cf3d82d6e1f0c6104ffdf13037ae082352c3758839061f9e361257a953886b
generated_at: 2026-11-08T04:55:50.276071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/presenter.ts

## Purpose

Single mapping layer that converts the internal `AddressBookDocument` shape into the wire shape declared in `openapi.yaml`. Every endpoint in `./service.ts` serialises its response through one of the functions exported here, keeping the "stored → wire" translation in exactly one place.

## Key elements

- **`AddressesView`** (interface) — the top-level response object (`{ addresses: Address[] }`) that matches the `AddressesResponse` schema in `openapi.yaml`.
- **`presentAddress(item: AddressItem): Address`** — maps a single stored entry to the contract's `Address` type; renames `_id` → `id` and omits `label`/`phone` when undefined (conditional spread) so the JSON payload contains no `null`/`undefined` fields.
- **`presentAddressOf(book, addressId): Address | undefined`** — looks up one entry by id in a (possibly null) book and returns its wire form, or `undefined` when no entry matches. Used for write-endpoint responses that reference a single address.
- **`presentAddresses(book): AddressesView`** — maps an entire book (or `null`) to `{ addresses: [] }` when the book is absent or empty, otherwise to the full list. Used by list/read endpoints.

## Relationships

- **`./model.ts`** — supplies the internal types `AddressBookDocument` and `AddressItem` that the presenters consume.
- **`../types/index.ts`** — supplies the wire type `Address` that `presentAddress` produces.
- **`./service.ts`** — imports the three `present*` functions to build every HTTP response in the addresses module.
- **`./index.ts`** — barrel file; re-exports this module's public API for the rest of the codebase.

## Notes

- Optional fields (`label`, `phone`) are **omitted** from the object when `undefined`, not set to `undefined`/`null`. This is deliberate so the JSON matches the OpenAPI schema's optional-property semantics.
- `_id` is a Mongo `ObjectId`; it is always cast via `String()` before assignment to the wire `id` field.
- `presentAddresses` treats a `null` book and an empty book identically (`{ addresses: [] }`). `presentAddressOf`, by contrast, returns `undefined` for a missing entry — the caller (service layer) is responsible for turning that into a 404.
- The header comment stresses that the whole book, never a single entry, is the default response shape for read endpoints; single-entry responses are an exception used after writes.
