---
source: src/modules/payments/controllers/get-order-payments.ts
source_sha256: 27dc73a699de28284af82ca9d7bcfcead72826c727d6d4ec69d2e3b964182c2f
context_sha256: f3cbcfc5005faa4e715958e4cd5eb97f9bc13c5d8b666a955e7e9de656aab6e7
generated_at: 2026-11-22T06:41:02.832859+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-order-payments.ts

## Purpose
Express controller for `GET /orders/:id/payments`. It returns the payments of an order so the order page's payment panel can reload mid-flow and find the existing intent and its status instead of starting over. An order nobody has started paying returns `{ items: [] }`. A 404 is returned only for an order the caller cannot see.

## Key elements
- `getOrderPayments(request, response)`: the only export. It does the following:
  - Validates the `:id` param with `requireId`, using the `orders.not-found` key for a missing or invalid id. If there is no id it returns early, because `requireId` has already responded.
  - Calls `paymentService.listForOrder(orderId, request.authContext)`.
  - If `refused(response, result)` reports a refusal, it stops. Otherwise it sends `result.data` through `successResponse<OrderPaymentsResponse>`.
  - Unexpected errors go to `catchAs(response, 'getOrderPayments')`.
- The handler always returns a Promise, either `Promise.resolve()` on the early exit or the service promise chain.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which parses the route id and sends the not-found response.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which writes the success payload.
- `src/infrastructure/http/controller.ts`: provides `refused`, which checks the service result and responds if it was refused, and `catchAs`, the error handler for the promise chain.
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `listForOrder` does the lookup and the caller-visibility check.
- `src/types/index.ts`: provides the `OrderPaymentsResponse` type (imported via `@types`).
- `src/modules/payments/order-routes.ts`: the neighbor that wires this handler to the route. The handler file itself does not show the registration.

## Notes
- The controller contains no authorization or lookup logic. It passes `request.authContext` to the service, and the service result decides whether the response is refused.
- The "404 only for an order the caller cannot see" rule is implemented outside this file, in the service and the `refused` helper.
