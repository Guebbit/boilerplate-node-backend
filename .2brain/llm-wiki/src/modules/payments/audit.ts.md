---
source: src/modules/payments/audit.ts
sha256: 9ffa8c9755089e57cdbc2971c132cf43886311b92dc91456d52a1f3b3cabafce
generated_at: 2026-09-27T15:22:54.526025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/audit.ts

## Purpose
Declares the set of audit action strings the payments module emits and registers them in the global `AuditActionMap` via a module augmentation, so that any audit-log consumer can type-check payments-specific action names against a single source of truth.

## Key elements
- **`paymentsAuditActions`** (exported `const` object, `as const`) — Maps semantic keys to their wire-string values:
  - `PAYMENT_CONFIRMED` → `'payment.confirmed'`
  - `PAYMENT_FAILED` → `'payment.failed'`
  - `ADMIN_PAYMENT_REFUNDED` → `'admin.payment.refunded'`
  - `PAYMENT_RECORDED_OFFLINE` → `'payment.recorded.offline'`
  - `PAYMENT_REFUND_OWED_BY_HAND` → `'payment.refund_owed_by_hand'`
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with a `payments` field typed to the union of all values in `paymentsAuditActions`, making them usable across the codebase without a per-file import of the constant.

## Relationships
- **services/offline.ts**, **services/refunds.ts**, **services/settlement.ts** — These service files are the emitters of the actions declared here (e.g. `PAYMENT_RECORDED_OFFLINE`, `ADMIN_PAYMENT_REFUNDED`, `PAYMENT_CONFIRMED`/`PAYMENT_FAILED`). They import `paymentsAuditActions` to log; this file provides the vocabulary. No runtime import flows the other way.

## Notes
- The `admin.` prefix is a naming convention, not a separate namespace: it marks actions that **only** an admin/operator path can produce (e.g. manual refund). `PAYMENT_RECORDED_OFFLINE` is also operator-only but deliberately keeps the plain `payment.` prefix because it names a *kind* of payment event rather than an admin override.
- `PAYMENT_REFUND_OWED_BY_HAND` is specifically for hand-paid orders where the automatic cancel-listener (B1b) left the refund alone; only an operator's explicit `refundByOrder` may clear it.
- The file is purely declarative (strings + type augmentation). It has no runtime side effects and imports nothing from the payments services.
