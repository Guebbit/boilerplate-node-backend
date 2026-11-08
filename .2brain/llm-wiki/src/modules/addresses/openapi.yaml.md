---
source: src/modules/addresses/openapi.yaml
sha256: 48b33a391c61567dc0b33f85325c979d3fd5c345298a9f25ab4eeae83f3f7319
generated_at: 2026-11-08T04:55:23.111248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **addresses** module — the user's personal address book. It defines the REST surface (`GET/POST /account/addresses`, full CRUD on `/account/addresses/{addressId}`, and the `PUT …/default` sub-resource), the `Address` / `AddressesResponse` / request schemas, and the module's contribution to the account data export. It exists so that the runtime implementation (`module.ts`) and any generated client SDK share a single, machine-readable source of truth.

## Key elements

- **`paths`** — Five operation groups under the `Account` tag:
  - `GET /account/addresses` (`listAddresses`) — returns the full book; exactly one entry is `default` when non-empty.
  - `POST /account/addresses` (`createAddress`) — adds an entry; first entry auto-becomes default; `409` on `ADDRESS_BOOK_LIMIT_REACHED`.
  - `GET /account/addresses/{addressId}` (`getAddress`) — single entry; foreign or unknown IDs return the same `404`.
  - `PUT …/{addressId}` (`replaceAddress`) — full replace per RFC 9110 §9.3.4; `default` is **not** an accepted field here.
  - `PATCH …/{addressId}` (`updateAddress`) — JSON Merge Patch per RFC 7396; accepts both `application/json` and `application/merge-patch+json`.
  - `DELETE …/{addressId}` (`deleteAddress`) — removes entry; oldest remaining promotes to default.
  - `PUT …/{addressId}/default` (`setDefaultAddress`) — idempotent pointer move, no body; mirrors Shopify's same-shaped endpoint.
- **`components.schemas`** — `Address` (extends shared `OrderAddress`-shaped fields with `id`, `label`, `default`), `AddressesResponse`, `CreateAddressRequest`, `ReplaceAddressRequest`, `UpdateAddressRequest`.
- **`x-error-codes`** — module-level registry; currently defines `ADDRESS_BOOK_LIMIT_REACHED` (409).
- **`x-personal-data`** — declares the `addresses` array included in `POST /account/export`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared response (`Unauthorized`, `NotFound`, `Conflict`, `ValidationError`, `NoContent`), the `Location` header, the `Id` schema, and individual address-field schemas (`AddressFullName`, `AddressStreet`, …) are `$ref`-ed from this root contract. The addresses file only *consumes* those definitions; it never redefines them.
- **`src/modules/addresses/module.ts`** — the runtime module that fulfills these operations. The OpenAPI file is its declarative contract; the `operationId` values in the YAML map 1:1 to handler functions exported by `module.ts`.

## Notes

- **Default is a book-level pointer, not an address field.** `PUT` and `PATCH` explicitly reject `default` in the body; only `POST` (via `default: true`) and `PUT …/default` can change it. Clients must refetch the book after a default change because the demoted row is a *different* resource.
- **Security boundary via 404, not 403.** A well-formed ID that belongs to another user returns `404` (same as an invented ID), deliberately avoiding ID enumeration.
- **`PATCH` dual content-type.** Both `application/json` and `application/merge-patch+json` are accepted with the *same* schema; the server applies RFC 7396 semantics regardless of the header value.
- **`additionalProperties: false`** on `Address` — any client sending an unknown field will receive a `422`.
- The `x-personal-data` block is consumed by the account-export bundler; removing the module from the app removes that section automatically.
