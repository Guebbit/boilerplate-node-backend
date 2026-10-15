---
source: tests/integration/kernel/outbox.test.ts
sha256: 5a4d17d5b1d07c49c51c553561f5b9d0160793aabbe98a70ead26c9ea5c41bd3
generated_at: 2026-10-15T12:47:49.613844+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox.test.ts

## Purpose

Integration test for the transactional outbox against a real MongoDB replica set. Verifies that outbox events commit atomically with the caller's state change, that `relayOutbox` delivers at-least-once in per-aggregate order, that failed consumers are retried with backoff and eventually parked as dead, and that a relay crash mid-dispatch is recovered without losing the event.

## Key elements

- **`subscribe(failWhen?)`** — Registers an `onDomainEvent('test.outbox', …)` handler that records every delivery into `seen` and optionally throws for payloads matching `failWhen`.
- **`write(n, aggregateId?)`** — Wraps `enqueueOutboxEvent` in a standalone `withTransaction` so each event lands as its own committed row.
- **`makeDue()`** — Forces every `pending` row to `nextAttemptAt: epoch 0` and clears `lockedUntil`, standing in for elapsed backoff time.
- **`insertMark(session)` / `marks()`** — Minimal stand-in for a domain state change: inserts/counts a document in the `marks` collection within the given session.
- **`announce({ n })`** — Builds the announcement object passed to `announceInTransaction` / `announceWithin`.
- **`describe('enqueueOutboxEvent')`** — Asserts transactional visibility: rolled-back writes leave zero rows; uncommitted rows are invisible to out-of-session reads.
- **`describe('relayOutbox')`** — Covers single delivery with stable event id, per-aggregate ordering, holding a failing head while other aggregates proceed, backoff + dead-letter parking, dead events not blocking successors, and the no-subscriber case.
- **`describe('a relay that dies mid-dispatch')`** — Simulates a live lock, an expired-claim re-delivery (same event id for consumer dedup), and two concurrent relays.
- **`describe('announceInTransaction')`** — Verifies change + event commit together, conditional-write no-op, rollback on event-build failure, rollback on write failure, and multi-announcement ordering.
- **`describe('announceWithin')`** — Verifies the event joins the caller's transaction, the caller's `nudgeOutbox()` wakes the relay, and a later failure in the same transaction rolls everything back.

## Relationships

- **`src/kernel/outbox.ts`** — Module under test; all exported functions (`enqueueOutboxEvent`, `relayOutbox`, `announceInTransaction`, `announceWithin`, `nudgeOutbox`, `settleOutboxNudges`, `outboxEventModel`) are exercised here.
- **`src/kernel/events.ts`** — Provides the in-process event bus (`onDomainEvent`, `resetDomainEvents`, `markDomainEventsWired`, `DomainEventMeta`). The test also extends `DomainEventMap` to register the `'test.outbox'` event name.
- **`src/infrastructure/runtime/database.ts`** — Supplies `withTransaction`, the real Mongo transaction wrapper every write is wrapped in.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` connects the test process to a live replica-set instance (required for multi-document transactions).
- **`tests/support/environment.ts`** — `withEnvironment` scopes `NODE_OUTBOX_MAX_ATTEMPTS` to individual backoff/dead-letter tests without leaking the value.

## Notes

- Requires a running MongoDB **replica set**; a standalone instance will fail at `withTransaction`.
- `declare module '@kernel/events'` at file scope registers the `'test.outbox'` event type only for this module — it does not mutate the shared map at runtime.
- `makeDue()` is a manual clock-advance; no real timers are waited on, keeping the suite fast.
- `settleOutboxNudges()` must be awaited after `announceInTransaction` to let the nudge-triggered relay pass complete before assertions.
- The `seen` array and event-wiring state are reset in `beforeEach` via `resetDomainEvents()` + `markDomainEventsWired()`; forgetting either causes cross-test contamination.
