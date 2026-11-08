---
source: src/modules/webhooks/audit.ts
sha256: 1e1e47c20802b94e8ae1a4e1befdfac8eb18724efc7b44b6af3de62d74b36e6d
generated_at: 2026-11-08T08:59:58.380761+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/audit.ts

## Purpose

Declares the audit-action vocabulary for all webhook subscription and delivery mutations, and registers those actions into the app-wide `AuditActionMap` via TypeScript module augmentation. Every write to a subscription (including non-destructive ones like enabling or rotating a secret) is audited because the stored URL and signing secret are the kind of data a later data-protection question targets.

## Key elements

- **`webhooksAuditActions`** – A `const` object of nine action strings (the only export). Seven are `admin.webhook_subscription.*` / `admin.webhook_delivery.*` actions; one is `system.webhook_subscription.auto_disabled`.
- **`declare module '@infrastructure/observability/audit'`** – Augments the global `AuditActionMap` interface so that `webhooks` is a recognized key typed to the union of the values above. The file is a `@module` (no runtime side-effects beyond the constant).

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** – The in-file comment states that `attempt.ts` is the sole caller behind `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`; it fires this action when a consecutive-failure streak crosses a threshold, using `actorUserId: 'system'` rather than attributing it to the worker process.
- **`src/modules/webhooks/services/subscriptions.ts`** – The `admin.webhook_subscription.*` actions (created, updated, enabled, disabled, secret_rotated, secret_removed, deleted) correspond one-to-one with the lifecycle operations that `subscriptions.ts` exposes.
- **`src/modules/webhooks/services/deliveries.ts`** – `admin.webhook_delivery.replayed` maps to the replay operation handled in `deliveries.ts`.
- **`src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts`** – Exercises the subscription action set end-to-end.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** – Exercises the delivery-replay action.

## Notes

- The augmentation pattern (instead of a simple import) mirrors the convention established in `modules/account/audit.ts`; see that file's header comment for the rationale.
- `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` is deliberately namespaced under `system.` rather than `admin.` because no human request triggers it — the actor is always the literal string `'system'` in the audit record.
- The file exports **only** `webhooksAuditActions`. All other consumers import this constant (or rely on the augmented type) rather than re-declaring action strings.
