---
source: src/modules/webhooks/audit.ts
sha256: 32281603cfa017381dd83b81911daeaf6e2fe24b0187b7b7e8e2da6dd7da40d5
generated_at: 2026-09-23T19:38:11.018403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/audit.ts

## Purpose

Declares the webhooks module's audit-action vocabulary and registers it into the application-wide `AuditActionMap` via TypeScript module augmentation. Every write against a subscription (URL, secret) is audited—not just destructive ones—because data-protection questions later need a complete trail.

## Key elements

- **`webhooksAuditActions`** (`as const`) — the five action identifiers this module owns:
    - `ADMIN_WEBHOOK_SUBSCRIPTION_CREATED` / `_UPDATED` / `_DELETED` — admin-initiated CRUD on a subscription.
    - `ADMIN_WEBHOOK_DELIVERY_REPLAYED` — admin-initiated replay of a past delivery.
    - `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` — auto-disable triggered by a consecutive-failure streak; no human caller. Recorded with `actor_user_id: 'system'` so it isn't attributed to whichever worker happened to run the failing delivery.
- **`declare module '@infrastructure/observability/audit'`** — augments the global `AuditActionMap` interface with a `webhooks` key typed to the literal union of the five action strings, making them autocomplete-able and exhaustively checkable across the codebase.

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** — the sole emitter of `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`; its consecutive-failure logic decides the action, not a request. This file's doc-comment references it directly.
- **`src/modules/webhooks/services/subscriptions.ts`** — emits the three `ADMIN_WEBHOOK_SUBSCRIPTION_*` actions on create/update/delete paths.
- **`src/modules/webhooks/services/deliveries.ts`** — emits `ADMIN_WEBHOOK_DELIVERY_REPLAYED` when an admin triggers a replay.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — integration test that exercises the delivery/replay path and thereby validates that the replay audit action is recorded.

## Notes

- The `system.` prefix (vs. `admin.`) is a deliberate convention: it signals that no human request initiated the event. Any new non-human-triggered audit action in this domain should follow the same prefix.
- The augmentation target (`@infrastructure/observability/audit`) means this file must compile in the same project that declares that base module; a missing or renamed base module will silently drop the type augmentation.
- The rationale for auditing _all_ subscription writes (including `updated`) is stated in the module doc-comment: the `url` and secret ring are sensitive fields that data-protection reviewers will ask about.
