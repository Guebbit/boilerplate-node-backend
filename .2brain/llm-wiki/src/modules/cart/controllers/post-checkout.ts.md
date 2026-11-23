---
source: src/modules/cart/controllers/post-checkout.ts
source_sha256: a070ef80a4d186b1d3a9ead4109561305c4f9dd6bef12db59e9e34abd1d61910
context_sha256: 82041f6059586d2538d6bb39223e53a360d153372f84cdbab85ccc95eb8a2ec2
generated_at: 2026-11-22T04:31:21.805395+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/post-checkout.ts

## Purpose
HTTP controller for `POST /cart/checkout`. It is a thin Express adapter over `cartService.orderConfirm`: it converts the caller's cart into an order, clears the cart, and responds with the created order. It also records the `cart_checkout_total` business metric on every outcome.

## Key elements
- `postCheckout(request, response)` — the only export. Flow:
  1. Reads `userId` from `request.authContext!.id`.
  2. Validates `request.body` with `parseBody(CheckoutBody, ...)`. The body is required because it carries `expectedTotal`. A missing or malformed body answers 422, and the handler returns early.
  3. Calls `cartService.orderConfirm(userId, callerContextOf(request), body)`.
  4. Increments `cartCheckoutTotal` with `status: 'success'` or `'failure'` based on `result.success`.
  5. Calls `refused(response, result)`, which handles a failed result and stops the handler.
  6. On success, calls `orderService.withActions(result.data, request.authContext)` to build the wire-shape order. It then calls `answerAsResource(response, result.data, '/orders/<id>')` and `createdResponse<Order>(response, order, '/orders/<id>')`.
  7. `.catch` increments `cartCheckoutTotal` with `status: 'failure'`, then delegates to `catchAs(response, 'postCheckout')(error)`.

## Relationships
- `../services` (`cartService`) — supplies `orderConfirm`, which does the checkout.
- `@modules/orders` (`orderService`) — `withActions` turns the order document into the response shape.
- `../metrics` — provides the `cartCheckoutTotal` counter.
- `@infrastructure/http/controller` — provides `parseBody`, `refused` and `catchAs`.
- `@infrastructure/http/response` — provides `createdResponse`, which sends the 201.
- `@infrastructure/http/preconditions` — provides `answerAsResource`.
- `@infrastructure/http/request` — provides `callerContextOf`.
- `@types` — provides the `Order` type.
- `src/modules/cart/routes.ts` is a graph neighbor. This file does not import it, so the route registration there presumably wires this handler to the endpoint.

## Notes
- The metric increments once per call, before `refused()`, so failed checkouts are counted too. A thrown error is also counted as a failure.
- `withActions` is used instead of a bare `.toJSON()` because it resolves each line's live `current` picture, which `.toJSON()` would leave off.
- The 201 response mirrors `POST /orders`: it carries the order resource and its `Location` path `/orders/<id>`, and the confirmation copy goes in the envelope's `message`.
- `request.authContext` is non-null asserted (`!`). The handler assumes an authentication middleware has already run.
