---
source: src/modules/payments/controllers/get-payment-methods.ts
sha256: e31e1662236bb4cf540b9f0eb726036e34eea6e030d2c2cb7f2d3c844ceed410
generated_at: 2026-11-08T07:17:10.549013+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-methods.ts

## Purpose

Express handler for `GET /payments/methods`. It returns the shop's available payment methods in a standard success envelope. The endpoint is intentionally public (no auth) so that a guest can discover checkout options before creating an account.

## Key elements

- **`getPaymentMethods`** (exported) — The sole controller function. Accepts an Express `Request`/`Response`, calls `listPaymentMethods()` to fetch the configured method list, and sends it back via `successResponse` typed as `PaymentMethodsResponse`.

## Relationships

- **`src/modules/payments/routes.ts`** — Registers this handler on the `GET /payments/methods` route (this file is the target it imports).
- **`src/modules/payments/config.ts`** — Provides `listPaymentMethods()`, the source of truth for which methods the shop supports.
- **`src/infrastructure/http/response.ts`** — Supplies the `successResponse` helper that wraps the payload in the project's standard response envelope.
- **`src/types/index.ts`** — Defines the `PaymentMethodsResponse` type used to shape the response body (`{ methods: ... }`).

## Notes

- The `Request` parameter is unused (prefixed with `_`); the endpoint accepts no query or body data.
- No middleware (auth, rate-limit, etc.) is applied here — the controller itself performs no guard logic, so public access is enforced (or omitted) at the routing layer.
- The handler is a thin, stateless pass-through: all real logic lives in `listPaymentMethods()` in the module's config.
