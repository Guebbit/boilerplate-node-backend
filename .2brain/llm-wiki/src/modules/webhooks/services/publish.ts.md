---
source: src/modules/webhooks/services/publish.ts
sha256: ccde70564b7a16c7a4e50e4fecff702ea78c4f5d60d25d35ef3a8959a22c66f9
generated_at: 2026-10-15T12:21:57.308605+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

Domain-event subscriber that listens to every event a registered module's manifest names a `PublicEventTarget` for, matches each projected public event against enabled subscription filters, and fans out one delivery row plus one queue message per match. Registered once from `module.ts`'s `onRegistered` hook after all modules are known.

## Key elements

- **`subscribeToWebhookEvents(publicEvents)`** — sole export. Iterates the `Record<string, PublicEventTarget | undefined>` map (keyed by domain event name) and calls `subscribeToTarget` for each entry that has a target.
- **`subscribeToTarget(domainEventName, target)`** — registers one `onDomainEvent` listener. Casts `target.toPublicEvent` to `(payload: unknown) => PublicEventProjection | undefined`, projects the payload, and calls `fanOut` only when a public event is produced.
- **`fanOut(event, eventId?)`** — loads enabled subscriptions, filters via `matchesEventFilter`, and calls `deliverToOne` for each match using `Promise.allSettled`. Shares a single `eventId` (from `meta.eventId` or a fresh `randomUUID()`) across all matches for Standard Webhooks dedup. Collects rejections, logs, and rethrows so the outbox/bus can retry.
- **`deliverToOne(subscription, event, eventId)`** — calls `createDeliveryRow`; if a row is returned, enqueues its first attempt via `enqueueDeliveryAttempt`. Returns `void` either way (existing row ≠ failure).
- **`createDeliveryRow(subscription, event, eventId)`** — inserts a delivery document (`attempt: 1`, `status: 'pending'`). Catches duplicate-key errors (same `subscriptionId` + `eventId`) and returns `null` to make the write idempotent.

## Relationships

- **`src/kernel/events.ts`** — imports `onDomainEvent` and `DomainEventName`; the listener registration mechanism.
- **`src/kernel/registry.ts`** — imports `PublicEventProjection` and `PublicEventTarget` types that define the event→public-event mapping contract.
- **`src/modules/webhooks/module.ts`** — caller of `subscribeToWebhookEvents` inside its `onRegistered` hook.
- **`src/modules/webhooks/repository.ts`** — provides `webhookSubscriptionRepository.findEnabled()` and `webhookDeliveryRepository.create()`.
- **`src/modules/webhooks/domain/index.ts`** (re-exports `event-filter.ts`) — provides `matchesEventFilter`.
- **`src/modules/webhooks/services/enqueue.ts`** — provides `enqueueDeliveryAttempt`.
- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey` for the idempotency guard.
- **`src/infrastructure/adapters/logger.ts`** — used for the fan-out failure error log.
- **`src/modules/webhooks/model.ts`** — type source for `WebhookDeliveryDocument` and `WebhookSubscriptionDocument`.

## Notes

- **Fire-and-forget enqueue on purpose:** if the queue publish fails, the delivery row stays `pending` and is recovered by `scripts/ops/sweep-webhook-retries.ts`. Nothing is lost, only delayed.
- **Idempotency is index-backed:** the unique `(subscriptionId, eventId)` index turns a second outbox delivery into a silent `null` return, not a duplicate row.
- **Shared `eventId` across fan-out:** all subscriptions matching one event share the same id, so a consumer deduping on `webhook-id` treats them as one logical event (Standard Webhooks). On outbox redelivery the original id is preserved via `meta.eventId`; in-process emits get a fresh UUID.
- **`allSettled` + throw-all:** every matching subscription is attempted even if an earlier one fails. Failures are then thrown as a single error so the bus/outbox retries the whole event; already-created rows are skipped on that retry by the duplicate-key guard.
- **Two casts in `subscribeToTarget`** are documented as narrowing (the manifest is resolved at boot, not compile-time; the registry stores `toPublicEvent` as `(payload: never) => …`), not as `any` laundering.
