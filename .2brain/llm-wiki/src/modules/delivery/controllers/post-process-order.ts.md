---
source: src/modules/delivery/controllers/post-process-order.ts
sha256: 5a924e11e30bfe279a85f52b25217eb537f8ad297fb6b93d587da72f1e9ff137
generated_at: 2026-11-08T05:27:49.444029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-process-order.ts

## Purpose

HTTP handler for `POST /orders/:id/process`. It is the single entry point that transitions a paid order into the `processing` state (i.e., staff has begun fulfillment). It runs before any parcel exists, distinguishing it from later parcel-recording endpoints.

## Key elements

- **`postProcessOrder(request, response)`** — The sole export. Validates the `:id` route param via `requireId`, delegates to `deliveryService.processOrder`, and either returns the resulting `Order` via `successResponse` or short-circuits with a refusal/404. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param; on failure it sends a 404 (with i18n key `delivery.order-not-found`) and the handler bails out early.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.processOrder(orderId, authContext, callerContext)` performs the actual state transition; this controller contains no business logic.
- **`src/infrastructure/http/controller.ts`** — `refused` checks the service result for an expected rejection (e.g., wrong status) and writes the error response; `catchAs` maps unexpected exceptions to a standard error shape.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the `Order` payload with the correct status code.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls audit/trace metadata off the request for the service call.
- **`src/types/index.ts`** — Provides the `Order` interface used as the generic on `successResponse`.
- **`src/modules/delivery/order-routes.ts`** — Registers this handler on the `POST /orders/:id/process` route.

## Notes

- The early-return pattern (`if (!orderId) return Promise.resolve()`) is intentional: `requireId` has already written the 404 response, so the handler must not continue into the service call.
- `request.authContext` is read directly (not via a helper) and passed to the service — it is expected to be populated by an upstream auth middleware.
- The module doc-comment explicitly positions this as the *only* transition from `paid → processing`; any other code path that sets `processing` would bypass the intended state-machine guard.
