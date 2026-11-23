---
source: src/modules/payments/controllers/post-payment.ts
source_sha256: d6cef3da03b34fe9001ccd22b892a8ff6b4c3368b80ebaf35ff309d9b1a1b449
context_sha256: 94ac3a554c6e524de3696b224aa3c9650cdfedfa1ccc8b1e9a530a5526d19ed7
generated_at: 2026-11-22T06:42:58.663591+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment.ts

## Purpose
Express controller for `POST /payments`. It takes an order ID, asks the payment service to freeze the order's price into a payment intent and open it at the provider, and returns the result so the client can confirm. The controller is deliberately thin. Ownership checks, the `pending` gate and the amount calculation all live in the service. It does no audit or analytics, because those fire on the confirm step, not on intent creation.

## Key elements
- `postPayment(request, response)`: the exported handler.
  - Validates `request.body` with `CreatePaymentBody` (from `@api/schemas.zod`) via `parseBody`. If validation fails, it returns without doing more, since `parseBody` is passed `response`.
  - Calls `paymentService.createIntent(body.orderId, request.authContext)`.
  - If `refused(response, result)` handles the result, it stops there.
  - Otherwise it calls `createdOrOk<Payment>` with `result.data`, `result.status` and the location `/payments/${result.data.id}`.
  - Any rejection goes to `catchAs(response, 'postPayment')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody` (body validation), `refused` (turns a refused service result into a response) and `catchAs` (error handler tagged with the handler name).
- `src/infrastructure/http/response.ts`: provides `createdOrOk`, which sends the success response and the location for the payment.
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `createIntent` holds the business logic.
- `src/types/index.ts`: provides the `Payment` type used as the response shape.
- `src/modules/payments/routes.ts`: the routes module that wires this handler to `POST /payments`.

## Notes
- The response carries `clientSecret`. It must never be logged or stored, and this is the only response in the payments module that has one.
- `result.data` is already in wire shape. The service serializes it, not the controller, because `clientSecret` is not a field of the stored document.
- The status is 201 when this request inserted the payment and 200 when it refreshed an existing one. The service decides which through `result.status`.
- The handler returns a promise chain rather than using `async/await`.
