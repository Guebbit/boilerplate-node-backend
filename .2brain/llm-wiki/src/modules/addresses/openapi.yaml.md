---
source: src/modules/addresses/openapi.yaml
sha256: e1442725334043fa50739faaaf60e62e0d735a71f857273ef0900b2762e628ac
generated_at: 2026-09-23T18:20:43.000850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the addresses module. It defines the four REST endpoints (list, add, update, remove) that manage a user's personal address book, including the invariant that exactly one entry is the default whenever the book is non-empty.

## Key elements

- **Paths** — four operations under `/account/addresses`:
    - `GET /account/addresses` (`getAddresses`) — returns the full address book.
    - `POST /account/addresses` (`addAddress`) — adds an entry; first entry auto-becomes default.
    - `PUT /account/addresses/{addressId}` (`updateAddress`) — updates one entry; `default: true` claims the default slot.
    - `DELETE /account/addresses/{addressId}` (`removeAddress`) — removes an entry; oldest remaining promotes to default.
- **Schemas** (under `components/schemas`):
    - `Address` — a saved entry; required fields: `id`, `fullName`, `street`, `city`, `zip`, `country`, `default`. Optional: `label`, `phone`.
    - `AddressInput` — request body for POST; all address fields required except `label`, `phone`, `default`.
    - `UpdateAddressRequest` — request body for PUT; all fields optional (partial-update semantics).
    - `AddressesResponse` — `{ addresses: Address[] }`.
    - `AddressesEnvelope` — standard `{ success, status, message, data }` wrapper around `AddressesResponse`.
- **Security** — every operation requires `bearerAuth`.

## Relationships

- **shared/contracts/openapi.root.yaml** — Referenced (via relative `$ref`) for shared schemas (`Id`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) and shared error responses (`Unauthorized`, `InternalError`, `ValidationError`, `NotFound`). This file depends on it; it does not define those components locally.
- **src/modules/cart/module.ts** — The address descriptions explicitly name the consumer: the default address is what "checkout ships to when no `addressId` is named," and the `Address` schema is described as `OrderAddress` plus book-specific fields. The cart/checkout module is the primary caller of this contract.

## Notes

- **`default` field semantics differ by verb.** On **create**, an absent `default` means "become default only if this is the first entry." On **update**, both `default: false` and an absent `default` leave the existing assignment unchanged — the API refuses to demote the default without a named successor.
- **404 is identity-blind.** A well-formed `addressId` belonging to _another_ user returns the same `404` as a completely invented ID. This is intentional to avoid leaking the existence of other users' addresses.
- **Strict shapes.** Every schema sets `additionalProperties: false`; unexpected fields in a request body will be rejected.
- **Envelope is universal.** All four operations return the `AddressesEnvelope` wrapper on success, not a bare array.
