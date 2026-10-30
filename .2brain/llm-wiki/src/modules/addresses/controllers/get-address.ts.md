---
source: src/modules/addresses/controllers/get-address.ts
sha256: 301b1cd8d42c7f4f429475b1388bde08c9c19edc556275eef7fad35a13212046
generated_at: 2026-10-29T03:07:39.354486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/get-address.ts

## Purpose

Thin Express HTTP adapter that serves `GET /account/addresses/:addressId`. It validates the route parameter, delegates to `addressService.get`, and shapes the response — separating HTTP concerns from the business logic in the service layer.

## Key elements

- **`getAddress`** (exported) — The sole handler. Reads the authenticated caller's `id` from `request.authContext`, validates the `addressId` path parameter, calls `addressService.get(id, addressId)`, and either sends a `200` with the `Address` payload or a `404` (via `refused`). Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/addresses/routes.ts`** — Registers `getAddress` as the handler for the `GET /account/addresses/:addressId` route (behind the `isAuth` middleware).
- **`src/modules/addresses/service.ts`** — Provides `addressService.get(callerId, addressId)`, the actual data-retrieval call.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which validates the `addressId` param and short-circuits with a 404 if it is malformed.
- **`src/infrastructure/http/controller.ts`** — Supplies `refused` (maps a service-level refusal to a 404) and `catchAs` (catches unhandled errors into a standard error response).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 200 JSON body.
- **`src/types/index.ts`** — Provides the `Address` type used to type the success payload.

## Notes

- The 404 is intentionally uniform: a foreign entry, an unknown id, and a malformed id all return the same status. This avoids leaking which entries exist for other users.
- `request.authContext` is asserted non-null (`!`) on the assumption that the `isAuth` middleware always runs first; no runtime guard is present.
- The early-return path for an invalid `addressId` resolves with `Promise.resolve()` rather than `undefined` to satisfy the handler's return-type contract.
