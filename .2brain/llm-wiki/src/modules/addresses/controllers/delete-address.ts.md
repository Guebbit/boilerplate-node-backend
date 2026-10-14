---
source: src/modules/addresses/controllers/delete-address.ts
sha256: e5be4a057ae1992822b79a49f20d90fee00e093951f28541e00d7bad423e7c2e
generated_at: 2026-10-14T14:50:56.102781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/delete-address.ts

## Purpose

Thin HTTP adapter for the `DELETE /account/addresses/:addressId` endpoint. It validates the URL parameter, delegates the actual removal to the domain service (`addressRemove`), and translates the service result into a well-formed HTTP response. It contains no business logic of its own.

## Key elements

- **`deleteAddress(request, response)`** — The sole export. Reads the authenticated user's `id` from `request.authContext`, extracts and validates the `addressId` path param, calls `addressRemove`, then sends a `200` success (or short-circuits on refusal) with the full updated address list.

## Relationships

- **`src/modules/addresses/routes.ts`** — Registers this handler on the `DELETE /account/addresses/:addressId` route (implied by the JSDoc contract).
- **`src/modules/addresses/service.ts`** — Source of the `addressRemove(id, addressId)` domain call this controller delegates to.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which parses and validates the `addressId` route param, short-circuiting with a 404 if absent.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, used to emit the final `200` with the `AddressesResponse` body.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` (checks whether the service result is a refusal and sends the appropriate error) and `catchAs` (catches unexpected errors and maps them to a 500).
- **`src/types/index.ts`** — Supplies the `AddressesResponse` type that constrains the response payload.

## Notes

- Auth is **not** checked here; it is guaranteed by an upstream `isAuth` middleware. The non-null assertion on `request.authContext!` relies on that invariant.
- The response always returns the **full** address list (not just the deleted entry), so the client can see which entry, if any, received the `default` flag after removal.
- The service owns the "promote oldest to default" rule; this controller never touches that logic.
- Error handling is split: domain-level refusals go through `refused`, and unexpected throws fall into `catchAs(response, 'deleteAddress')`, which logs under that tag.
