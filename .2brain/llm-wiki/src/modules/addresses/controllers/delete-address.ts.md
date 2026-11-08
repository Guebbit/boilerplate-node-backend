---
source: src/modules/addresses/controllers/delete-address.ts
sha256: bb6191a8293bddb7dca01ab5a0486b69b3efa6f56b587aeacfcc5956e7cc4ef5
generated_at: 2026-11-08T04:53:36.360483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/delete-address.ts

## Purpose

Thin HTTP adapter for `DELETE /account/addresses/:addressId`. Validates the path-param ID, delegates deletion to `addressService.remove`, and returns a bodyless `204 No Content` on success. Exists to keep Express request/response concerns out of the service layer.

## Key elements

- **`deleteAddress(request, response)`** (exported) — the sole handler. Extracts `id` from `request.authContext`, validates the `addressId` param via `requireId`, calls `addressService.remove(id, addressId)`, then either short-circuits with a refusal or sends `noContentResponse`. Errors are funneled through `catchAs(response, 'deleteAddress')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (unified error-to-response mapping) and `refused` (checks a service result for a "rejected" outcome and sends the appropriate 4xx).
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which validates the `addressId` path param (format + 404 via the `addresses.not-found` message) before the call proceeds.
- **`src/infrastructure/http/response.ts`** — provides `noContentResponse` (sends `204` with no body).
- **`src/modules/addresses/routes.ts`** — registers `deleteAddress` as the handler for the `DELETE /account/addresses/:addressId` route.
- **`src/modules/addresses/service.ts`** — `addressService.remove(id, addressId)` performs the actual deletion and ownership check; this file never touches the repository directly.

## Notes

- `request.authContext!` uses a non-null assertion that is safe only because `isAuth` middleware runs before this handler; there is no runtime guard here.
- The response intentionally carries **no body** (204). If the deleted address was the user's default, the repository promotes the oldest remaining entry, but the client must refetch the list to observe the change.
- The `refused` check sits between the service call and the success response, meaning an ownership mismatch (or similar policy rejection) is surfaced as an early return with an appropriate status code rather than an exception.
