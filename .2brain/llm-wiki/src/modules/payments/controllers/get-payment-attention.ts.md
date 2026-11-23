---
source: src/modules/payments/controllers/get-payment-attention.ts
source_sha256: 8335a3dc86f335d4b1440e44d493ccc5f2d1353b4353aa62c0d57ab57a981e19
context_sha256: 24e77855f1adad53ed5b4c751555563cb078560d40e7c706b38dc4245e9b91b7
generated_at: 2026-11-22T06:41:07.165660+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-payment-attention.ts

## Purpose
Express controller for `GET /payments/attention`. It returns the payments items that still need human attention: stale, refused, reversed and over-refunded refunds, refunds owed by hand, and open disputes. The controller only delegates to the payment service and wraps the outcome in the standard HTTP response.

## Key elements
- `getPaymentAttention(_request, response)`: the only export. It calls `paymentService.listAttention()` and sends the result with `successResponse(response, result)`. Any rejection goes to `catchAs(response, 'getPaymentAttention')`. The request object is unused.

## Relationships
- `src/modules/payments/services/index.ts`: supplies `paymentService`. The controller calls its `listAttention()` method, and that method holds the logic for what counts as needing attention.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which writes the success payload to the response.
- `src/infrastructure/http/controller.ts`: supplies `catchAs`, which handles errors and is given the handler name `'getPaymentAttention'`.
- `src/modules/payments/routes.ts`: the route module that exposes this handler on `GET /payments/attention`. It does not appear in the file's imports.

## Notes
- The handler is a promise chain (`.then`/`.catch`) rather than `async/await`. It returns the promise.
- It takes no query, params or body, so there is no input validation or filtering in this file.
