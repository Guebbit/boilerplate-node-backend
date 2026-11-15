---
source: src/modules/webhooks/services/publish.ts
sha256: 26cca523317859bc1ddaea34d4194761890af26e7f87f7212e28244e8763bb8e
generated_at: 2026-11-14T22:47:33.462534+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

Domain-event subscriber for webhooks. It registers one listener per `PublicEventTarget` declared in each module's manifest (resolved via `kernel/registry.ts`), projects each incoming domain event into a public event, matches it against every enabled subscription's filter, and fans out — creating one delivery row and one queue message per match. It runs once at boot from `../module.ts`'s `onRegistered` hook, after all modules are registered.

## Key elements

- **`subscribeToWebhookEvents`** (exported) — Entry point. Iterates over the `publicEvents` map and calls `subscribeToTarget` for each target.
- **`subscribeToTarget`** (internal) — Registers a single `onDomainEvent` listener for one domain-event name. Projects the payload via `target.toPublicEvent`; fans out only when the projection is defined.
- **`fanOut`** (internal) — Loads enabled subscriptions, filters by `matchesEventFilter`, then calls `deliverToOne` for each match using `Promise.allSettled`. Throws an aggregated error if any match fails so the outbox can retry.
- **`deliverToOne`** (internal) — Creates the delivery row, then enqueues its first attempt. A pre-existing row (duplicate) is a no-op, not a failure.
- **`createDeliveryRow`** (internal) — Inserts a `WebhookDeliveryDocument` with `attempt: 1`, `status: 'pending'`. Catches duplicate-key errors and returns `null` for idempotency.

## Relationships

- **`src/kernel/events.ts`** — Subscribes via `onDomainEvent`; receives `meta.eventId` for outbox-originated events.
- **`src/kernel/registry.ts`** — Consumes `PublicEventProjection` and `PublicEventTarget` types; the `publicEvents` map passed in is produced by `resolvePublicEvents`.
- **`src/modules/webhooks/repository.ts`** — Reads enabled subscriptions and writes delivery rows via the two repository instances imported from this file.
- **`src/modules/webhooks/domain/index.ts`** / **`src/modules/webhooks/domain/event-filter.ts`** — Calls `matchesEventFilter` to test whether a subscription applies to the event type.
- **`src/modules/webhooks/model.ts`** — Uses `WebhookDeliveryDocument` and `WebhookSubscriptionDocument` types for row shapes.
- **`src/modules/webhooks/services/enqueue.ts`** — Calls `enqueueDeliveryAttempt` after a successful row insert.
- **`src/modules/webhooks/services/index.ts`** — Barrel file that re-exports this module alongside siblings.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Uses `isDuplicateKey` to detect at-least-once redelivery.
- **`src/infrastructure/adapters/logger.ts`** — Logs an error summary when one or more fan-out attempts fail.
- **`src/modules/webhooks/tests/integration/fan-out.test.ts`** — Integration tests exercising the fan-out and retry paths.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests covering the queue adapter that `enqueueDeliveryAttempt` ultimately targets.

## Notes

- **Fire-and-forget queue publish is intentional.** If the broker is unavailable, the delivery row stays `pending` and a sweep job re-publishes it. The system degrades to delayed delivery, never to lost.
- **One shared `eventId` across all matches.** This is the Standard Webhooks `webhook-id` a consumer dedupes on. It comes from `meta.eventId` (outbox) or a fresh `randomUUID()` (in-process emit).
- **`allSettled` semantics.** All matching subscriptions are attempted even if one fails; failures are then thrown together so the outbox retries the whole event. Already-inserted rows are skipped on retry via the unique index.
- **Two intentional casts.** `domainEventName` is cast to `DomainEventName` (runtime string from registry, not a compile-time literal); `target.toPublicEvent` is cast from `(payload: never) => …` to `(payload: unknown) => …` because one registry slot holds every module's target. Neither is laundering `any`.
- **No import from `webhooks` into other modules.** The reverse dependency (orders/payments → webhooks) is expressed solely through domain events and the registry lookup.
