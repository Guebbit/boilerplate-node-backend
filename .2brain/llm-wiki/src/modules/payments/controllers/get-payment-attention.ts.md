---
source: src/modules/payments/controllers/get-payment-attention.ts
sha256: 97e06ae97bd61a1b4a1ae5233508dbb60a80a5da2d78c27a86ac0b9ce23f4b22
generated_at: 2026-11-08T07:17:03.275743+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-attention.ts

## Purpose

Thin Express controller that handles `GET /payments/attention`. It delegates entirely to `paymentService.listAttention()` and forwards the result (or error) to the HTTP response. The "attention" payload surfaces items still needing human action: stale and hand-owed refunds, payments owing their stock commit, and orders owing their refund.

## Key elements

- **`getPaymentAttention`** (exported) – The sole handler. Calls `paymentService.listAttention()`, sends the result via `successResponse`, and routes any rejection through `catchAs(response, 'getPaymentAttention')`.

## Relationships

- **`src/modules/payments/routes.ts`** – Registers `getPaymentAttention` on the `GET /payments/attention` route.
- **`src/modules/payments/services/index.ts`** – Exports `paymentService`; this controller calls its `listAttention()` method.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse`, used to shape the 200 reply.
- **`src/infrastructure/http/controller.ts`** – Provides `catchAs`, the shared error-to-response helper (the second argument, `'getPaymentAttention'`, is used as the error label).

## Notes

- The `_request` parameter is deliberately unused (underscore prefix). The handler is stateless and needs no query/body data.
- The controller contains no business logic; all attention-list assembly lives in the service layer.
- Error handling is fully delegated to `catchAs`—there is no local `try/catch` or status-code logic in this file.
