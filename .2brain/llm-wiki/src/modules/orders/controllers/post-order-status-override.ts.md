---
source: src/modules/orders/controllers/post-order-status-override.ts
sha256: 7abd163d9a67df879047f9bd76da7bc22d2f0e75e4ef45d6e4f8744e571ec82e
generated_at: 2026-10-15T11:00:18.759052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-status-override.ts

## Purpose

Thin controller for `POST /orders/:id/status-override`. It validates the order ID and request body, then delegates to `orderService.overrideStatus` to force an order into a new status with a recorded reason — with no parcel or email side-effects. Authorization (step-up-gated `orders.any.override`) is handled upstream by the route; this function assumes it has already passed.

## Key elements

- **`postOrderStatusOverride(request, response)`** — the sole export. Resolves the order ID, parses the body against `OverrideOrderStatusBody` (Zod schema), calls `orderService.overrideStatus(id, to, reason, callerContext)`, then either responds with the updated order or surfaces a refusal/error.

## Relationships

- **`src/modules/orders/routes.ts`** — registers this handler on the `POST /orders/:id/status-override` route and applies `requirePermission('orders.any.override')` before invocation.
- **`src/modules/orders/services/index.ts`** — provides `orderService.overrideStatus`, the business-logic target.
- **`src/modules/orders/controllers/respond.ts`** — provides `respondWithOrder`, the shared order-response serializer used after a successful override.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation), `refused` (early-exit on service refusal), and `catchAs` (error-to-HTTP mapping).
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which extracts and validates the `:id` param and short-circuits with a 404 on miss.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, extracting the authenticated actor's identity for the service call.
- **`src/types/index.ts`** — defines the `StatusOverrideRequest` body type used in the `Request` generic.

## Notes

- The controller performs **no** permission check itself; it relies entirely on the route middleware. Adding this handler to a new route without the permission guard would bypass step-up auth.
- `respondWithOrder` receives `request.authContext` (not `callerContextOf`) — the two may differ in shape; keep them in sync if refactoring.
- The "status-only" semantics (no parcel/email consequences) live in the **service** layer, not here. This file is pure wiring.
