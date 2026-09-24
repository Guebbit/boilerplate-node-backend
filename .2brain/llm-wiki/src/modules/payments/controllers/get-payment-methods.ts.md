---
source: src/modules/payments/controllers/get-payment-methods.ts
sha256: e31e1662236bb4cf540b9f0eb726036e34eea6e030d2c2cb7f2d3c844ceed410
generated_at: 2026-09-23T19:16:54.402722+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-methods.ts

## Purpose

Express controller that answers `GET /payments/methods` with the list of payment methods configured for the shop. It exists so the frontend can discover available checkout options dynamically instead of hard-coding them. The endpoint is intentionally public—guests should be able to see what payment options exist before signing up.

## Key elements

- **`getPaymentMethods(request, response)`** — The sole export. Accepts an Express `Request` (unused) and `Response`, calls `listPaymentMethods()`, and sends the result wrapped in a `successResponse` envelope shaped as `PaymentMethodsResponse` (`{ methods: … }`).

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports the `successResponse` helper to produce the standard success envelope.
- **`src/modules/payments/config.ts`** — Imports `listPaymentMethods()`, which is the data source for the response body.
- **`src/modules/payments/routes.ts`** — Consumes the `getPaymentMethods` export to bind it to the `GET /payments/methods` route.
- **`src/types/index.ts`** — Provides the `PaymentMethodsResponse` type used to type the response payload.

## Notes

- The handler is intentionally stateless and read-only: it takes no input from the request and performs no authorization. There is no pagination or filtering.
- The `request` parameter is prefixed with `_` to signal it is unused, which is the convention in this codebase for Express handlers that ignore the incoming request.
