# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

HTTP controller handler for `POST /payments/:id/confirm`. Receives a card confirmation from the dialog, delegates to the payment service, records the outcome metric, and returns a success or refusal response. This is the endpoint where the actual charge is attempted and where decline/success events are audited.

## Key elements

- **`postPaymentConfirm`** (exported) — The sole handler. Validates the body against `ConfirmPaymentBody`, calls `paymentService.confirmPayment`, increments the `paymentConfirmTotal` metric, and dispatches either a `refused` or `successResponse` reply. Catches unhandled rejections via `catchAs`.
- **Decline detection** — After the service returns, a decline is identified by checking whether any error code equals `PAYMENT_DECLINED`. Declines are reported as a 409 refusal but are still counted in the metric (unlike not-found or race rejections, which are skipped).

## Relationships

- **`@infrastructure/http/controller`** — Supplies `parseBody` (schema validation short-circuit), `refused` (409 refusal writer), and `catchAs` (error-boundary catch wrapper).
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the caller's identity/metadata passed into the service call.
- **`@infrastructure/http/response`** — `successResponse` writes the 200 success payload.
- **`../metrics`** — `paymentConfirmTotal` is the Prometheus counter incremented per confirmed outcome (`succeeded` | `declined`).
- **`../service`** — `paymentService.confirmPayment` performs the actual charge; this controller is a thin orchestration layer over it.
- **`../routes`** — Registers `postPaymentConfirm` on the `POST /payments/:id/confirm` route.

## Notes

- **Metric scope is intentional.** The comment in the source is explicit: not-found and race-condition rejections are *not* confirm attempts and are excluded from `paymentConfirmTotal`. Only `result.success === true` or an explicit `PAYMENT_DECLINED` error code increments the counter.
- **Decline ≠ error path.** A decline still flows through `refused()` (409), so downstream callers see it as a refusal, but the metric label is `declined` rather than `succeeded`. Audit rows are written by the service, not this controller.
- **Route param is optional-typed.** `request.params.id` is typed as `string | undefined`; the handler unconditionally wraps it with `String()`. In practice the route pattern guarantees a value, but the type does not.
