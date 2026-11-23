---
source: src/modules/payments/controllers/post-order-payment.ts
source_sha256: 35abf273766a7a74b57f357abe338851de54f57474abfa2e661f51c977400de6
context_sha256: 359d84fc78cb5c485a0af84bdc7a6c722b7a4f09d022f236b429d350872a0f69
generated_at: 2026-11-22T06:41:43.067853+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-order-payment.ts

## Purpose
Express controller for `POST /orders/:id/payments`. It lets an admin record a payment the card provider never saw (an offline payment). The route restricts it to admins via the `create:Payment` permission. Audit and analytics events are fired by the service once settlement lands, not by this controller.

## Key elements
- `postOrderPayment(request, response)`: the exported handler. It does the following, in order:
  1. Validates the `:id` param with `requireId`. A bad id produces the `payments.order-not-found` error.
  2. Parses the body with `parseBody(RecordOrderPaymentBody, ...)`.
  3. Calls `paymentService.recordOfflinePayment(orderId, body, callerContextOf(request))`.
  4. If the result is refused, it returns early via `refused(response, result)`.
  5. Otherwise it decorates the payment with `paymentService.withActions(result.data, undefined, request.authContext)`.
  6. It responds with `createdOrOk<Payment>(response, payment, result.status, '/payments/<id>')`.
  7. Any rejection is handled by `catchAs(response, 'postOrderPayment')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle body validation, service refusals and error mapping.
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the order id from the request.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdOrOk` sends the 201 or 200 response with a `/payments/:id` location.
- `src/modules/payments/services/index.ts`: provides `paymentService`, which supplies `recordOfflinePayment` and `withActions`.
- `src/types/index.ts`: provides the `Payment` type (imported via `@types`).
- `src/modules/payments/order-routes.ts`: wires this handler to the route, per the module doc's route and permission description.

## Notes
- The status code comes from the service: 201 when a row was inserted, and 200 when the call converted an unpaid card intent's row.
- `withActions` is called with `undefined` instead of an order. Only a `succeeded` payment comes back from this path, so `pay` is always false and no order read is needed to compute `actions`.
- The handler returns early without a value after `requireId` or `parseBody` fail, because those helpers have already written the response.
- The request body schema `RecordOrderPaymentBody` is imported from `@api/schemas.zod`.
