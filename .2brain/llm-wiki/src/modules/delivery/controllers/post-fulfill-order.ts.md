---
source: src/modules/delivery/controllers/post-fulfill-order.ts
sha256: a4fa08a9a018a93b1996922a80b6cf42f0a592ca04b44ff47f8ad7bf09ac5ae3
generated_at: 2026-09-27T14:49:21.900766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-fulfill-order.ts

## Purpose

Handles `POST /delivery/order/:orderId/fulfill`. Marks a digital-only order as fulfilled, transitioning it from `processing` to `delivered` without creating any parcel record. This is the fulfillment path for orders that have nothing physical to ship (e.g. software, licenses), as an alternative to the `ship`/`deliver` flow.

## Key elements

- **`postFulfillOrder(request, response)`** — The sole export. A thin HTTP handler that:
  - Extracts `orderId` from route params and the caller context from the request.
  - Delegates to `deliveryService.fulfillOrder`.
  - Responds with the resulting `Order` on success, or handles refusal/error via shared controller helpers.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (unified error → HTTP mapping) and `refused` (short-circuit for domain refusals like wrong state).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts authenticated-actor metadata from the Express request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 2xx JSON envelope wrapper.
- **`src/modules/delivery/service.ts`** — Supplies `deliveryService.fulfillOrder`, the business-logic call this controller wraps.
- **`src/modules/delivery/routes.ts`** — Registers `postFulfillOrder` at the `POST /delivery/order/:orderId/fulfill` path.
- **`src/types/index.ts`** — Source of the `Order` type used as the response payload.

## Notes

- The `orderId` param is typed `orderId?: string` and coerced with `String()` before being passed to the service; a missing param will produce `"undefined"` rather than a 400.
- This endpoint intentionally bypasses any parcel/shipping side-effects — it is the "no-physical-goods" fulfillment path only.
- The handler is written as a promise chain (`.then`/`.catch`) rather than `async/await`, consistent with the other controllers in this module.
