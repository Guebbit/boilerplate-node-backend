---
source: src/modules/orders/controllers/post-cancel-order.ts
sha256: 7954e3df1d5fe08bde5697cf24cf8cc857d1f3fdaf2bee6199671f9ec6a98814
generated_at: 2026-09-23T19:00:46.627068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

Thin HTTP handler for `POST /orders/:id/cancel` — the only order write a customer is permitted to perform. It extracts the caller's identity and optional refund preference from the request, delegates the actual write to `orderService.cancelById`, then returns the updated order with its available actions.

## Key elements

- **`postCancelOrder`** *(exported function)* — The sole export. Accepts an Express `Request`/`Response`, calls `orderService.cancelById(orderId, authContext, { refund }, callerContext)`. On success, chains to `orderService.withActions(order, authContext)` and sends a `200` response with the `Order` and a message. On refusal or error, short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/modules/orders/services/index.ts`** — Imports `orderService`; all business logic (status guards, scope checks, refund rules) lives there.
- **`src/modules/orders/routes.ts`** — Registers `postCancelOrder` on the `POST /orders/:id/cancel` route (implied by the handler's shape and param usage).
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to derive the caller's context from the request for audit/scoping.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the success payload.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (error → HTTP mapping) and `refused` (early-return for rejected operations).
- **`src/types/index.ts`** — Imports `CancelOrderRequest` and `Order` for typed request body and response shape.

## Notes

- **Body is optional.** A customer's cancel sends no body; Express leaves `request.body` as `undefined` (not `{}`). The handler guards with `request.body?.refund`.
- **`refund` flag is admin-gated at the service layer.** The controller passes it through unconditionally; the service ignores it for non-admin callers (a customer's cancel is always refunded).
- **Single-responsibility by design.** No validation, no status checks, no status-code branching beyond the `refused` / `catchAs` helpers — all of that is in the service.
