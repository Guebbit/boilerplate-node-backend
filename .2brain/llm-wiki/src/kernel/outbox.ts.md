---
source: src/kernel/outbox.ts
sha256: 295fe16905c8b9e4de9db6cec390e2f56693423c9fc4c9b152363ca53e7360d4
generated_at: 2026-10-29T02:20:18.351648+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/outbox.ts

## Purpose

Implements the transactional outbox pattern: a domain event row is written to the `outboxevents` Mongo collection inside the **same** `ClientSession` transaction as the state change it announces. A relay (nudged post-commit, backed by a `sweep:outbox` job) later publishes each row to the in-process event bus with at-least-once delivery, per-aggregate ordering, exponential backoff, and a terminal `dead` state. This is the durable event path; `./events` alone has no durability.

## Key elements

- **`OutboxStatus`** — `'pending' | 'published' | 'dead'`.
- **`OutboxEventDocument`** — Mongoose document shape: `name`, `payload`, `aggregateId`, `status`, `attempts`, `nextAttemptAt`, `lockedUntil`, `lastError`, `publishedAt`.
- **`outboxEventModel`** — Mongoose model (collection `outboxevents`). Two indexes: a composite read index (`status`, `createdAt`, `_id`) and a TTL index on `publishedAt` (retention from `NODE_OUTBOX_RETENTION_DAYS`).
- **`enqueueOutboxEvent(name, payload, aggregateId, session)`** — inserts a row **within** the caller's transaction. `session` is mandatory; omitting it defeats the pattern.
- **`outboxBackoffMs(failedAttempts)`** — exponential backoff (5 s base, 1 h cap, no jitter). Sourced from `outbox.generated.ts`.
- **`OUTBOX_EVENT_DEAD`** / `'outbox.event_dead'` — internal in-process event emitted (not enqueued) when a row is parked as `dead`. Declared via module augmentation on `DomainEventMap`.
- **`RelayResult`** — `{ published, retried, dead }` counters returned by one relay pass.
- **Relay internals** (module-private): `findHeads` (aggregation picking each aggregate's oldest due, unclaimed pending row), `claim` (atomic lease via `findOneAndUpdate`), `dispatch` (hands row to `emitDomainEvent`; never rejects), `markPublished`, `markFailed`, `relayOne`.

## Relationships

- **`src/kernel/events.ts`** — consumes `emitDomainEvent`, `domainEventsWired`, `DomainEventMap`, `DomainEventName`; augments `DomainEventMap` with `'outbox.event_dead'`.
- **`src/kernel/config.ts`** — reads `outboxConfig()` for retention days, max attempts, lease seconds.
- **`src/kernel/outbox.generated.ts`** — provides `outboxRuleData` (backoff base & cap) used by `outboxBackoffMs`.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` (used by callers that pair state writes with `enqueueOutboxEvent`).
- **`src/infrastructure/adapters/logger.ts`** — logs an error line when a row is parked as `dead`.
- **`src/infrastructure/observability/metrics-outbox.ts`** — records published / retried / dead counters and the pending-reader gauge.
- **`src/app/jobs.ts`** — schedules the periodic `sweep:outbox` relay pass (the backstop).
- **`src/app.ts`** — application bootstrap; wires the outbox relay and the post-commit nudge.
- **`src/modules/account/services/*`** (export-job, password, profile, revocation, two-factor-enrollment) — domain callers that invoke `enqueueOutboxEvent` inside their write transactions.
- **`src/modules/account/tests/integration/*`** — integration tests exercising the outbox end-to-end (consent withdrawal, export).

## Notes

- **Per-aggregate ordering is strict.** An aggregate's oldest pending row blocks all later rows for that aggregate, *even while it is in backoff or held by another relay's lease*. This is intentional: skipping the head would reorder events.
- **At-least-once, not exactly-once.** A crash between dispatch and `markPublished` re-dispatches on the next sweep. Consumers that cannot tolerate duplicates must dedupe on `meta.eventId` (the Mongo `_id` string).
- **No backoff jitter.** Rows are claimed one aggregate at a time, so there is no thundering-herd problem to spread.
- **`outbox.event_dead` is in-process only.** It is emitted via `emitDomainEvent`, not written to the outbox itself, to avoid a dead-row-about-a-dead-row infinite loop.
- **TTL index rebuild.** Changing `NODE_OUTBOX_RETENTION_DAYS` and restarting the app will fail boot until `npm run db:sync` rebuilds the TTL index.
- **Lease safety.** `lockedUntil` is a self-expiring timestamp; a crashed relay frees its rows automatically. Two concurrent relays compete via a single atomic `findOneAndUpdate` — exactly one wins.
- **`dispatch` never rejects.** It resolves to `undefined` on success or a human-readable failure string, keeping the relay's success/failure branching in one place.
