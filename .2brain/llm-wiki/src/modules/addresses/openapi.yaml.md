---
source: src/modules/addresses/openapi.yaml
source_sha256: d53bfa195d0bc9c15f9de939ebca6b74256b7843dd15c8cc20ce3f1f3babb9b3
context_sha256: 659cc48641da87ab988fd42296ceaaec034a9aa0b1b3fe41af9c03fb203515d9
generated_at: 2026-11-22T04:14:23.362866+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `addresses` module: a user's saved address book under `/account/addresses`. It declares the paths, error codes, schemas and the module's contribution to the account data export. Removing the module removes its section from the export.

## Key elements
- **`x-error-codes`**: defines `ADDRESS_BOOK_LIMIT_REACHED` (409), raised when the book already holds `NODE_ADDRESS_BOOK_MAX` entries (20 by default).
- **`x-personal-data.addresses`**: array of `Address`. The bundler adds it to `AccountExportResponse` for `POST /account/export`.
- **`GET /account/addresses`** (`listAddresses`): lists the caller's book, unpaged. A non-empty book always has exactly one `default` entry.
- **`POST /account/addresses`** (`createAddress`):
  - Takes an `Idempotency-Key` header and returns 201 with a `Location` header.
  - The first entry becomes the default automatically. Later entries take the default only by sending `default true`, which demotes the previous holder.
  - Declares 409 `IDEMPOTENCY_IN_FLIGHT` and `ADDRESS_BOOK_LIMIT_REACHED`, and 422 `IDEMPOTENCY_KEY_MISMATCH`.
- **`GET /account/addresses/{addressId}`** (`getAddress`): fetches one entry.
- **`PUT /account/addresses/{addressId}`** (`replaceAddress`): full replacement, so an omitted optional field is cleared.
- **`PATCH /account/addresses/{addressId}`** (`updateAddress`): merge update per RFC 7396. It accepts `application/json` and `application/merge-patch+json`, and `null` clears an optional field.
- **`DELETE /account/addresses/{addressId}`** (`deleteAddress`): returns 204. Deleting the default promotes the oldest remaining entry.
- **`PUT /account/addresses/{addressId}/default`** (`setDefaultAddress`): bodyless and idempotent. It makes the entry the default and demotes the old default in the same write.
- **Schemas** (`components.schemas`):
  - `Address` is a strict object (`additionalProperties: false`) with required `id`, `fullName`, `street`, `city`, `zip`, `country` and `default`, plus an optional `label`. It is described as `OrderAddress` plus the book-specific `id` and `default`.
  - `AddressesResponse`, `CreateAddressRequest`, `ReplaceAddressRequest` and `UpdateAddressRequest` are referenced by the paths. Their definitions fall outside the visible part of the file.

## Relationships
- `src/modules/account/openapi.yaml`: all operations are tagged `Account` and sit under `/account/...`. The `x-personal-data` section is merged into the account module's `POST /account/export` response by the bundler.

## Notes
- Operations reference shared components (`Id`, `IdempotencyKeyHeader`, `Location`, the standard error responses, `bearerAuth`) from `shared/contracts/openapi.root.yaml` via `$ref`.
- Cross-user access returns the same 404 as an unknown or malformed id, so entries cannot be probed.
- `default` is not accepted on PUT or PATCH. Changing the default goes through `PUT .../{addressId}/default`.
- Operations that change the default or delete an entry affect other rows, so clients showing the book should refetch it.
- The default invariant is maintained by the API, not the client.
- The 422 on `createAddress` also covers reuse of an `Idempotency-Key` with a different body.
