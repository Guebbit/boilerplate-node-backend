---
source: src/modules/webhooks/events.ts
sha256: 5d43895ad5d0dcc597bdf6e7e1e93ce4a9810ad8492e4ca3bd45d7bda6fe371b
generated_at: 2026-11-08T09:02:50.086836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/events.ts

## Purpose

Declares the webhooks module's domain events by augmenting the kernel's `DomainEventMap` interface. These events represent internal facts emitted to sibling modules (e.g. `notifications`); they are **not** webhook deliveries and never travel over an AsyncAPI channel.

## Key elements

- **Module augmentation of `@kernel/events` → `DomainEventMap`** — adds the `'webhook.subscription_auto_disabled'` key with a payload of `{ tenantId, subscriptionId, disabledAt }`.
- **`WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`** (exported const) — the string literal `'webhook.subscription_auto_disabled'`, provided as a stable importable identifier so emitters and listeners reference the event name without magic strings.

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** — the sole emitter. When repeated delivery failures auto-disable a subscription, `attempt.ts` publishes the `webhook.subscription_auto_disabled` event exactly once, at the point the subscription is toggled off.
- **`src/modules/webhooks/index.ts`** — module barrel; re-exports this file's constant so callers outside the webhooks module can import the event name.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — integration tests that exercise the failure-threshold path and assert the event is emitted with the expected payload.

## Notes

- The JSDoc explicitly warns: this is an *internal* domain event. Do not add an AsyncAPI channel or a webhook delivery for it.
- `disabledAt` is an ISO timestamp. A subsequent re-enable → disable cycle is a **new** event, not an update to the previous one.
- Adding a new event here requires only a new key in the augmented `DomainEventMap` and a corresponding exported const—no kernel file edits.
