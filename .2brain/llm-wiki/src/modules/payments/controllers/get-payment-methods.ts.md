---
source: src/modules/payments/controllers/get-payment-methods.ts
source_sha256: e31e1662236bb4cf540b9f0eb726036e34eea6e030d2c2cb7f2d3c844ceed410
context_sha256: 746fe27a17ee09bbaea7cb79a96190609112e34d76a7f750d1c6961b4fb13566
generated_at: 2026-11-22T06:41:10.916279+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-payment-methods.ts

## Purpose
Express controller for `GET /payments/methods`. It returns the payment methods the shop offers, so the frontend doesn't hard-code them. The endpoint is public, so guests can see checkout options before signing up.

## Key elements
- `getPaymentMethods(_request, response)`: the request handler. It calls `listPaymentMethods()` and sends `{ methods }` through `successResponse<PaymentMethodsResponse>`. It ignores the request.

## Relationships
- `src/modules/payments/config.ts`: supplies `listPaymentMethods`, the source of the method list.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which writes the HTTP response.
- `src/types/index.ts`: supplies the `PaymentMethodsResponse` type (imported via the `@types` alias) that types the payload.
- `src/modules/payments/routes.ts`: a graph neighbor. The route wiring presumably lives there, but this file doesn't show it.

## Notes
- The handler is synchronous and has no auth or validation. The module doc says the endpoint is intentionally public.
- The payload shape is `{ methods: ... }`. The type of the entries comes from `PaymentMethodsResponse`.
