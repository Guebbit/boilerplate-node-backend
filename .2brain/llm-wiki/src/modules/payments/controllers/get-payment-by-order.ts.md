---
source: src/modules/payments/controllers/get-payment-by-order.ts
sha256: b32fd7761b3e0329c4d9eddd97d03044462b0ec5a7e9ef8019b3c0d839a48170
generated_at: 2026-09-23T19:16:48.600090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-by-order.ts

## Purpose

Single controller for `GET /payments/order/:orderId`. The order page's payment panel calls this on load so that a mid-flow reload can recover the existing payment intent (and its status) rather than starting the payment flow over from scratch.

## Key elements

- **`getPaymentByOrder`** (default export) — Express handler that delegates to `paymentService.getForOrder(orderId, authContext)`, then either responds with the `Payment` payload, signals a refusal, or forwards the error via `catchAs`. Written as a single chained-promise expression with no local state.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides the `catchAs` and `refused` helpers used for error forwarding and authorization-rejection responses.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standard envelope for a 200 JSON reply.
- **`src/modules/payments/services/index.ts`** — source of `paymentService`, whose `getForOrder` method performs the actual lookup.
- **`src/modules/payments/routes.ts`** — registers this controller against the `/payments/order/:orderId` route.
- **`src/types/index.ts`** — supplies the `Payment` type used in the response generic.

## Notes

- The route param is typed as optional (`orderId?: string`) in the handler signature; the code coerces it with `String(request.params.orderId)` before passing to the service. If the param is genuinely missing the service will receive the literal string `"undefined"` — validation is expected upstream (routes layer).
- The file contains no business logic; it is a thin adapter between Express and the service layer, following the same pattern as other controllers in the project.
