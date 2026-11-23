---
source: src/kernel/outbox.ts
source_sha256: 1be47b8ce688c427cef5adb5597c768b791f543ca90a32b3e8adfc14f340f32a
context_sha256: e4739430300963be064ae06c9c25684f0259eb5d9e974a36d116c0c16f193e7d
generated_at: 2026-11-22T03:13:50.749946+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/outbox.ts

## Purpose
Implements the transactional outbox: a domain event is written as a row in the same Mongo transaction as the state change it announces, and a relay publishes it afterwards. It is the durable alternative to the in-process bus in `./events`, which has no durability. Delivery is at-least-once, ordered per aggregate, with exponential-backoff retries and a terminal `dead` status.

## Key elements
- `OUTBOX_EVENT_DEAD` (`'outbox.event_dead'`): the channel for the dead-row notification. It is a plain in-process emit, not an outbox row, so a row about the outbox cannot itself die and loop.
- `OutboxStatus`: `'pending' | 'published' | 'dead'`. `dead` is terminal and needs an operator.
- `OutboxEventDocument` / `OutboxEventModel`: the row type. Fields are `name`, `payload`, `aggregateId`, `status`, `attempts`, `nextAttemptAt`, `lockedUntil`, `leaseToken`, `lastError`, `publishedAt` and `createdAt`.
- `outboxEventModel`: the Mongoose model `OutboxEvent` (collection `outboxevents`). Its schema sets `minimize: false` so an empty `{}` payload is kept. It has two indexes:
  - `{status, createdAt, _id}` for the relay's read.
  - A TTL index on `publishedAt`, set from `NODE_OUTBOX_RETENTION_DAYS`.
- `outboxBackoffMs(failedAttempts)`: returns `min(backoffCapMs, backoffBaseMs * 2^(n-1))`, using values from `outboxRuleData` (imported from `./outbox.generated`). There is no jitter.
- `enqueueOutboxEvent(name, payload, aggregateId, session)`: creates a pending row inside the caller's transaction. The session is required. The payload type is checked against `DomainEventMap`.
- `RelayResult`: `{published, retried, dead}` counts for one relay pass.
- Internal helpers:
  - `findHeads(limit)`: aggregates each aggregate's oldest pending row, then keeps only the heads that are due and unleased.
  - `claim(row)`: one atomic `findOneAndUpdate` that takes a lease with a fresh `randomUUID` token. It returns `null` if a peer holds the row.
  - `dispatch(row)`: validates the stored name and payload against the contract, then calls `emitDomainEvent` with `meta.eventId` set to the row's `_id`. It never rejects and returns an error string on failure.

## Relationships
- `src/kernel/events.ts`: `dispatch` calls `emitDomainEvent` to hand rows to the bus. `domainEventsWired` is also imported from there.
- `src/kernel/config.ts`: `outboxConfig()` supplies `NODE_OUTBOX_RETENTION_DAYS` and `NODE_OUTBOX_LEASE_SECONDS`.
- `src/infrastructure/runtime/database.ts`: `withTransaction` provides the session that callers pass to `enqueueOutboxEvent`.
- `src/infrastructure/persistence/serialize.ts`: `applySerialization` omits `leaseToken` from `toJSON`.
- `src/infrastructure/observability/metrics-outbox.ts`: provides the published, retried and dead counters and `setOutboxPendingReader`.
- `src/infrastructure/adapters/logger.ts`: provides the logger.
- `src/domain-primitives/time.ts`: `DAY_SECONDS` is used to compute the TTL.
- `@types`: provides the domain event names, schemas and `DomainEventMap`.
- Neighbors such as the account services (`erasure-ledger`, `export-job`, `password`, `profile`, `revocation`) and `src/app/jobs.ts` / `process-boot.ts` sit next to this file in the graph. The visible portion of the file does not show how they use it.

## Notes
- Consumers where a duplicate does harm (stock, money, webhook fan-out) must dedupe on `meta.eventId`. A mail may repeat.
- Ordering is per aggregate: `findHeads` picks the oldest unpublished row before applying the due filter. A head that is backing off or leased by another relay therefore holds back that aggregate's later rows. A dead row does not block its aggregate.
- Two relayers run together: the writer nudges one right after commit, and `sweep:outbox` runs one on a schedule as the backstop. Each claim has its own `leaseToken`. A relay whose lease lapsed mid-dispatch finds the token changed, writes nothing, counts nothing and logs a warning.
- Unknown event names or payloads that fail their schema are retried, then go dead. During a rolling deploy a newer build may know the event. Unknown payload fields are dropped.
- Changing `NODE_OUTBOX_RETENTION_DAYS` and restarting fails the boot until `npm run db:sync` rebuilds the TTL index. Dead rows have no `publishedAt`, so the TTL never removes them.
- The lease must outlast one dispatch, or a slow dispatch gets duplicated.
