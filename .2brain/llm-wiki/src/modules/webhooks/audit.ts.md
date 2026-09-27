---
source: src/modules/webhooks/audit.ts
sha256: 8a0cf2216a5aeb1502c830769687a65e0744f0ca60b2e03f025306401c749987
generated_at: 2026-09-27T15:40:50.040731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/audit.ts

## Purpose

Declares the webhook module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Every write against a subscription (not just destructive ones) is audited, because the subscription URL and signing secret are exactly the data a data-protection inquiry will later ask about.

## Key elements

- **`webhooksAuditActions`** — `as const` object defining the action strings this module owns:
  - `ADMIN_WEBHOOK_SUBSCRIPTION_CREATED / _UPDATED / _DELETED`
  - `ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_ROTATED / _REMOVED`
  - `ADMIN_WEBHOOK_DELIVERY_REPLAYED`
  - `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` — emitted when the consecutive-failure streak in `services/attempt.ts` disables a subscription autonomously; no user request is behind it.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with a `webhooks` key typed as the union of all values above, making the actions available to the central audit infrastructure without a runtime import cycle.

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** — Source of the `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` action. Its internal consecutive-failure logic decides to auto-disable a subscription; `actor_user_id` is set to the literal `'system'` so the audit log doesn't attribute the action to whichever worker happened to be running the failing delivery.
- **`src/modules/webhooks/services/subscriptions.ts`** — Expected emitter of the `ADMIN_WEBHOOK_SUBSCRIPTION_*` and `ADMIN_WEBHOOK_DELIVERY_REPLAYED` actions defined here.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — Integration test that exercises delivery paths and (per graph) asserts the audit emissions declared in this file.

## Notes

- The augmentation pattern mirrors `modules/account/audit.ts`; the file-header comment points there for the rationale. If you add a new webhook audit event, extend `webhooksAuditActions` here — you do **not** need to touch the central `@infrastructure/observability/audit` module, the `declare module` block handles registration.
- The `system.` prefix (vs. `admin.`) is a deliberate distinction: no caller initiated the action. Keep new autonomous-disable paths under `system.` and user-initiated ones under `admin.`.
