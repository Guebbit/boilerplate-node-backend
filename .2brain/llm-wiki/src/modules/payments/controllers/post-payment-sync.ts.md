---
source: src/modules/payments/controllers/post-payment-sync.ts
sha256: aa8e1efd92dab68f60ddd398ef808e908851376bf276997851afa39597909c51
generated_at: 2026-10-15T11:24:26.649144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-sync.ts

## Purpose

Handles `POST /payments/:id/sync` — the browser notifying the backend that it has finished interacting with the payment provider (e.g., completed a 3-D Secure challenge or closed a wallet sheet). The controller re-reads the provider's own record and applies it, giving the happy path a synchronous feel while the webhook remains the ultimate authority. The operation is idempotent: an already-settled payment responds without contacting the provider again.

## Key elements

- **`postPaymentSync(request, response)`** — The sole export. Extracts the `:id` route param, delegates to `paymentService.syncPayment`, then shapes the response through the payment presenter. Uses `catchAs` for uniform error handling and `refused` to short-circuit non-OK results.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error-to-response mapping) and `refused` (early-return guard for rejected results).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which parses and validates the `:id` param, responding 404 with key `payments.not-found` if absent.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract caller metadata passed to the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 200 JSON writer used here with the presenter output.
- **`src/modules/payments/presenter.ts`** — `presentPayment` transforms the internal `Payment` shape into the public API payload.
- **`src/modules/payments/routes.ts`** — Wires this handler to the `POST /payments/:id/sync` route.
- **`src/modules/payments/services/index.ts`** — `paymentService.syncPayment` performs the actual provider re-read and state application.
- **`src/types/index.ts`** — Supplies the `Payment` type used in the generic on `successResponse`.

## Notes

- The handler is deliberately thin: no business logic lives here; all provider interaction is delegated to the service.
- `result.message` is forwarded as the HTTP response body alongside the presented payment — callers should not assume the body is *only* the payment object.
- Idempotency means a repeated sync on a settled payment will still return 200 with the payment data, but will not re-contact the provider.
