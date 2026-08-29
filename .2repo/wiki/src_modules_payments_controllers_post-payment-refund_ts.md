# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

Controller handler for `POST /payments/order/:orderId/refund`. It triggers a standalone monetary refund for an order **without** altering the order's status. The separation from order-cancellation is deliberate: it lets an operator refund money alone, while a client-side "cancel and refund" is expressed as two separate calls (this endpoint + the cancel endpoint).

## Key elements

- **`postPaymentRefund(request, response)`** — exported async-style handler. Extracts `orderId` from the route param, calls `paymentService.refundByOrder(orderId, request.authContext)`, then branches:
  - `refused(response, result)` — if the service signals a refusal (not an exception), writes the refusal response and returns early.
  - `successResponse(response, result.data, 200, result.message)` — standard 200 success on the happy path.
  - `.catch(catchAs(response, 'postPaymentRefund'))` — catches thrown errors and formats them via the shared error helper, tagged with the handler name for logging.

## Relationships

- **`src/modules/payments/service.ts`** — `paymentService.refundByOrder` performs the actual refund logic; this controller is its thin HTTP wrapper.
- **`src/modules/payments/routes.ts`** — registers this handler on the `POST /payments/order/:orderId/refund` route (admin-only per the doc comment).
- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (error → HTTP) and `refused` (domain-level refusal → HTTP) helpers used here.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 path.

## Notes

- Refusal is a **domain outcome**, not an exception: the service resolves with a refusal result rather than throwing, and the controller checks for it *before* sending a success response.
- The handler never mutates order status. If a caller needs "cancel and refund," they must issue the cancel endpoint in addition to this one.
- `catchAs` is given the literal string `'postPaymentRefund'`, likely used as a log/trace identifier for the originating call site.
