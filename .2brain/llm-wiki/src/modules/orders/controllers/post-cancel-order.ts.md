---
source: src/modules/orders/controllers/post-cancel-order.ts
sha256: ed8cd53e41e59225a242cb90ece72821d19d6c19224a1c75cfe80817c7427cf6
generated_at: 2026-09-27T15:07:49.020661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

HTTP controller for `POST /orders/:id/cancel`. It is a thin wiring layer that translates the incoming Express request into a call to `orderService.cancelById`, handling the caller's authentication scope, the optional `refund` body field, and the success/refusal response.

## Key elements

- **`postCancelOrder`** (default and only export) — async Express handler. Builds the service arguments (`id`, `authContext`, `{ refund }`, caller context), delegates to `orderService.cancelById`, then either short-circuits via `refused` or delegates success rendering to `respondWithOrder`. Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/orders/services/index.ts`** — imports `orderService`; the single business-logic call (`cancelById`) lives there.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to extract the authenticated caller context from the request.
- **`src/infrastructure/http/controller.ts`** — imports `refused` (determines whether the service result is a denial to relay) and `catchAs` (normalises thrown errors into an HTTP response).
- **`src/modules/orders/controllers/respond.ts`** — imports `respondWithOrder` to serialise the order result back to the client with the appropriate status code and message.
- **`src/modules/orders/routes.ts`** — registers this handler on the `POST /orders/:id/cancel` route.
- **`src/types/index.ts`** — imports the `CancelOrderRequest` type for the optional body shape.

## Notes

- The request body is **optional**: a customer's cancel typically sends none. Express leaves `request.body` as `undefined` (not `{}`), so the code uses `request.body?.refund` to avoid a crash.
- The `refund` flag in the body is a **caller's choice only honoured for admins**; a customer's cancel is always refunded regardless of what they send.
- The route's `:id` param is typed as `string | undefined` in the Express generic and cast with `String(...)` before being passed to the service.
- Success responses return HTTP 200 (not 204), and the `result.message` from the service is forwarded into the response body via `respondWithOrder`.
