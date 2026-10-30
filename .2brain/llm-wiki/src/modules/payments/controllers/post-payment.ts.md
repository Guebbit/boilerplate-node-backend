---
source: src/modules/payments/controllers/post-payment.ts
sha256: 2262d21c24ad017ea633919ec6cbcabfdc425eb7922780a43533750be365a010
generated_at: 2026-10-29T05:04:22.300772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment.ts

## Purpose

Thin HTTP handler for `POST /payments`. It validates the request body, delegates to `paymentService.createIntent`, and returns the payment intent. Deliberately contains no business logic, auditing, or analytics — an intent is preparation, not a business event; those concerns fire at confirm time.

## Key elements

- **`postPayment(request, response)`** — exported handler. Parses the body against `CreatePaymentBody`, calls `paymentService.createIntent(orderId, authContext)`, then responds via `createdOrOk`.
- **`parseBody(CreatePaymentBody, …)`** — early-exit validation; returns `null` and a 400 if the body fails the Zod schema.
- **`refused(response, result)`** — inspects the service result; if the service signalled refusal, it writes the error response and the handler stops.
- **`createdOrOk<Payment>(response, data, status, location)`** — sends `201` (new intent) or `200` (refreshed existing one) with a `Location` header.
- **`catchAs(response, 'postPayment')`** — wraps the async chain; maps thrown errors to HTTP responses.

## Relationships

- **`@infrastructure/http/controller`** — source of `catchAs`, `parseBody`, and `refused` (shared handler utilities).
- **`@infrastructure/http/response`** — source of `createdOrOk` (status-aware JSON writer).
- **`@types` (`src/types/index.ts`)** — provides the `Payment` type used as the response payload.
- **`../services` (`src/modules/payments/services/index.ts`)** — the controller's sole business-logic dependency; calls `paymentService.createIntent`.
- **`../routes` (`src/modules/payments/routes.ts`)** — registers `postPayment` as the `POST /payments` route handler.

## Notes

- **`clientSecret`**: this is the only endpoint in the payments module whose response carries that field. It is never logged, never persisted, and is serialized by the service (not the controller).
- **201 vs 200**: the service decides which status to return — `201` when a new payment row is inserted, `200` when an existing pending intent is refreshed. The controller just passes `result.status` through.
- **No audit/analytics**: by design. Those hooks belong to the confirm endpoint, not the intent-creation step.
