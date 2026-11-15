---
source: src/modules/addresses/openapi.yaml
sha256: d53bfa195d0bc9c15f9de939ebca6b74256b7843dd15c8cc20ce3f1f3babb9b3
generated_at: 2026-11-14T19:19:27.766554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **addresses** module, defining the REST surface (`/account/addresses/*`) that manages a per-user address book. It is the authoritative schema for request/response shapes, status codes, and idempotency semantics that the route handlers in `module.ts` must satisfy.

## Key elements

- **`x-error-codes`** — module-level extension declaring `ADDRESS_BOOK_LIMIT_REACHED` (409, book full at `NODE_ADDRESS_BOOK_MAX`, default 20).
- **`x-personal-data`** — extension describing the `addresses` section the account-data bundler injects into `POST /account/export`.
- **Paths**
  - `GET /account/addresses` — list the caller's book (unpaged; ≤ `NODE_ADDRESS_BOOK_MAX`).
  - `POST /account/addresses` — create; first entry auto-defaults; supports `Idempotency-Key`.
  - `GET /account/addresses/{addressId}` — fetch one entry.
  - `PUT /account/addresses/{addressId}` — full replace (RFC 9110 §9.3.4; omitted optional field is cleared).
  - `PATCH /account/addresses/{addressId}` — merge-patch (RFC 7396; accepts `application/json` *and* `application/merge-patch+json`).
  - `DELETE /account/addresses/{addressId}` — remove; promotes oldest remaining entry to default.
  - `PUT /account/addresses/{addressId}/default` — bodyless, idempotent pointer move (Shopify-shaped).
- **Schemas (components/schemas)**
  - `Address` — stored entity: `OrderAddress` fields + `label` + `default` boolean. `additionalProperties: false`.
  - `AddressesResponse` — wrapper for the list.
  - `CreateAddressRequest`, `ReplaceAddressRequest`, `UpdateAddressRequest` — per-verb payload shapes.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared parameter (`IdempotencyKeyHeader`), response (`Unauthorized`, `Conflict`, `ValidationError`, `NotFound`, `NoContent`), header (`Location`), and schema (`Id`) is pulled in via relative `$ref` paths. This file never redefines them.
- **`src/modules/addresses/module.ts`** — the runtime implementation that the OpenAPI `operationId`s (`listAddresses`, `createAddress`, `getAddress`, `replaceAddress`, `updateAddress`, `deleteAddress`, `setDefaultAddress`) correspond to. The module registers these routes; this file is the contract it must fulfil.

## Notes

- **Default is a book pointer, not an address field.** Neither `PUT` nor `PATCH` accepts a `default` key; the only way to change it is `PUT …/default`. The spec's descriptions make this explicit to prevent clients from sending it.
- **404 is ownership-blind.** A well-formed ID belonging to another user returns the same 404 as a non-existent ID — the spec does not leak existence across accounts.
- **Idempotency on POST only.** `409` includes both `IDEMPOTENCY_IN_FLIGHT` and `ADDRESS_BOOK_LIMIT_REACHED`; `422` covers `IDEMPOTENCY_KEY_MISMATCH` (same key, different body).
- **PATCH dual content-type.** The endpoint advertises both `application/json` and `application/merge-patch+json` pointing at the same schema, so clients can use either content negotiation style.
- **The file is truncated in the repo view** (the `Address` schema's property list is cut off). The full schema includes `label`, `default`, and the inherited `OrderAddress` fields; rely on the shared root for the order-address portion.
