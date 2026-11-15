---
source: src/kernel/outbox.ts
sha256: 8f3202614c2a40094e48813be30bf6292ad685dcec392ec526d70fdb93b15f81
generated_at: 2026-11-14T18:23:09.559201+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/outbox.ts

## Purpose

Implements the transactional outbox pattern: a domain event is written into the `outboxevents` Mongo collection inside the **same transaction** as the state change it announces, then a relay process picks it up and publishes it to the in-process event bus. This is the durable (at-least-once) delivery path, as opposed to the fire-and-forget bus in `./events` which offers no durability. Guarantees per-aggregate ordering, exponential-backoff retries, lease-based claim safety across concurrent relays, and TTL-based cleanup of published rows.

## Key elements

- **`enqueueOutboxEvent(name, payload, aggregateId, session)`** — Writes one outbox row inside the caller's Mongo transaction. The `session` parameter is required to prevent an event from being written outside the state-change transaction.
- **`outboxEventModel`** — Mongoose model for the `outboxevents` collection. Carries a read index (`status`, `createdAt`, `_id`) for the relay aggregation, and a TTL index on `publishedAt` (configured via `NODE_OUTBOX_RETENTION_DAYS`).
- **`OutboxEventDocument`** — The stored row shape: `name`, `payload`, `aggregateId`, `status`, `attempts`, `nextAttemptAt`, `lockedUntil`, `leaseToken`, `lastError`, `publishedAt`.
- **`OutboxStatus`** — Union type (`pending` / `published` / `dead`) derived from the `OUTBOX_STATUSES` const tuple.
- **`OUTBOX_EVENT_DEAD`** — Constant for the `'outbox.event_dead'` event, registered via a module augmentation of `DomainEventMap`. Emitted in-process (not via the outbox) when a row is parked as dead.
- **`outboxBackoffMs(failedAttempts)`** — Exponential backoff (base × 2ⁿ, capped). No jitter; per-aggregate claim serialisation makes it unnecessary.
- **`RelayResult`** — `{ published, retried, dead }` counts returned by one relay pass.
- **`findHeads`** (internal) — Aggregation selecting, per aggregate, the oldest `pending` row that is due and unclaimed. The head is chosen *before* the due/lease filter so a backoff-waiting or leased head correctly blocks its aggregate's later rows.
- **`claim`** (internal) — Atomic `findOneAndUpdate` setting `lockedUntil` and a fresh `leaseToken` (UUID). Exactly one of two concurrent relays wins.
- **`dispatch`** (internal) — Hands the row to `emitDomainEvent`. Never rejects; returns `undefined` on success or an error string.
- **`markPublished`** (internal) — Conditional `updateOne` gated on the claim's `leaseToken`. A relay that outlived its lease matches zero documents and writes nothing.

## Relationships

- **`src/kernel/events.ts`** — Imports `emitDomainEvent`, `DomainEventMap`, `DomainEventName`. Also augments `DomainEventMap` to register the dead-row notification event. The outbox is the durable complement to the in-process bus this module provides.
- **`src/kernel/config.ts`** — Imports `outboxConfig` for `NODE_OUTBOX_LEASE_SECONDS` and `NODE_OUTBOX_RETENTION_DAYS`.
- **`src/infrastructure/observability/metrics-outbox.ts`** — Imports `outboxEventsPublishedTotal`, `outboxEventsRetriedTotal`, `outboxEventsDeadTotal`, `setOutboxPendingReader` for Prometheus metrics.
- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to omit `leaseToken` from the model's JSON wire shape.
- **`src/infrastructure/runtime/database.ts`** — Imports `withTransaction`; callers pair it with `enqueueOutboxEvent` to write the row atomically with the state change.
- **`src/domain-primitives/time.ts`** — Imports `DAY_SECONDS` for the TTL index calculation.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for lease-lost warnings and operational logging.
- **`scripts/ops/prepare-job.ts`, `scripts/ops/reapply-erasures.ts`** — Operational scripts that exercise outbox paths during job preparation and erasure reapplication.
- **`src/app.ts`, `src/app/jobs.ts`** — Application bootstrap and job scheduling; wire up the relay sweep and outbox lifecycle.
- **`src/modules/account/services/export-job.ts`, `src/modules/account/services/password.ts`, `src/modules/account/services/profile.ts`, `src/modules/account/services/revocation.ts`** — Domain services that call `enqueueOutboxEvent` within their respective transactions to announce account-level state changes durably.

## Notes

- **Session is mandatory.** Calling `enqueueOutboxEvent` without a `ClientSession` would write the event row outside the state-change transaction — the exact failure mode the outbox prevents. The type signature enforces this.
- **Lease-token pattern.** Every result write is conditional on the `leaseToken` the claiming relay generated. A relay whose lease expires mid-dispatch finds the token changed and its update matches zero documents. This replaces distributed locks.
- **Dead rows are terminal.** A `dead` row has no `publishedAt`, so the TTL index never removes it. It does not block its aggregate's later rows. An operator must intervene.
- **No jitter in backoff.** Deliberate: rows are claimed one aggregate at a time, so there is no thundering-herd to spread.
- **TTL index and config.** Changing `NODE_OUTBOX_RETENTION_DAYS` and restarting will fail boot until `npm run db:sync` rebuilds the index.
- **`outbox.generated`** (imported as `./outbox.generated`) supplies `outboxRuleData` (backoff base and cap). It is a build-time generated file and not part of the source graph.
- **Mongoose array-form `create`.** The write uses `model.create([doc], { session })` because Mongoose only accepts a session option in the array overload for single-document writes.
