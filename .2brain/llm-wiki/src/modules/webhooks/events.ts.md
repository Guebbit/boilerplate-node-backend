---
source: src/modules/webhooks/events.ts
sha256: 5d43895ad5d0dcc597bdf6e7e1e93ce4a9810ad8492e4ca3bd45d7bda6fe371b
generated_at: 2026-10-29T06:26:57.987987+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/events.ts

## Purpose

Declares the webhooks module's domain events by augmenting the kernel's `DomainEventMap` via TypeScript module augmentation. This file exists so sibling modules can type-safe subscribe to webhook lifecycle facts without importing the webhooks module directly. It contains no runtime logic beyond a single exported string constant.

## Key elements

- **`declare module '@kernel/events'`** — Augments the kernel's `DomainEventMap` interface with one entry: `'webhook.subscription_auto_disabled'`. This is the sole event defined here.
- **`'webhook.subscription_auto_disabled'`** — Payload type: `{ tenantId: string; subscriptionId: string; disabledAt: string }`. Represents the moment a subscription was auto-disabled after repeated delivery failures.
- **`WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`** (exported const) — String literal `'webhook.subscription_auto_disabled'` for referencing the event name at runtime.

## Relationships

- **`src/modules/webhooks/services/attempt.ts`** — The emitter. The comment in this file states that `attempt.ts` emits `webhook.subscription_auto_disabled` exactly once, on the call that actually disables the subscription after repeated failures.
- **`src/modules/webhooks/index.ts`** — Module barrel; re-exports or otherwise aggregates this file's exports for consumers within the webhooks package.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — Integration test that exercises the delivery-failure path and verifies this event is emitted with the correct payload.

## Notes

- **Internal-only event.** The file's own documentation is explicit: no AsyncAPI channel carries this event and it is never delivered to an external subscriber. It is a fact for sibling modules (e.g., `notifications` converting it into a staff work notice).
- **`disabledAt` is an ISO instant**, not a duration or relative offset. The comment notes that a later re-enable-and-disable cycle is a *new* situation, so consumers should treat each emission independently.
- **No runtime code beyond the const.** The `declare module` block is erased at compile time; the only shipped artifact is the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` string.
