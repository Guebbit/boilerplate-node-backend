---
source: src/modules/addresses/controllers/delete-address.ts
sha256: 109ad7c89dd1d3abd47e14f7c39c79d2346389d4c1ef890098f3aa8e84dfea1b
generated_at: 2026-09-23T18:19:28.140928+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/delete-address.ts

## Purpose

Thin HTTP adapter for `DELETE /account/addresses/:addressId`. Extracts the authenticated user ID and target address ID from the request, delegates all business logic to the `addressRemove` service, and translates the result into an Express response.

## Key elements

- **`deleteAddress`** – The sole export. An Express handler that:
    - Reads `id` from `request.authContext` and `addressId` from `request.params`.
    - Calls `addressRemove(id, addressId)` and inspects the returned result.
    - If the result is "refused," short-circuits via the `refused` helper.
    - Otherwise sends a `200` with the full `AddressesResponse` body (the complete list, not a bare deletion ack).
    - Catches any thrown error through the `catchAs(response, 'deleteAddress')` wrapper.

## Relationships

- **`src/modules/addresses/service.ts`** – Provides `addressRemove`, the single business-logic call this controller makes.
- **`src/infrastructure/http/controller.ts`** – Supplies the `refused` guard and the `catchAs` error-wrapper used in the then/catch chain.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, which serializes the payload with status code and optional message.
- **`src/types/index.ts`** – Provides the `AddressesResponse` type that parameterizes `successResponse`.
- **`src/modules/addresses/routes.ts`** – The route file that registers this handler on the `DELETE /account/addresses/:addressId` path (this controller is the endpoint it dispatches to).

## Notes

- The response intentionally returns the **full address list** (200 + body) rather than a 204, so the client can observe where the `default` flag landed after a default address is removed (promotion logic lives in `repository.ts`, not here).
- `request.authContext!` uses a non-null assertion; the file assumes an upstream `isAuth` middleware has already populated it. There is no defensive check in this handler.
- Error handling is delegated entirely to `catchAs`; no custom status codes or message shaping happens in this file beyond what that helper provides.
