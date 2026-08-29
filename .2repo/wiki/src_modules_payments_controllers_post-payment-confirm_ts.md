# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

HTTP handler for `POST /payments/:id/confirm`. It validates the card-number body, delegates to the payment service to actually move money, records the outcome in a Prometheus counter, and translates the service result into either a success (200) or refusal (409) response. It exists as the thin HTTP-to-service boundary so that routing, validation, metrics, and error-shaping are separate from the domain logic in `service.ts`.

## Key elements

- **`postPaymentConfirm(request, response)`** — the sole export. Parses the body against `ConfirmPaymentBody` (Zod), calls `paymentService.confirmPayment`, increments `paymentConfirmTotal` for *succeeded* or *declined* outcomes only, then maps the result to a response via `refused` or `successResponse`. Catches unhandled rejections with `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the three controller helpers: `parseBody` (schema validation), `refused` (error → 409/4xx mapping), and `catchAs` (unified error handler).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller identity forwarded to the service for audit logging.
- **`src/infrastructure/http/response.ts`** — `successResponse` writes the 200 JSON envelope.
- **`src/modules/payments/metrics.ts`** — `paymentConfirmTotal` counter is incremented with a `{ outcome }` label (`succeeded` | `declined`).
- **`src/modules/payments/service.ts`** — `paymentService.confirmPayment(paymentId, { cardNumber }, authContext, callerContext)` performs the actual charge; this controller does no domain logic itself.
- **`src/modules/payments/routes.ts`** — registers `postPaymentConfirm` on the `POST /payments/:id/confirm` path.

## Notes

- A **declined** card is *not* a server error. It produces a 409 refusal (`PAYMENT_DECLINED`) **and** increments the metric — intentionally, so the audit trail and dashboards can distinguish "our system failed" from "the issuer said no."
- `paymentConfirmTotal` is incremented **only** for `succeeded` and `declined`; any other error code (e.g. timeout, internal) skips the counter and falls through to `refused` / `catchAs`.
- The route param is typed `id?: string` (optional) but is always read via `String(request.params.id)`; treat it as required in practice.
- The handler uses an explicit `.then().catch()` chain rather than `async/await`; `catchAs` is the terminal error sink.
