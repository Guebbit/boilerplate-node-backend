---
source: src/modules/delivery/controllers/patch-shipment.ts
sha256: be897a5fa5b67fe5ff7eef70be82a4a748d17b0733a7aa6a215a98f1ba4ba2f8
generated_at: 2026-11-14T19:37:51.128731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/patch-shipment.ts

## Purpose

HTTP handler for `PATCH /delivery/shipments/:id`. It lets staff correct a shipment's tracking code by validating the request, delegating to the delivery service, and returning the updated `Shipment`.

## Key elements

- **`patchShipment`** — The sole export. Signature: `(request: Request<{ id?: string }>, response: Response) => Promise<void> | void`. Steps:
  1. Extracts and validates the `:id` param via `requireId`.
  2. Parses the body against `UpdateShipmentBody` (Zod schema from `@api/schemas.zod`).
  3. Calls `deliveryService.editShipmentTracking(id, trackingCode, authContext, callerContext)`.
  4. On success, responds with the `Shipment` payload via `successResponse`; on service refusal, calls `refused`; on unexpected error, hands off to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for request parsing, service-refusal formatting, and error mapping.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for extracting and validating the route parameter.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to pull the authenticated caller context forwarded to the service layer.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`src/modules/delivery/services/index.ts`** — Source of `deliveryService`; the handler calls `editShipmentTracking` on it.
- **`src/modules/delivery/routes.ts`** — Registers `patchShipment` on the `PATCH /delivery/shipments/:id` route.
- **`src/types/index.ts`** — Source of the `Shipment` type used in the response generic.

## Notes

- **No `If-Match` / optimistic concurrency.** The module docstring and the function comment both state this is intentional: only one mutable field (tracking code) is in play, so last-write-wins is acceptable.
- **Synchronous signature, async body.** The function is not `async`; it either returns `Promise.resolve()` (early-exit on validation failure) or returns the service Promise chain. Route middleware that expects a thenable still works because both branches are thenables.
- **Auth context is passed through, not consumed here.** `request.authContext` and `callerContextOf(request)` are forwarded to the service; this controller does no authorization checks of its own.
