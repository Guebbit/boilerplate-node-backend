---
source: src/modules/payments/audit.ts
sha256: fda89d743072ade0003c839435940a6f73d3ad50a7ac1f17546a1f5c3636787e
generated_at: 2026-10-29T05:01:45.855988+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/audit.ts

## Purpose
Centralises every audit action string the payments module can emit, registers its security-relevant events with the observability layer, and augments the shared `AuditActionMap` type so the rest of the codebase can reference these actions by name. It exists so that payment-related audit and security events have a single source of truth rather than scattered string literals.

## Key elements
- **`paymentsAuditActions`** (exported const) — the single mapping of named constants to action strings (e.g. `PAYMENT_CONFIRMED → 'payment.confirmed'`). Covers confirmed/failed payments, the full refund lifecycle (requested → settled by provider or by hand, or voided), offline recording, hand-paid refund obligations, amount mismatches, and webhook signature failures.
- **`registerSecurityEvents([...])`** — calls into `security-events.ts` so `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` is counted in the security incident view.
- **`declare module '@infrastructure/observability/audit'`** — module augmentation that adds a `payments` key to `AuditActionMap`, typed as the union of all values in `paymentsAuditActions`.

## Relationships
- **`src/infrastructure/observability/security-events.ts`** — direct import; `registerSecurityEvents` is called here to register the webhook-forgery event.
- **`src/infrastructure/observability/audit`** (not listed as a neighbor but targeted by the `declare module` augmentation) — the interface being extended.
- **`src/modules/payments/services/refunds.ts`**, **`refund-settlement.ts`**, **`settlement.ts`**, **`offline.ts`**, **`controllers/post-payment-webhook.ts`** — the consumers that import `paymentsAuditActions` and emit the corresponding strings (refund request/cancel/settle-by-hand, settlement, offline recording, webhook verification respectively).
- **Integration tests** (`refunds.test.ts`, `settlement-mismatch.test.ts`, `settlement-reports.test.ts`, `security-events.test.ts`) — assert on the emitted action strings defined here.

## Notes
- **`admin.` prefix convention:** actions with the `admin.` prefix are genuinely operator-gated. `PAYMENT_RECORDED_OFFLINE` is also admin-only but intentionally keeps the `payment.` prefix because it names a *kind* of payment event, not an admin override.
- **`PAYMENT_AMOUNT_MISMATCH` is deliberately *not* under the `security.` namespace** — the incident view claims that whole prefix for attack signals; an amount/currency discrepancy is a reconciliation issue, not a forgery.
- **Refund lifecycle has four distinct audit rows** (requested → settled-by-provider / settled-by-hand / canceled) and none of them is written when a refund is simply *owed by hand* and left pending; that state is captured by `PAYMENT_REFUND_OWED_BY_HAND` instead.
- **`refundForOrder` does not audit the provider refund itself** (sweep-like: no caller behind it); it only audits `PAYMENT_REFUND_OWED_BY_HAND` when a hand-paid refund is left for an operator.
- The module-augmentation pattern (rather than a simple interface extension) is shared with `modules/account/audit.ts`; see that file for the rationale.
