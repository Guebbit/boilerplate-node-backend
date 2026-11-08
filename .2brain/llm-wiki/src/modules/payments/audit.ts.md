---
source: src/modules/payments/audit.ts
sha256: f9e0eec19495c1357fc13d1c51bfb95e7430cfd076bedecdc4f9a8e5068064af
generated_at: 2026-11-08T07:16:16.296724+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/audit.ts

## Purpose

Declares the audit-action strings emitted by the payments module and registers them in the infrastructure audit map via TypeScript declaration merging. It is the single source of truth for every payment-related audit event, separating "decision" events (refund requested) from "settlement" events (refund settled, refund canceled) and marking admin-only actions with an `admin.` prefix.

## Key elements

- **`paymentsAuditActions`** (exported const) — The full map of audit action strings. Notable distinctions encoded in the naming:
  - `admin.` prefix → action is admin/staff-only (refund requested, refunded, settled by hand, canceled).
  - `payment.` prefix → any checkout or operator flow can produce it (confirmed, failed, recorded offline, refund owed by hand, amount mismatch).
  - `security.` prefix → counted as a security incident (webhook invalid signature).
- **`registerSecurityEvents(...)`** call — Registers `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` so the observability layer tracks it as a security event.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds `payments` to the global `AuditActionMap` so the audit infrastructure type-checks against this module's action set.

## Relationships

- **`src/infrastructure/observability/security-events.ts`** — Provides `registerSecurityEvents`, imported and called here; also owns the `AuditActionMap` interface that this file augments.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — Emits `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` on signature failure.
- **`src/modules/payments/services/offline.ts`** — Emits `PAYMENT_RECORDED_OFFLINE`.
- **`src/modules/payments/services/refunds.ts`** — Emits `ADMIN_PAYMENT_REFUND_REQUESTED`, `ADMIN_PAYMENT_REFUND_CANCELED`, and `PAYMENT_REFUND_OWED_BY_HAND` during the refund lifecycle.
- **`src/modules/payments/services/refund-settlement.ts`** — Emits `ADMIN_PAYMENT_REFUND_SETTLED_BY_HAND` when an operator confirms a hand-paid refund left the application.
- **`src/modules/payments/services/settlement.ts`** — Emits `ADMIN_PAYMENT_REFUNDED` (provider settlement) and `PAYMENT_AMOUNT_MISMATCH` (provider reported a different amount/currency/payment than the frozen one).
- **Test files** (`refunds.test.ts`, `settlement-mismatch.test.ts`, `settlement-reports.test.ts`, `security-events.test.ts`) — Assert that the correct action strings are written for each scenario.

## Notes

- **Decision vs. settlement split:** `ADMIN_PAYMENT_REFUND_REQUESTED` is written when the refund record opens (before the provider is asked); `ADMIN_PAYMENT_REFUNDED` is written only at settlement. A sweep that retries a refused refund settles silently — it never audits `ADMIN_PAYMENT_REFUNDED` because there is no caller behind it.
- **`refundForOrder` exception:** The refund half of the `order.canceled` listener performs a real provider refund but does *not* audit it (no request behind it, like a sweep). It still writes `PAYMENT_REFUND_OWED_BY_HAND` if the refund is hand-paid, because a human must act on it.
- **`PAYMENT_AMOUNT_MISMATCH` is deliberately not `security.`-prefixed:** The incident view consumes the whole `security.` prefix; this is a reconciliation discrepancy, not an attack signal.
- **Augmentation pattern:** The declaration-merge approach (rather than a direct import into the infrastructure file) is intentional — see `src/modules/account/audit.ts` for the rationale. Each module owns its own action strings and plugs them into the shared map independently.
