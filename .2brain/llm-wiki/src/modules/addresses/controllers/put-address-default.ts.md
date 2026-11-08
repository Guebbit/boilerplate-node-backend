---
source: src/modules/addresses/controllers/put-address-default.ts
sha256: d01c9c3b2591d48a2d9c61563e9d210be2f0d8e8c582e462000d05c41e6513ef
generated_at: 2026-11-08T04:54:13.876688+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/put-address-default.ts

## Purpose

Thin HTTP adapter for `PUT /account/addresses/:addressId/default`. It extracts the authenticated user and path parameter from the request, delegates to `addressService.setDefault`, and shapes the HTTP response. No business logic lives here.

## Key elements

- **`putAddressDefault(request, response)`** — sole export. Reads `request.authContext!.id`, validates `:addressId` via `requireId`, calls `addressService.setDefault(id, addressId)`, then either rejects (via `refused`), returns the promoted `Address` with 200 (via `successResponse`), or delegates errors to `catchAs`.
- No request body is read — the URI itself is the entire statement (idempotent per RFC 9110 §9.3.4).

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (error-to-HTTP mapping) and `refused` (early-exit on a "refused" service result).
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which validates the `addressId` path param and short-circuits with a 404 if missing/invalid.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which serialises the `Address` payload into a 200 JSON body.
- **`src/modules/addresses/service.ts`** — the `addressService` singleton whose `setDefault(id, addressId)` method performs the actual domain operation.
- **`src/modules/addresses/routes.ts`** — wires this controller onto the Express route (the consumer side of the dependency).
- **`src/types/index.ts`** — supplies the `Address` interface used as the generic type parameter on `successResponse`.

## Notes

- `request.authContext!` uses a non-null assertion; correctness depends on `isAuth` middleware running before this handler. If route registration changes, the assertion can throw at runtime.
- The response body contains only the **promoted** address. The demoted address is a separate row; clients that need the full book must re-fetch.
- `catchAs(response, 'putAddressDefault')` tags the error with the function name for structured logging/correlation downstream.
