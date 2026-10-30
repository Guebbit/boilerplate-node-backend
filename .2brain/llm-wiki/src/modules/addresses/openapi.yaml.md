---
source: src/modules/addresses/openapi.yaml
sha256: a1d81a0f98d742bea95621505f74dac53e08348f409745ff1508857575b4aba9
generated_at: 2026-10-29T03:08:39.047615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the addresses module: it declares the full CRUD surface of a user's address book (`/account/addresses`), the default-address pointer endpoint, the module's personal-data export slice, and the domain schemas (`Address`, `AddressInput`, etc.) that both the API implementation and downstream consumers (e.g. cart/checkout) rely on.

## Key elements

- **`x-error-codes`** — module-level error-code registry; defines `ADDRESS_BOOK_LIMIT_REACHED` (409, cap of 20 entries).
- **`x-personal-data.addresses`** — schema fragment the account-export bundler appends to `POST /account/export`; removing the module removes this section.
- **Paths**
  - `GET /account/addresses` (`listAddresses`) — returns the full book; exactly one entry has `default: true` when non-empty.
  - `POST /account/addresses` (`addAddress`) — creates an entry; first entry becomes default automatically; later entries claim default only via explicit `default: true` in the body.
  - `GET /account/addresses/{addressId}` (`getAddress`) — single entry; foreign/unknown/malformed IDs all yield 404.
  - `PUT /account/addresses/{addressId}` (`replaceAddress`) — full replacement (RFC 9110 §9.3.4 semantics); `default` is *not* an accepted field.
  - `PATCH /account/addresses/{addressId}` (`updateAddress`) — JSON Merge Patch (RFC 7396); accepts `application/json` or `application/merge-patch+json`; `default` is *not* an accepted field.
  - `DELETE /account/addresses/{addressId}` (`removeAddress`) — 204 on success; removing the default promotes the oldest remaining entry.
  - `PUT /account/addresses/{addressId}/default` (`setDefaultAddress`) — no body; idempotent; moves the book's default pointer in one write; modeled after Shopify's equivalent endpoint.
- **Schemas** — `Address` (extends shared `OrderAddress` fields plus `id`, `label`, `default`), `AddressInput`, `ReplaceAddressRequest`, `UpdateAddressRequest`, `AddressesResponse`. All address-field sub-schemas (`AddressFullName`, `AddressStreet`, etc.) are `$ref`'d from the shared root.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared building block (Id, AddressFullName, AddressStreet, standard error responses, `Location` header) is pulled in via relative `$ref`. This file contributes no definitions back to the root; it is a pure consumer.
- **`src/modules/cart/module.ts`** — the cart/checkout module reads the default address (the entry with `default: true`) when no explicit `addressId` is supplied at checkout. The addresses contract is the source of truth for what that default means; the cart module is its primary downstream consumer.

## Notes

- `default` is deliberately excluded from `AddressInput`, `ReplaceAddressRequest`, and `UpdateAddressRequest`. It is a *book-level pointer*, not a per-entry field; it is moved exclusively via `PUT …/default` or implicitly on first-insert / last-default-delete.
- The 409 on `POST` is the only non-standard status in the create flow; it guards the `NODE_ADDRESS_BOOK_MAX` cap (default 20).
- `PATCH` accepts two content types (`application/json` and `application/merge-patch+json`) against the *same* schema — both use RFC 7396 merge-patch semantics.
- The `x-personal-data` block is a contractual hook for the export bundler, not a path; it must stay in sync with the `Address` schema.
