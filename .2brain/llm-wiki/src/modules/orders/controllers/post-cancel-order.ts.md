---
source: src/modules/orders/controllers/post-cancel-order.ts
source_sha256: 2817fa8defea79d3b720ef9db9450f9e50fbee1626eba4d8d44a025479d6fb5b
context_sha256: cda44a0727528165b0a6d717a2ecf284b1e0325123de2e200f960a674b74d834
generated_at: 2026-11-22T06:09:27.920732+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose
Express controller for `POST /orders/:id/cancel`, the one order write a customer can make. It is thin wiring: it validates the id and body, then delegates to `orderService.cancelOnRequestById`, which scopes the write to the caller.

## Key elements
- `postCancelOrder(request, response): Promise<void>` — the exported handler.
  - Validates the id with `requireId`. A malformed id answers as `orders.not-found`, before the body is read.
  - Parses the body with `parseBody(CancelOrderByIdBody, request.body ?? {}, response)`.
  - Calls `orderService.cancelOnRequestById(id, authContext, { refund: body.refund }, callerContextOf(request))`.
  - If `refused(response, result)` is true, it stops. Otherwise it responds via `respondWithOrder(response, result.data, authContext, 'postCancelOrder')`.
  - Unexpected errors go through `.catch(catchAs(response, 'postCancelOrder'))`.

## Relationships
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`) supplies `parseBody`, `refused` and `catchAs`, which handle body validation, refused service results and error responses.
- `@infrastructure/http/ids` (`src/infrastructure/http/ids.ts`) supplies `requireId`, which validates the `:id` param.
- `@infrastructure/http/request` (`src/infrastructure/http/request.ts`) supplies `callerContextOf`, which builds the caller context passed to the service.
- `./respond` (`src/modules/orders/controllers/respond.ts`) supplies `respondWithOrder`, which writes the successful response.
- `../services` (`src/modules/orders/services/index.ts`) supplies `orderService`, which enforces the cancellation rules.
- `@types` (`src/types/index.ts`) supplies the `CancelOrderRequest` type.
- `src/modules/orders/routes.ts` is the route wiring for this handler.

## Notes
- The body is optional. Express leaves `request.body` undefined when there is nothing to parse, so the controller substitutes `{}`. The schema's default (`CancelOrderByIdBody`) then turns that into `refund: true`.
- The body is parsed rather than read raw because `refund` decides whether money goes back, and a raw `"false"` string would be truthy.
- Authorization rules live in the service, not here. A non-admin can only cancel their own order, from the statuses the lifecycle allows a customer. An admin can cancel any order. `refund` is only honored for admins, and a customer's cancel is always refunded.
- `request.authContext!` is a non-null assertion that relies on the `isAuth` middleware having run earlier.
- Validation failures return `Promise.resolve()` early, after the helper has already written the response.
