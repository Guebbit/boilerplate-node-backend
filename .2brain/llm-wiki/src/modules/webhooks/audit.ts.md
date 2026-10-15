---
source: src/modules/webhooks/audit.ts
sha256: 917797199d79a18fc915b7f5d563c9fdc596af423e17c8baef632f0f4dc15093
generated_at: 2026-10-15T12:17:28.036197+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/audit.ts

## Purpose

Declares the audit-action vocabulary for all webhook-related mutations and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Every read/write against a subscription (URL, secret, deletion) and every delivery replay is audited, not just the destructive ones, because subscription URLs and secrets are exactly the data a data-protection inquiry would target.

## Key elements

- **`webhooksAuditActions`** (exported `as const` object) — the canonical set of audit action strings owned by the webhooks module:
  - `ADMIN_WEBHOOK_SUBSCRIPTION_CREATED / UPDATED / DELETED`
  - `ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_ROTATED / REMOVED`
  - `ADMIN_WEBHOOK_DELIVERY_REPLAYED`
  - `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` — the only `system.`-prefixed action; no human caller sits behind it.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with a `webhooks` key typed as the union of all the above action strings, making them available to the generic audit infrastructure.

## Relationships

- **`services/subscriptions.ts`** — emits the `ADMIN_WEBHOOK_SUBSCRIPTION_*` and `ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_*` actions on every mutation (create, update, rotate, remove secret, delete).
- **`services/deliveries.ts`** — emits `ADMIN_WEBHOOK_DELIVERY_REPLAYED` when an operator re-dispatches a failed delivery.
- **`services/attempt.ts`** — emits `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` when its consecutive-failure streak threshold is crossed; `actorUserId` is set to `'system'` so the audit trail does not attribute the action to whichever worker process happened to run the failing delivery.
- **`tests/integration/subscription-lifecycle.test.ts`** — exercises the full subscription lifecycle and asserts the correct audit action is recorded at each step.
- **`tests/integration/delivery.test.ts`** — covers the replay path and its associated audit emission.

## Notes

- The file's only runtime export is `webhooksAuditActions`; the `declare module` block is compile-time only and does not produce JavaScript.
- The `system.` prefix on `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` is a deliberate namespace convention to distinguish non-user-initiated events from `admin.` actions. Any new auto-triggered webhook audit action should follow the same `system.webhook_*` pattern.
- The module-augmentation approach (same pattern as `modules/account/audit.ts`) keeps each domain's action strings co-located with their domain while giving the audit infrastructure a single typed union.
