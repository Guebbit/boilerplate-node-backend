---
source: src/modules/payments/controllers/post-payment-confirm.ts
source_sha256: 74797b4c9dadf6314ebf7d50051b97bb3c063c3dd1b6b68494b3a57e7fda5834
context_sha256: a4b6c5485eb37ae2e189b49783e1f51ec183989c620c2d05b897056df36a195e
generated_at: 2026-11-22T06:41:58.119584+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose
Express controller for `POST /payments/:id/confirm`, the payment form's submit step where the browser-tokenised payment method is handed to the payment service. It maps the service result to an HTTP response, and records metrics and a decline flag for outcomes that matter operationally (declines are reported as 409 but still counted and audited; in-flight results return 200).

## Key elements
- `postPaymentConfirm(request, response)`: the exported handler. Flow:
  1. `requireId` extracts the payment id (not-found key `payments.not-found`).
  2. `parseBody(ConfirmPaymentBody, ...)` validates the body.
  3. Calls `paymentService.confirmPayment(paymentId, body.paymentMethodRef, request.authContext, callerContextOf(request))`.
  4. Sets `request.paymentConfirmDeclined` and increments `paymentConfirmTotal`.
  5. Calls `refused(response, result)` and stops if the result was refused.
  6. Otherwise calls `paymentService.presentWithActions(...)` and responds with `successResponse<Payment>(response, payment, 200)`.
  7. Any rejection goes to `catchAs(response, 'postPaymentConfirm')`.
- Decline detection: a failed result whose `errors` include `ERROR_CODES.PAYMENT_DECLINED`.
- Metric labels on `paymentConfirmTotal` (`outcome`):
  - `succeeded`: result succeeded and `data.status === 'succeeded'`.
  - `in_flight`: any other successful status, such as `requires_action` or `processing`.
  - `declined`: a decline error.
  - Other failures (not-found, race rejections) are not counted.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`.
- `src/infrastructure/http/ids.ts`: provides `requireId`.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`.
- `src/infrastructure/http/response.ts`: provides `successResponse`.
- `src/modules/payments/metrics.ts`: provides the `paymentConfirmTotal` counter.
- `src/modules/payments/services/index.ts`: provides `paymentService` (`confirmPayment`, `presentWithActions`).
- `src/types/index.ts`: provides the `Payment` type.
- `src/modules/payments/routes.ts`: the route that presumably mounts this handler. The file itself doesn't show the wiring.

## Notes
- `request.paymentConfirmDeclined` is set on every non-early-exit result, before the refusal check. Per the file's comments, a decline-budget limiter reads it so it spends its budget only on genuine declines, not on the route's other 409 responses.
- The decline is counted before `refused` runs, so a declined payment is both counted and reported as a 409 `PAYMENT_DECLINED`.
- Successful responses include the payment's `actions` via `presentWithActions`. The payment form replaces its stored payment with this answer, so omitting them would hide the next step (finish at provider).
- The handler returns early without a response value after `requireId` or `parseBody` fails. Those helpers are expected to have already written the error response.
