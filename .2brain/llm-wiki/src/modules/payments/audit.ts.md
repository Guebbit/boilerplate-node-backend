---
source: src/modules/payments/audit.ts
sha256: 00ce0edd678bd00a8496da68ff109e9213dcda9d2f61eee8a3a7005fcea53164
generated_at: 2026-09-23T19:16:17.951640+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/audit.ts

## Purpose

Declares the set of audit action strings the payments module can emit and registers them into the infrastructure-wide `AuditActionMap` via TypeScript module augmentation. Keeping the strings in one typed const (rather than scattering literals) gives every consumer a single source of truth and a compile-time check against the audit log schema.

## Key elements

- **`paymentsAuditActions`** – `as const` object with four string-literal values:
  - `PAYMENT_CONFIRMED` → `'payment.confirmed'`
  - `PAYMENT_FAILED` → `'payment.failed'`
  - `ADMIN_PAYMENT_REFUNDED` → `'admin.payment.refunded'`
  - `PAYMENT_RECORDED_OFFLINE` → `'payment.recorded_offline'`
- **`declare module '@infrastructure/observability/audit'`** – Augments the `AuditActionMap` interface so that the `payments` key accepts only the values defined above, preventing typos at every call site.

## Relationships

This file is a **leaf provider**: it exports types/strings and imports nothing from its neighbors. The listed services are the expected *consumers* of these action strings:

- `services/settlement.ts` – expected to fire `PAYMENT_CONFIRMED` / `PAYMENT_FAILED` during settlement processing.
- `services/refunds.ts` – expected to fire `ADMIN_PAYMENT_REFUNDED` on admin-initiated refunds.
- `services/offline.ts` – expected to fire `PAYMENT_RECORDED_OFFLINE` when a payment is recorded while offline.

No import from this file to those services exists; the dependency is strictly inbound.

## Notes

- **Prefix convention:** `admin.` prefix signals the action is admin-only. `PAYMENT_RECORDED_OFFLINE` intentionally keeps the plain `payment.` prefix because it names a kind of payment event, not an admin override.
- **`refundForOrder` is *not* audited here.** The cancel-listener's compensation path has no HTTP request context to audit against, so it logs directly (same pattern as the token-cleanup job). Don't expect a `refundForOrder` action string.
- **Augmentation, not redefinition:** The `declare module` block *extends* an existing interface; it does not create it. The base `AuditActionMap` lives in `@infrastructure/observability/audit`.
- Because the file is a type/string declaration with no runtime logic, bundlers will tree-shake it from any entry point that only needs the type augmentation.
