---
source: src/modules/addresses/controllers/put-address-default.ts
sha256: d01c9c3b2591d48a2d9c61563e9d210be2f0d8e8c582e462000d05c41e6513ef
generated_at: 2026-10-29T03:08:05.862984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/put-address-default.ts

## Purpose

Thin HTTP adapter for `PUT /account/addresses/:addressId/default`. It validates the `addressId` path parameter, delegates to the address service's `setDefault` method, and translates the service result into an HTTP response. No request body is consumed — the URI itself is the full statement (idempotent per RFC 9110 §9.3.4).

## Key elements

- **`putAddressDefault(request, response)`** (exported) — Express handler. Extracts the caller's `id` from `request.authContext` (set by upstream auth middleware), validates `addressId` via `requireId`, calls `addressService.setDefault(id, addressId)`, then either short-circuits on a refusal or sends `200` with the promoted `Address`. Errors are funneled through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — provides `refused` (short-circuit for service-level refusals) and `catchAs` (maps thrown errors to an HTTP error response).
- **`@infrastructure/http/ids`** — provides `requireId`, which validates the `:addressId` param and sends a `404` with key `addresses.not-found` if missing or malformed.
- **`@infrastructure/http/response`** — provides `successResponse<Address>`, the standard 200 JSON envelope.
- **`@modules/addresses/service`** — `addressService.setDefault(id, addressId)` performs the actual promote/demote logic.
- **`@modules/addresses/routes`** — registers `putAddressDefault` on the PUT route.
- **`@types`** — supplies the `Address` type used as the response payload generic.

## Notes

- `request.authContext` is accessed with a non-null assertion (`!`); the contract is that the `isAuth` middleware runs before this handler and guarantees its presence.
- The response body contains only the *promoted* address. The previously-default address (demoted) is a different row; the client is expected to refetch the full list rather than receiving a delta here.
