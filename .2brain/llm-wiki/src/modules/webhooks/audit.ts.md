---
source: src/modules/webhooks/audit.ts
sha256: 1e1e47c20802b94e8ae1a4e1befdfac8eb18724efc7b44b6af3de62d74b36e6d
generated_at: 2026-10-29T06:24:44.812196+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/audit.ts

## Purpose

Declares the audit-action vocabulary for the webhooks module and registers it into the application-wide `AuditActionMap` via TypeScript module augmentation. Every mutating operation on a webhook subscription (not just deletions) produces one of these actions, because a subscription's `url` and secret ring are exactly the data a later privacy/compliance question would target.

## Key elements

- **`webhooksAuditActions`** — a frozen (`as const`) object of nine string-literal action keys:
  - `ADMIN_WEBHOOK_SUBSCRIPTION_*` — six actions covering create, update, enable, disable, secret rotate, secret remove, and delete.
  - `ADMIN_WEBHOOK_DELIVERY_REPLAYED` — audit trail for manually replaying a delivery.
  - `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` — emitted when the system (not a user) disables a subscription after a consecutive-failure streak. Uses the `system.` prefix and `actorUserId: 'system'` to make clear no human initiated it.
- **`declare module '@infrastructure/observability/audit'`** — module augmentation that adds a `webhooks` key to the global `AuditActionMap` interface, narrowing its type to the union of the above values.

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** — the only caller of `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`. Its internal consecutive-failure logic triggers the audit entry autonomously; no user request is involved.
- **`src/modules/webhooks/services/subscriptions.ts`** — consumer of the six `ADMIN_WEBHOOK_SUBSCRIPTION_*` actions (create, update, enable, disable, secret rotate/remove, delete).
- **`src/modules/webhooks/services/deliveries.ts`** — consumer of `ADMIN_WEBHOOK_DELIVERY_REPLAYED`.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** / **`subscription-lifecycle.test.ts`** — integration tests that verify the correct audit action is emitted for each lifecycle transition.

## Notes

- The module-augmentation pattern (rather than a plain import/export of the action list) is intentional and mirrors the convention set in `modules/account/audit.ts`. The rationale is documented in that file; this file follows the same shape so that `AuditActionMap` stays a single global union across all modules.
- The `system.` prefix on `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` is a naming convention, not a separate audit channel. It exists so that downstream audit queries can filter out system-driven events and avoid attributing the action to whichever worker process happened to execute the failing delivery.
