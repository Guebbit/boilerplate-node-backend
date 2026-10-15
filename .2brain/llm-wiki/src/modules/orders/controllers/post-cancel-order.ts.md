---
source: src/modules/orders/controllers/post-cancel-order.ts
sha256: f49d88e6f1e8725da6243305580531ae73e35a3b2ffa914cf7d52fc1c1ad98b1
generated_at: 2026-10-15T11:00:09.494581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

Thin Express controller for `POST /orders/:id/cancel`. It validates the route param and optional body, then delegates the write to `orderService.cancelById`, passing the caller's auth context so the service can scope permissions (own-order vs. any-order) and honor the `refund` flag only for admins.

## Key elements

- **`postCancelOrder(request, response)`** — The sole export. Handles the full request lifecycle: id extraction → optional-body parse → service call → response formatting → error mapping.

## Relationships

- **`src/modules/orders/routes.ts`** — Registers this handler at `POST /orders/:id/cancel`.
- **`src/modules/orders/services/index.ts`** — Provides `orderService.cancelById`, the actual write operation this controller delegates to.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (Zod validation), `refused` (rejection short-circuit), and `catchAs` (error → HTTP mapping).
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which extracts and validates `:id` from params, responding 404 early if malformed.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, extracting the auth context from the Express request for scoping.
- **`src/modules/orders/controllers/respond.ts`** — Supplies `respondWithOrder`, the shared serializer that shapes the 200 response payload.
- **`src/types/index.ts`** — Provides the `CancelOrderRequest` type used in the Express handler signature.

## Notes

- **Body is optional.** Customers send no body; Express leaves `request.body` as `undefined` (not `{}`), so the code passes `request.body ?? {}` before parsing.
- **Raw body would be unsafe.** A string `"false"` in `refund` is truthy; the Zod schema (`CancelOrderByIdBody`) enforces a proper boolean and defaults absent `refund` to `true`.
- **`refund` is admin-only in effect.** The controller always forwards it, but the service ignores it for non-admin callers (customer cancels are unconditionally refunded).
- **Id validation precedes body parsing.** A malformed `:id` returns 404 without ever touching the body, keeping the failure mode consistent with other route-param lookups.
