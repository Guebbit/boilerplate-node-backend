---
source: src/modules/orders/controllers/post-order.ts
source_sha256: 948b2c3aa78d7f461d47a60aa877a893aee7412a4ba6aa042f328cfab3ab9859
context_sha256: 0cdba6048140ea136a2642999dd7abdf53f2df50e19cedc218685c05b7c2e8b6
generated_at: 2026-11-22T06:09:56.664825+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/post-order.ts

## Purpose
Express controller for `POST /orders`: an admin creates an order directly from an explicit payload (`userId`, `email`, `items` from the body), bypassing the cart. This distinguishes it from the checkout path in `@modules/cart`.

## Key elements
- `createOrder(request, response): Promise<void>` — the only export. Flow:
  1. Validates the body with `parseBody(CreateOrderBody, ...)`. If validation fails it returns early, since `parseBody` has already handled the response.
  2. Calls `orderService.create(userId, email, items, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it stops.
  4. Otherwise it increments `orderCreatedTotal` and responds with `respondWithOrder(..., 201)`.
  5. Any rejection goes to `catchAs(response, 'createOrder')`.

## Relationships
- `src/infrastructure/http/controller.ts` — provides `parseBody`, `refused` and `catchAs`, which handle validation, refused-result and error responses.
- `src/infrastructure/http/request.ts` — `callerContextOf(request)` builds the caller context passed to the service.
- `src/modules/orders/services/index.ts` — supplies `orderService`, whose `create` does the actual work.
- `src/modules/orders/metrics.ts` — supplies the `orderCreatedTotal` counter, incremented on success.
- `src/modules/orders/controllers/respond.ts` — `respondWithOrder` serializes the created order. It receives the `'createOrder'` label and the status code `201`.
- `src/types/index.ts` — source of the `CreateOrderRequest` type for the request body.
- `src/modules/orders/routes.ts` — the route wiring that mounts this handler. The handler itself does not reference it.

## Notes
- The confirmation mail is sent by `orderService.create`, not by this controller. The inline comment says it is a fact about the order, not the request (see `CallerContext.locale`).
- The handler returns a promise chain rather than using `async`/`await`. Validation failure returns `Promise.resolve()`.
- `CreateOrderBody` comes from `@api/schemas.zod`.
