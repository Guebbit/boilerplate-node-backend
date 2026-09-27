---
source: src/modules/webhooks/services/publish.ts
sha256: 7bf723dce43dc9aa6d3e7c4ee8c029eb719615796f780a9625e08a6af35a6314
generated_at: 2026-09-27T15:44:33.750849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

Domain-event subscriber for the webhooks module. It registers one `onDomainEvent` listener per public-event target declared by any enabled module, projects each incoming domain-event payload into a public event, matches it against every enabled subscription's filter, and fans out one delivery row plus one queue message per match. It exists so that `webhooks` never imports from feature modules like `orders` or `payments`; the reverse edge is a domain event dispatched through the kernel.

## Key elements

- **`subscribeToWebhookEvents(publicEvents)`** — the sole export. Called once from `module.ts`'s `onRegistered` hook. Iterates the `publicEvents` record (keyed by domain-event name) and calls `subscribeToTarget` for each entry that has a target.
- **`subscribeToTarget(domainEventName, target)`** — registers a single `onDomainEvent` listener. Invokes `target.toPublicEvent(payload)` to project; if the result is `undefined` the listener is a no-op, otherwise it calls `fanOut`.
- **`fanOut(event)`** — generates one shared `eventId` (UUID), loads all enabled subscriptions, filters them via `matchesEventFilter`, and calls `deliverToOne` for each match in parallel (`Promise.all`).
- **`deliverToOne(subscription, event, eventId)`** — creates the delivery row, then enqueues the first attempt. Catches errors per-subscription so one failure never blocks sibling deliveries.
- **`createDeliveryRow(subscription, event, eventId)`** — writes a `WebhookDeliveryDocument` with `attempt: 1`, `status: 'pending'`, and `nextAttemptAt: now`.

## Relationships

- **`kernel/events.ts`** — subscribes via `onDomainEvent`; imports the `DomainEventName` type.
- **`kernel/registry.ts`** — imports `PublicEventProjection` and `PublicEventTarget` types; the `publicEvents` record passed in at boot is the result of `resolvePublicEvents`.
- **`webhooks/module.ts`** — caller: invokes `subscribeToWebhookEvents` inside its `onRegistered` hook.
- **`webhooks/repository.ts`** — reads enabled subscriptions (`webhookSubscriptionRepository.findEnabled`) and writes delivery rows (`webhookDeliveryRepository.create`).
- **`webhooks/domain/` (index → `event-filter.ts`)** — uses `matchesEventFilter` to decide whether a subscription matches the projected event type.
- **`webhooks/model.ts`** — type-level dependency: `WebhookSubscriptionDocument` and `WebhookDeliveryDocument`.
- **`webhooks/services/enqueue.ts`** — calls `enqueueDeliveryAttempt` to push the first attempt onto the queue.
- **`infrastructure/adapters/logger.ts`** — logs a structured error if a single subscription's fan-out fails.
- **`webhooks/services/index.ts`** — barrel re-export.

## Notes

- **Shared `eventId` for dedup.** All subscriptions matching one domain event receive the same UUID so consumers can deduplicate on `webhook-id` per Standard Webhooks, across both retries of one delivery and across sibling subscriptions.
- **Fire-and-forget enqueue.** If `enqueueDeliveryAttempt` throws (broker down, publish error), the delivery row it already wrote stays `pending`. The `scripts/ops/sweep-webhook-retries.ts` script picks it up on its next pass — delivery is delayed, never lost.
- **Per-subscription isolation.** `deliverToOne` catches its own errors; one subscription's write or enqueue failure does not abort the `Promise.all` for other subscriptions.
- **Two deliberate casts in `subscribeToTarget`.** `domainEventName` is cast to `DomainEventName` (it is a real name from a module manifest, just not a compile-time literal). `target.toPublicEvent` is cast to `(payload: unknown) => …` because the registry stores it as `(payload: never) => …` to satisfy the union across all modules. Neither cast introduces `any`.
- **`toPublicEvent` may return `undefined`.** Not every domain-event payload maps to a public event (e.g. `order.status_changed` with a status other than `paid`/`shipped`). In that case `fanOut` is never called.
