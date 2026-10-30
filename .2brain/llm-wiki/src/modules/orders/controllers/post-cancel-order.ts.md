---
source: src/modules/orders/controllers/post-cancel-order.ts
sha256: 48c42ebf6f876ae3ae939eccc55bf16c5a2ee70f33c5facfeb3173f11b76763d
generated_at: 2026-10-29T04:38:49.097907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

Controller for `POST /orders/:id/cancel` — the single write a customer can perform on an order. It validates the request, extracts the caller's auth scope, and delegates the actual cancellation to `orderService.cancelOnRequestById`, then formats the response.

## Key elements

- **`postCancelOrder`** (exported) — Express handler that:
  - Resolves and validates the route `:id` via `requireId` (malformed → 404).
  - Parses the (optional) body through the `CancelOrderByIdBody` Zod schema; absent body defaults to `{ refund: true }`.
  - Reads `request.authContext` (populated upstream by auth middleware) and passes it plus `callerContextOf(request)` into the service call.
  - On success, calls `respondWithOrder`; on refusal or error, short-circuits via `refused` / `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/index.ts` | Imports `orderService`; calls `cancelOnRequestById(id, authContext, { refund }, callerContext)`. |
| `src/modules/orders/routes.ts` | Registers `postCancelOrder` on the `POST /orders/:id/cancel` route. |
| `src/infrastructure/http/controller.ts` | Imports `parseBody`, `refused`, `catchAs` for parsing and error/response helpers. |
| `src/infrastructure/http/ids.ts` | Imports `requireId` to extract and validate the `:id` param. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to build the caller-scoped context for the service. |
| `src/modules/orders/controllers/respond.ts` | Imports `respondWithOrder` to serialize the success payload. |
| `src/types/index.ts` | Imports the `CancelOrderRequest` type used in the Express handler signature. |

## Notes

- **Body is optional.** A customer cancellation sends no body; Express leaves `request.body` as `undefined` (not `{}`). The handler guards with `request.body ?? {}` before passing to the schema.
- **`refund` semantics.** The field is honored only for admin callers. A non-admin cancellation is always refunded regardless of the value sent. The schema default is `refund: true`.
- **Scope enforcement is in the service, not here.** This controller passes `authContext` and `callerContext` through; the service decides whether the caller is allowed to cancel the given order.
- **Auth context is asserted non-null** (`request.authContext!`) on the assumption that `isAuth` middleware always runs first on this route.
- **Malformed ID → 404, not 400.** A bad `:id` is answered as `orders.not-found` before the body is even read, avoiding a 400 for a non-existent resource.
