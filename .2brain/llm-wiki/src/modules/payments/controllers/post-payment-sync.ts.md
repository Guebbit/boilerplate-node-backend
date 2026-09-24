---
source: src/modules/payments/controllers/post-payment-sync.ts
sha256: 3263ee08906163726d9da938b3f00576909131c638b849728d4be7ec15e3c423
generated_at: 2026-09-23T19:17:43.581343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-sync.ts

## Purpose

HTTP handler for `POST /payments/:id/sync`. When the browser signals that a 3-D Secure challenge or wallet sheet has finished, this endpoint re-reads the provider's record and applies it, making the happy path _feel_ synchronous while the webhook remains the authority. It is idempotent: a payment already settled is answered locally without a provider call.

## Key elements

- **`postPaymentSync(request, response)`** – The sole export. Reads `params.id`, delegates to `paymentService.syncPayment`, and either short-circuits via `refused()` (if the service rejected the call) or sends a 200 with the serialized `Payment` payload.
- **`.toJSON()` call on `result.data`** – Applies the Mongoose-style `_id → id` and date-to-ISO-string transform before the response is shaped.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides `catchAs` (unified error → response mapping) and `refused` (checks whether the service result carries a refusal and writes the appropriate error response).
- **`src/infrastructure/http/request.ts`** – `callerContextOf(request)` extracts caller metadata (IP, user-agent, etc.) passed into the service for audit/anti-fraud context.
- **`src/infrastructure/http/response.ts`** – `successResponse` wraps the payload, status code, and optional message into the standard envelope.
- **`src/modules/payments/routes.ts`** – Registers `postPaymentSync` on the `POST /payments/:id/sync` route.
- **`src/modules/payments/services/index.ts`** – Exposes `paymentService.syncPayment`, which performs the actual provider re-read and state transition.
- **`src/types/index.ts`** – Supplies the `Payment` type used to type the response payload.

## Notes

- The controller is intentionally thin: all domain logic (idempotency check, provider call, state mutation) lives in `paymentService.syncPayment`.
- `request.params.id` is typed as `string | undefined` and immediately coerced with `String()`; a missing `id` will produce `NaN`-ish behavior downstream rather than a 404 — the route definition in `routes.ts` is what guarantees the param is present.
- `result.data.toJSON()` is cast `as Payment`; the cast is safe only because the service contract guarantees the shape. If the service ever returns a different model, the cast will hide the mismatch at compile time.
