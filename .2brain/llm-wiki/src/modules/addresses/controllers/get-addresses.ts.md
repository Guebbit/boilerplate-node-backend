---
source: src/modules/addresses/controllers/get-addresses.ts
sha256: 0e917a57d70690659132c70e70adc9df449549346b5de57622df7dc005ec427c
generated_at: 2026-10-14T14:51:08.509989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-addresses.ts

## Purpose

Thin HTTP adapter for the `GET /account/addresses` endpoint. It extracts the authenticated user's id, delegates to the `addressesGet` service call, and returns the caller's full address book. It exists solely to bridge Express's request/response cycle to the service layer.

## Key elements

- **`getAddresses(request, response)`** — exported handler. Reads `request.authContext!.id`, calls `addressesGet(id)`, sends the result via `successResponse<AddressesResponse>`, and routes any rejection through `catchAs(response, 'listAddresses')`.

## Relationships

- **`src/modules/addresses/service.ts`** — source of `addressesGet`, the single business-logic call this controller wraps.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which shapes the JSON envelope for the 200 reply.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-capture helper that converts a rejected promise into a structured HTTP error response.
- **`src/modules/addresses/routes.ts`** — registers `getAddresses` as the handler for the `GET /account/addresses` route (and applies `isAuth` middleware upstream).
- **`src/types/index.ts`** — defines the `AddressesResponse` type used as the generic parameter of `successResponse`.

## Notes

- The non-null assertion (`request.authContext!`) relies on the `isAuth` middleware having already populated auth context; the controller does no auth check of its own.
- Per the file comment, the sibling write controllers (`post-address.ts`, `update-address.ts`, `delete-address.ts`) all return this same whole-book view, so clients never need a separate re-read after a mutation.
- Error handling is fully delegated to `catchAs` with the operation label `'listAddresses'` — no inline try/catch or status-code logic lives here.
