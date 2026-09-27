---
source: src/modules/delivery/controllers/post-start-order.ts
sha256: 820cc35577dd87439f4612135c2326128fb947e87bca86b3b5d161890a0da564
generated_at: 2026-09-27T14:49:30.409523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-start-order.ts

## Purpose

Thin HTTP controller for `POST /delivery/order/:orderId/start`. It is the single entry point that transitions an order from `paid` to `processing` before any parcel record exists. All domain logic is delegated to the delivery service; this file only wires the request context through and shapes the response.

## Key elements

- **`postStartOrder`** (exported const) – Accepts an Express `Request<{ orderId?: string }>` and `Response`. Calls `deliveryService.startFulfilment(orderId, authContext, callerContext)`, then either short-circuits via `refused` or returns the `Order` payload through `successResponse`. Errors are funnelled into `catchAs(response, 'postStartOrder')`.

## Relationships

- **`src/modules/delivery/service.ts`** – Calls `deliveryService.startFulfilment`; the actual state-transition logic lives there.
- **`src/modules/delivery/routes.ts`** – Expected to register `postStartOrder` on the `POST /delivery/order/:orderId/start` path.
- **`src/infrastructure/http/controller.ts`** – Supplies the `catchAs` and `refused` helpers used for uniform error/refusal handling.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which extracts the authenticated caller's context from the request.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, the standard JSON success envelope.
- **`src/types/index.ts`** – Provides the `Order` type used as the generic parameter of `successResponse`.

## Notes

- The route param is typed as optional (`orderId?: string`) yet is coerced with `String(request.params.orderId)` before being passed onward — the controller assumes the value is always present at runtime.
- `request.authContext` is accessed directly (not via a helper), implying an Express type augmentation lives elsewhere.
- The function uses a `.then()/.catch()` promise chain rather than `async/await`, matching the project's controller convention.
