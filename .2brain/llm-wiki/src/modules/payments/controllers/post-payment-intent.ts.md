---
source: src/modules/payments/controllers/post-payment-intent.ts
sha256: 6443ad43a83f5f4a8233726af924a57b16e3d478f7084d510b3d4c1b71df7a2a
generated_at: 2026-10-15T11:23:57.097749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-intent.ts

## Purpose

Handler for `POST /payments/intent`. Freezes an order's price into a payment intent and opens one at the provider, ready to confirm. Deliberately thin: ownership checks, the `pending` gate, and amount calculation all live in the service layer. No audit or analytics events fire here—an intent is page-load preparation, not a business event; those fire on confirm.

## Key elements

- **`postPaymentIntent`** — the sole export. Parses the request body against `CreatePaymentIntentBody` (Zod schema), delegates to `paymentService.createIntent(orderId, authContext)`, and responds with `createdOrOk`. The response carries `clientSecret` inside the `Payment` object; the service performs that serialization because the field is not part of the persisted document.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` helpers used for validation, rejection checks, and error handling.
- **`src/infrastructure/http/response.ts`** — supplies `createdOrOk`, which emits 201 (new payment) or 200 (refreshed existing one) with a `Location` header.
- **`src/modules/payments/routes.ts`** — registers this handler on the `POST /payments/intent` route.
- **`src/modules/payments/services/index.ts`** — provides `paymentService.createIntent`, which owns all business logic (idempotency, amount locking, provider call).
- **`src/types/index.ts`** — provides the `Payment` type that shapes the response body.

## Notes

- `clientSecret` is never logged, never stored, and appears in exactly one endpoint response in this module. Treat any logging middleware with care around this field.
- 201 vs. 200 is determined by the service (`result.status`), not by the controller.
- The controller does not attach audit/analytics; do not add them here—those belong on the confirm path.
