---
source: src/modules/addresses/openapi.yaml
sha256: cb10188cdf985cdde31e4a23acde47ccfeed882370b039a2018d802ade39d897
generated_at: 2026-10-15T10:18:18.636758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the addresses module. It defines the full CRUD surface for a per-user address book (list, add, replace, update, remove, set-default) under `/account/addresses`, plus the schemas and error vocabulary other parts of the API contract reference when they embed or return an address.

## Key elements

- **`x-error-codes`** — Module-scoped error registry; currently only `ADDRESS_BOOK_FULL` (409, book at `NODE_ADDRESS_BOOK_MAX` = 20 entries).
- **`x-personal-data`** — Declares the `addresses` array section that the bundler injects into `AccountExportResponse` (`POST /account/export`). Removing the module removes this section automatically.
- **`GET /account/addresses`** (`listAddresses`) — Returns the caller's full book; exactly one entry has `default: true` when non-empty.
- **`POST /account/addresses`** (`addAddress`) — Creates an entry; first entry auto-defaults, later entries opt in via `default: true` in the body (demoting the previous holder). Returns 201 + `Location` header.
- **`PUT /account/addresses/{addressId}`** (`replaceAddress`) — Full replacement per RFC 9110 §9.3.4 (omitted optional field → cleared). `default` is **not** accepted here.
- **`PATCH /account/addresses/{addressId}`** (`updateAddress`) — RFC 7396 merge-patch; accepts both `application/json` and `application/merge-patch+json`. `default` is **not** accepted here.
- **`DELETE /account/addresses/{addressId}`** (`removeAddress`) — Removes the entry; if it was the default, the oldest remaining entry is promoted.
- **`PUT /account/addresses/{addressId}/default`** (`setDefaultAddress`) — Body-less, idempotent pointer move; demotes the previous default in the same write. Modeled on Shopify's equivalent endpoint.
- **`components/schemas/Address`** — The book entry: `OrderAddress` fields + `label` + `default`. `additionalProperties: false`.
- **`components/schemas/AddressInput`** — Create-body schema (no `id`, no `default` required).
- Additional schemas (truncated in source): `AddressEnvelope`, `AddressesEnvelope`, `ReplaceAddressRequest`, `UpdateAddressRequest`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every shared response (`Unauthorized`, `InternalError`, `Conflict`, `ValidationError`, `NotFound`), the `Location` header, and the base `Id` / `CountryCode` schemas are pulled in via `$ref` paths of the form `../../../shared/contracts/openapi.root.yaml#/...`. This file never redefines those; it only composes them.
- **`src/modules/cart/module.ts`** — Semantic consumer: the default address defined here is "the one checkout ships to when no `addressId` is named." The cart module's checkout flow resolves shipping from this module's `default` flag rather than carrying its own address copy.

## Notes

- **Default is a book-level pointer, not a per-address field.** `PUT` and `PATCH` on the address explicitly reject `default` in the body. The only way to change it is the dedicated `PUT /{addressId}/default` endpoint. This mirrors Shopify's design.
- **404 is opaque to ownership.** An id that belongs to a different user returns the same 404 as a non-existent id — no 403.
- **Idempotency:** `PUT /{addressId}/default` is idempotent by construction (RFC 9110 §9.3.4); repeating it is a no-op.
- **Bundler coupling:** The `x-personal-data` block is consumed by an export bundler that assembles `AccountExportResponse`. The addresses module does not implement the export endpoint itself; it only contributes its schema slice.
- **Cap enforcement:** `ADDRESS_BOOK_FULL` (409 on `POST`) is the only module-specific error code; all other errors reuse shared contracts.
