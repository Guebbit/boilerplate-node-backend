---
source: src/kernel/outbox.ts
sha256: 58527bb15075fc49723d358d48826b46fe89eaf06cb9dc38f1d3942399a9e87e
generated_at: 2026-10-14T08:23:33.132095+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/outbox.ts

## Purpose

Implements the **transactional outbox** pattern on top of MongoDB: a domain event is written in the *same* Mongo transaction as the state change it announces, guaranteeing atomic visibility. A relay then publishes the event to the in-process bus (`./events`) with at-least-once delivery, per-aggregate ordering, exponential backoff, and a dead-letter state for operator intervention.

## Key elements

- **`enqueueOutboxEvent(name, payload, aggregateId, session)`** — Writes one outbox row inside the caller's `ClientSession` transaction. The session is mandatory; a row written outside the transaction would defeat the purpose of the outbox.
- **`outboxEventModel` / `outboxEventSchema`** — Mongoose model (`OutboxEvent`, collection `outboxevents`). Two indexes: one for relay reads (`status`, `createdAt`, `_id`), one TTL index on `publishedAt` (retention from `NODE_OUTBOX_RETENTION_DAYS`).
- **`outboxBackoffMs(failedAttempts)`** — Exponential backoff: 5 s base, doubles per attempt, capped at 1 h. No jitter (rows are processed one aggregate at a time).
- **`relayOutbox()`** (truncated in source) — One relay pass: repeatedly calls `findHeads` → `claim` → `dispatch` → `markPublished`/`markFailed` for up to `MAX_ROUNDS` rounds of `HEADS_PER_ROUND` (50) heads. Rows of different aggregates run in parallel; rows of one aggregate are strictly sequential.
- **`RelayResult`** — `{ published, retried, dead }` counters returned by a relay pass.
- **`OutboxStatus`** — `'pending' | 'published' | 'dead'`.
- **`findHeads`** (internal) — Aggregation pipeline that picks each aggregate's *oldest* pending row (before filtering on due/lease), preserving per-aggregate order.
- **`claim`** (internal) — Atomic `findOneAndUpdate` lease; only one relay wins a contested row.
- **`dispatch`** (internal) — Forwards the row to `emitDomainEvent` (the in-process bus). Never rejects; returns a failure string or `undefined`.
- **`markPublished` / `markFailed`** (internal) — Conditional updates guarded on `status: 'pending'` so a peer relay that already settled the row is not clobbered.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Imports `emitDomainEvent`, `DomainEventMap`, `DomainEventName`, `domainEventsWired`. The outbox is the *durable* front-end to this in-process bus; dispatch calls `emitDomainEvent`. |
| `src/kernel/config.ts` | Reads `outboxConfig()` for `NODE_OUTBOX_RETENTION_DAYS`, `NODE_OUTBOX_MAX_ATTEMPTS`, `NODE_OUTBOX_LEASE_SECONDS`. |
| `src/infrastructure/runtime/database.ts` | Imports `withTransaction` (used by callers to wrap state-change + `enqueueOutboxEvent` in one transaction). |
| `src/infrastructure/adapters/logger.ts` | Logs an error when a row is parked as `dead`. |
| `src/infrastructure/observability/metrics-outbox.ts` | Increments `outboxEventsPublishedTotal`, `outboxEventsRetriedTotal`, `outboxEventsDeadTotal`; registers a pending-reader gauge via `setOutboxPendingReader`. |
| `scripts/ops/sweep-outbox.ts` | Periodic backstop that invokes the relay (the "every minute" sweep mentioned in the module doc). |
| `src/app.ts` | Application entry point; wires the fast-path nudge and the sweep relay into the running process. |
| `src/modules/account/services/revocation.ts`, `password.ts` | Producers: call `enqueueOutboxEvent` inside their transactions to announce revocation / password-change events. |
| Integration tests (`revocation-causes`, `session-epoch`, `revoked-by-account`, `sessions-revoked-outbox`) | Exercise the outbox indirectly by asserting that events were published after the relevant service mutations. |

## Notes

- **At-least-once, not exactly-once.** A crash between successful dispatch and `markPublished` re-dispatches the event. Consumers must deduplicate on `meta.eventId` (set to the row's `_id`).
- **Per-aggregate ordering is enforced by design, not by a queue.** `findHeads` groups by `aggregateId` and picks the oldest row *before* the due/lease filter, so a row waiting out backoff or held by another relay blocks all later rows of that aggregate.
- **Lease, not lock.** `lockedUntil` is a timestamp, not a distributed lock; it self-expires if a relay crashes. The lease duration (`NODE_OUTBOX_LEASE_SECONDS`) must exceed the slowest dispatch or duplicates occur.
- **TTL index caveat.** Changing `NODE_OUTBOX_RETENTION_DAYS` and restarting will fail boot until `npm run db:sync` rebuilds the index.
- **`dispatch` never rejects.** Both the resolve and reject paths of `emitDomainEvent` are mapped to a string-or-undefined result, so a consumer error is a *retryable failure*, not an unhandled exception in the relay.
- **`domainEventsWired`** is imported but not referenced in the visible (non-truncated) code; it is likely used in the truncated relay/app wiring or re-exported for external setup.
