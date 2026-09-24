---
source: src/modules/payments/controllers/post-payment-intent.ts
sha256: c29dac1de4c8b76692c856f14f62609b0dd39f0875e3b6d9689535adf2e64455
generated_at: 2026-09-23T19:17:14.791206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-intent.ts

## Purpose

Thin Express controller for `POST /payments/intent`. It validates the request body, delegates to the payment service to freeze an order's price and open a payment intent at the provider, and returns the resulting `Payment` object (including a transient `clientSecret`) with a `201`. All business rules—ownership, the `pending` gate, amount resolution—live in the service; this file performs no audit, analytics, or domain logic.

## Key elements

- **`postPaymentIntent(request, response)`** (exported) — The sole handler. Parses `request.body` against `CreatePaymentIntentBody` (Zod), calls `paymentService.createIntent(orderId, authContext)`, and either refuses, returns the 201 success, or catches the error.

## Relationships

- **`@infrastructure/http/controller`** — Supplies the three helpers used here: `parseBody` (schema validation + early-exit), `refused` (uniform 4xx/409 handling), and `catchAs` (centralized error→status mapping).
- **`@infrastructure/http/response`** — `successResponse` wraps the payload into the module's standard envelope.
- **`../services`** (payments service barrel) — Exposes `paymentService.createIntent`, which owns all domain logic and serializes the response body (including `clientSecret`).
- **`src/modules/payments/routes.ts`** — Registers `postPaymentIntent` on the `POST /payments/intent` route.
- **`@types`** — Imports the `Payment` type used as the generic on `successResponse`.

## Notes

- `clientSecret` appears only in this endpoint's response. It is never logged, never persisted, and is the one field the standard `Payment` document does not carry.
- The service (not the controller) serializes the result because of that extra field—the controller passes `result.data` through unchanged.
- No audit or analytics calls here by design; those fire on the confirm step, not on intent creation.
- Returns **201**, not 200, signalling resource creation.
