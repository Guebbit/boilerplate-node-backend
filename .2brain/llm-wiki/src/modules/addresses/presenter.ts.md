---
source: src/modules/addresses/presenter.ts
sha256: 65cf3d82d6e1f0c6104ffdf13037ae082352c3758839061f9e361257a953886b
generated_at: 2026-10-14T14:52:24.708883+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/presenter.ts

## Purpose

Maps the internal address-book model to the wire shapes declared in `openapi.yaml`. Every endpoint in `./service.ts` builds its response through this file, keeping serialization logic in one place separate from domain logic and HTTP plumbing.

## Key elements

- **`AddressesView`** (interface) — the wire shape for a full-book response: `{ addresses: Address[] }`.
- **`presentAddress`** (exported const) — maps a single `AddressItem` to the `Address` contract. Renames `_id` → `id` and conditionally omits optional fields (`label`, `phone`) so they are absent rather than `undefined`.
- **`presentAddressOf`** (exported const) — looks up one entry by id within an `AddressBookDocument`; returns `Address | undefined`. Used for single-entry write responses.
- **`presentAddresses`** (exported const) — maps an entire `AddressBookDocument` (or `null`) to `AddressesView`; a null or empty book both yield `{ addresses: [] }`.

## Relationships

- **`src/modules/addresses/model.ts`** — provides the `AddressBookDocument` and `AddressItem` types that the presenter reads from.
- **`src/types/index.ts`** — provides the `Address` contract type that the presenter writes to (the `openapi.yaml` shape).
- **`src/modules/addresses/service.ts`** — consumes all three exported presenters to build HTTP responses.
- **`src/modules/addresses/index.ts`** — module barrel that re-exports this file alongside the other address-module pieces.

## Notes

- Optionals use conditional spread (`...(item.label === undefined ? {} : { label: item.label })`) so the JSON output has the key *absent* rather than `null`/`undefined` — important if the OpenAPI contract marks them as optional rather than nullable.
- `presentAddressOf` returns `undefined` (not `null`, not a thrown error) when the id is not found; callers must handle that case.
- The module doc comment states that read endpoints always return the whole book, while `presentAddressOf` exists specifically for write-confirmation responses that reference a single entry.
