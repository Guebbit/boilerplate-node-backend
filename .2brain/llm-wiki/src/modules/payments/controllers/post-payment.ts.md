---
source: src/modules/payments/controllers/post-payment.ts
sha256: 2262d21c24ad017ea633919ec6cbcabfdc425eb7922780a43533750be365a010
generated_at: 2026-11-08T07:19:14.972855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment.ts

## Purpose

Thin HTTP controller for `POST /payments`. It validates the request body, delegates intent creation to the payment service, and returns the provider's `clientSecret` to the client. Business logic (ownership checks, `pending` gate, amount freezing) lives entirely in the service; no audit or analytics events fire here because a payment intent is a preparatory step, not a business event—those are emitted on confirm.

## Key elements

- **`postPayment`** (exported) – The only export. Express handler that:
  1. Parses `request.body` against the `CreatePaymentBody` Zod schema (`parseBody` short-circuits with an error response on failure).
  2. Calls `paymentService.createIntent(orderId, authContext)`.
  3. Checks the result with `refused` (handles service-level rejections like unauthorized or wrong-status).
  4. Sends `201` (new payment inserted) or `200` (existing payment refreshed) via `createdOrOk`, including the `clientSecret` in the payload and a `Location` header pointing to `/payments/:id`.
  5. Catches unexpected errors with `catchAs(response, 'postPayment')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody`, `refused`, and `catchAs` helpers used for input validation, rejection short-circuiting, and unified error formatting.
- **`src/infrastructure/http/response.ts`** – Supplies `createdOrOk`, which picks 201 vs 200 based on `result.status` and writes the `Payment` payload.
- **`src/modules/payments/services/index.ts`** – Source of `paymentService`; this controller is the sole caller of `createIntent` in the module.
- **`src/modules/payments/routes.ts`** – Wires `postPayment` to the `POST /payments` route.
- **`src/types/index.ts`** – Provides the `Payment` interface used as the generic parameter of `createdOrOk`.

## Notes

- This is the **only** endpoint in the payments module whose response body contains `clientSecret`. That field is never logged and never persisted; treat it as ephemeral (valid for one confirmation window).
- The service serializes the wire shape (including `clientSecret`); the controller does not map or reshape the payload.
- `createdOrOk` emits the correct status code based on whether the intent was newly inserted (`201`) or an existing one was refreshed (`200`)—determined by `result.status`, not by the controller.
