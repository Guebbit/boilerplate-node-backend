---
source: src/modules/payments/controllers/get-payment-attention.ts
sha256: 97e06ae97bd61a1b4a1ae5233508dbb60a80a5da2d78c27a86ac0b9ce23f4b22
generated_at: 2026-10-15T11:23:11.117101+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-attention.ts

## Purpose

Express route handler for `GET /payments/attention`. It surfaces a summary of items requiring manual attention (stale refunds, hand-owed refunds, pending stock commits, pending order refunds) by delegating entirely to the payment service and shaping the HTTP response.

## Key elements

- **`getPaymentAttention`** (exported) — The sole handler. Ignores the request body/params (`_request`), calls `paymentService.listAttention()`, wraps the resolved value in `successResponse`, and routes any rejection through `catchAs(response, 'getPaymentAttention')`.

## Relationships

- **`src/modules/payments/services/index.ts`** — Source of `paymentService`; the only business logic (`listAttention()`) lives there.
- **`src/modules/payments/routes.ts`** — Registers this handler on the `GET /payments/attention` path.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, which converts a thrown error into a structured error response.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope for 200 payloads.

## Notes

- The handler is a pure pass-through: no validation, no request-param inspection, no branching. All filtering and assembly is in `paymentService.listAttention()`.
- Uses an explicit `.then()/.catch()` chain rather than `async/await`, consistent with the `catchAs` helper's design.
- The operation name passed to `catchAs` (`'getPaymentAttention'`) is the identifier used in error logging/correlation.
