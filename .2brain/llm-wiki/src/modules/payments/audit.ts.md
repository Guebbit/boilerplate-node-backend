---
source: src/modules/payments/audit.ts
sha256: d0374491aaae008346da80266744eb5b27ccd7cc881f755f39ad7e61bb2129df
generated_at: 2026-10-15T11:22:38.115051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/audit.ts

## Purpose

Declares the set of audit action strings the payments module can emit and registers them into the shared `AuditActionMap` via TypeScript module augmentation. It exists so that every payment-related audit event has a single, type-safe vocabulary and so the infrastructure audit layer knows which strings belong to the `payments` namespace.

## Key elements

- **`paymentsAuditActions`** (`as const` object, exported) — the canonical key-value map of the six payment audit actions:
  - `PAYMENT_CONFIRMED` / `PAYMENT_FAILED` — emitted by any checkout that confirms or fails a payment.
  - `ADMIN_PAYMENT_REFUNDED` — admin-only; uses the `admin.` prefix to signal an operator override.
  - `PAYMENT_RECORDED_OFFLINE` — admin-only in practice, but keeps the plain `payment.` prefix because it names a payment-event kind, not an admin override.
  - `PAYMENT_REFUND_OWED_BY_HAND` — a cancel left a refund on a hand-paid order that the automatic listener deliberately did not process (case B1b); flags the item for a human operator.
  - `PAYMENT_AMOUNT_MISMATCH` — provider reported success but the amount/currency/payment differs from the frozen record; intentionally **not** under the `security.` prefix.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with a `payments` key typed as the union of all values in `paymentsAuditActions`, giving type-safe access across the codebase.

## Relationships

- **`src/modules/payments/services/offline.ts`** — consumes `PAYMENT_RECORDED_OFFLINE` when an operator records an offline payment.
- **`src/modules/payments/services/refunds.ts`** — consumes `ADMIN_PAYMENT_REFUNDED` and `PAYMENT_REFUND_OWED_BY_HAND`; the module JSDoc describes the `refundForOrder` listener and the B1b hand-paid-cancel path that live here.
- **`src/modules/payments/services/settlement.ts`** — consumes `PAYMENT_AMOUNT_MISMATCH` when the provider's success report disagrees with the frozen payment record; also the origin of `PAYMENT_CONFIRMED` / `PAYMENT_FAILED`.
- **`src/modules/payments/tests/integration/settlement-mismatch.test.ts`** — exercises the `PAYMENT_AMOUNT_MISMATCH` path end-to-end.
- **`src/modules/payments/tests/integration/settlement-reports.test.ts`** — exercises settlement reporting flows that emit audit actions defined here.

## Notes

- The `admin.` vs. `payment.` prefix is **semantic**, not a permission gate: `admin.` means "an operator explicitly overrode a payment state," while plain `payment.` means "a payment event of a given kind occurred." `PAYMENT_RECORDED_OFFLINE` is admin-only in practice but keeps the plain prefix for that reason.
- `PAYMENT_AMOUNT_MISMATCH` is deliberately excluded from the `security.` namespace; the incident view treats that prefix as an attack signal, whereas a mismatch is a reconciliation item.
- The module-level JSDoc references `modules/account/audit.ts` as the precedent for using `declare module` augmentation rather than a plain export — follow the same pattern if adding new payment audit actions.
- `refundForOrder` (the `ORDER_REFUND_OWED` listener) logs a real-provider refund as a log entry rather than an audit event (no request behind it, analogous to the token-cleanup job), but **still** audits `PAYMENT_REFUND_OWED_BY_HAND` for the hand-paid-order case because that one requires a human to act.
