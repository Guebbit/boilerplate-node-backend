---
source: src/modules/webhooks/services/publish.ts
sha256: 9134ad66b1f4d071170b55860598a586eb087827b019a4dd1894886ad55302c6
generated_at: 2026-11-08T09:06:50.275866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

Domain-event subscriber for the webhooks module. Once every registered module is known, it listens to each domain event that a module's manifest names a `PublicEventTarget` for, projects the payload into a public event, matches it against every enabled subscription's filter, and fans out one delivery row + one queue message per match. The reverse dependency is a domain event, not an import, keeping `webhooks` decoupled from business modules like `orders` or `payments`.

## Key elements

- **`subscribeToWebhookEvents`** *(exported)* — Entry point called from `../module.ts`'s `onRegistered` hook. Iterates the `publicEvents` map (from `kernel/registry.ts`'s `resolvePublicEvents`) and registers one domain-event listener per `PublicEventTarget`.
- **`subscribeToTarget`** — Wires one `onDomainEvent` listener. Casts `toPublicEvent` from its `never`-typed storage to a callable accepting `unknown`, then delegates to `fanOut` only when the projection resolves.
- **`fanOut`** — Loads enabled subscriptions, filters by `matchesEventFilter`, and fans out with `Promise.allSettled` so every matching subscription is attempted even if one fails. Shares a single `eventId` across all matches (dedup key per Standard Webhooks). On failure, logs and throws so the outbox retries.
- **`deliverToOne`** — Creates the delivery row, then enqueues the first attempt via `enqueueDeliveryAttempt`. No-op if the row already existed (idempotent path).
- **`createDeliveryRow`** — Inserts a `pending` delivery row (attempt 1). Catches duplicate-key errors from the unique `(subscriptionId, eventId)` index and returns `null` instead of throwing, handling at-least-once outbox redelivery.

## Relationships

- **`@kernel/events`** — Registers listeners via `onDomainEvent`; the `meta.eventId` from the event bus is reused as the fan-out `eventId` for outbox-originated events.
- **`@kernel/registry`** — Consumes `PublicEventTarget` and `PublicEventProjection` types; the `publicEvents` record passed to `subscribeToWebhookEvents` is produced by `resolvePublicEvents`.
- **`@infrastructure/adapters/logger`** — Logs an error line when one or more subscription fan-outs reject.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` guards the idempotent insert in `createDeliveryRow`.
- **`../repository`** — Reads enabled subscriptions (`findEnabled`) and creates delivery rows.
- **`../domain`** — `matchesEventFilter` is the per-subscription filter predicate.
- **`./enqueue`** — `enqueueDeliveryAttempt` publishes the first delivery attempt to the queue.
- **`./sweep.ts`** *(referenced in docs comment)* — Picks up `pending` deliveries when the queue publish fails and re-publishes (or self-delivers without a broker).
- **`../module.ts`** *(referenced in docs comment)* — Calls `subscribeToWebhookEvents` from its `onRegistered` hook, after all modules are registered.
- **`tests/integration/fan-out.test.ts`** — Integration tests for the fan-out and retry-skip behavior.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests for the queue adapter that `enqueueDeliveryAttempt` relies on.

## Notes

- **Fire-and-forget queue publish:** If the queue publish fails (no broker, network error), the delivery row stays `pending` and `sweep:webhook-retries` recovers it later. This is intentional—delivery is never lost, only delayed to the sweep interval.
- **`eventId` dedup:** The outbox row's id is threaded through as `eventId` so a redelivered event hits the unique index and skips row creation. In-process emits with no outbox id get a fresh `randomUUID()`.
- **Two casts in `subscribeToTarget`:** `domainEventName` is cast to `DomainEventName` (it came from a real manifest at boot but isn't a compile-time literal), and `toPublicEvent` is cast from `(payload: never) => …` to `(payload: unknown) => …`. Both are narrowing, not laundering `any`; the same pattern appears in `kernel/events.ts`.
- **`allSettled` + collective throw:** All subscriptions are attempted even if one fails. Failures are collected, logged once, and thrown together so the outbox sees a single retry signal; already-created rows are skipped on the retry via the duplicate-key path.
