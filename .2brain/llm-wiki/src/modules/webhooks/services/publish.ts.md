---
source: src/modules/webhooks/services/publish.ts
sha256: 9134ad66b1f4d071170b55860598a586eb087827b019a4dd1894886ad55302c6
generated_at: 2026-10-29T06:30:32.659195+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

The domain-event subscriber for webhooks. It registers one listener per `PublicEventTarget` declared by every module (resolved at boot via `kernel/registry.ts`), projects incoming domain events into public events, matches them against enabled subscriptions' filters, and fans out one delivery row plus one queue message per match. It is the single entry point that connects the kernel event bus to the webhook delivery pipeline without any module importing from `webhooks`.

## Key elements

- **`subscribeToWebhookEvents`** (exported) — Entry point called once from `../module.ts`'s `onRegistered` hook. Iterates over the `publicEvents` record and calls `subscribeToTarget` for each defined target.
- **`subscribeToTarget`** (private) — Registers one `onDomainEvent` listener. Casts `toPublicEvent` to accept `unknown`, projects the payload, and calls `fanOut` only when the projection yields a public event.
- **`fanOut`** (private) — Loads all enabled subscriptions, filters via `matchesEventFilter`, and calls `deliverToOne` for each match using `Promise.allSettled`. Shares a single `eventId` (from outbox `meta.eventId` or a fresh UUID) across all matches. Throws a combined error if any delivery fails.
- **`deliverToOne`** (private) — Writes the delivery row for one subscription, then enqueues its first attempt via `enqueueDeliveryAttempt`. A row that already exists (duplicate) is a no-op, not a failure.
- **`createDeliveryRow`** (private) — Inserts a `pending` delivery document (`attempt: 1`). Catches duplicate-key errors and returns `null` for idempotency on `(subscriptionId, eventId)`.

## Relationships

- **`@kernel/events`** — Calls `onDomainEvent` to attach listeners; imports `DomainEventName` type.
- **`@kernel/registry`** — Imports `PublicEventProjection` and `PublicEventTarget` types; the `publicEvents` record passed into `subscribeToWebhookEvents` is the output of `resolvePublicEvents`.
- **`@infrastructure/adapters/logger`** — Logs an error via `logger.error` when one or more fan-out deliveries fail.
- **`@infrastructure/persistence/mongo-errors`** — Uses `isDuplicateKey` to treat a unique-index violation as "row already exists" rather than a real error.
- **`../domain` (barrel → `event-filter.ts`)** — Calls `matchesEventFilter(event.eventType, subscription.eventTypes)` to decide whether a subscription matches the incoming event.
- **`../model`** — Imports `WebhookDeliveryDocument` and `WebhookSubscriptionDocument` types.
- **`../repository`** — Uses `webhookSubscriptionRepository.findEnabled()` and `webhookDeliveryRepository.create()`.
- **`./enqueue`** — Calls `enqueueDeliveryAttempt` to push the first attempt onto the queue.
- **`./index`** — Barrel re-export; this file is part of the public surface of the webhooks services module.
- **`tests/integration/fan-out.test.ts`** — Integration tests exercising the fan-out path (matching, idempotency, failure aggregation).
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests for the queue adapter whose publish path this file triggers fire-and-forget.

## Notes

- **Fire-and-forget publish:** If the queue publish fails (no broker, transient error), the delivery row remains `pending`. The `sweep:webhook-retries` job re-publishes it. This is intentional — the system degrades to delayed delivery rather than losing the event.
- **Shared `eventId`:** All subscriptions matched by one event share the same `eventId`, which is what a consumer deduplicates on (`webhook-id` header, per Standard Webhooks). When the event arrives via the outbox, `meta.eventId` is reused so redeliveries are recognised by the unique index.
- **`allSettled` semantics:** Every matching subscription is attempted even if an earlier one fails. Failures are collected and thrown as a single error, causing the event bus to return `false` and the outbox to retry the whole event; already-created rows are then skipped idempotently.
- **Two type casts:** `domainEventName` is cast to `DomainEventName` (it is a real name from a module manifest, just not a compile-time literal). `toPublicEvent` is cast from `(payload: never) => …` to `(payload: unknown) => …` because the registry stores one generic lookup for all modules. Neither is an `any` laundering.
- **`attempt` always starts at 1** in `createDeliveryRow`; incrementing is the job of `./attempt.ts` during retries.
