---
source: src/modules/delivery/controllers/post-process-order.ts
sha256: d19c81cd7327b5f31e8e2c28118e37dcd5905a811b1e6794d8b3a2a3acbd8044
generated_at: 2026-10-29T03:32:25.582853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-process-order.ts

## Purpose

HTTP handler for `POST /orders/:id/process`. It is the single endpoint that transitions a paid order into the `processing` state (staff confirming fulfilment has started), called before any parcel record exists.

## Key elements

- **`postProcessOrder`** – Exported handler. Validates the `:id` route param via `requireId`, delegates to `deliveryService.processOrder(orderId, request.authContext, callerContextOf(request))`, then either short-circuits on a refused result or sends a `successResponse<Order>`. Errors are funneled through `catchAs(response, 'postProcessOrder')`.

## Relationships

- **`src/modules/delivery/services/index.ts`** – Imports `deliveryService`; the `processOrder` method performs the actual state transition.
- **`src/infrastructure/http/ids.ts`** – `requireId` extracts and validates the `:id` param, responding with a 404 (`delivery.order-not-found`) when absent.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` builds the caller context passed to the service layer.
- **`src/infrastructure/http/response.ts`** – `successResponse` formats the `Order` payload on success.
- **`src/infrastructure/http/controller.ts`** – `refused` handles service-level rejection (e.g. wrong state); `catchAs` maps thrown errors to an HTTP error response keyed by the `'postProcessOrder'` label.
- **`src/types/index.ts`** – Provides the `Order` interface used as the response payload type.
- **`src/modules/delivery/order-routes.ts`** – Registers `postProcessOrder` as the handler for the `POST /orders/:id/process` route.

## Notes

- The doc comment stresses this is *the* gate for `paid → processing`; there is no other path for this transition. Callers should not expect parcel-related fields in the response.
- `request.authContext` is accessed directly (a module augmentation on Express `Request`), so type-checking depends on the augmentation being in scope.
- Early-return on missing ID uses `Promise.resolve()` to keep the return type uniform (`Promise<void>`) without an extra branch in the caller.
