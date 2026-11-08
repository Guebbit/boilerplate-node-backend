---
source: tests/integration/kernel/outbox.test.ts
sha256: adffbbdf953071021876ce2f0ce3e3e920859286ddef65afe353b5374cd3e707
generated_at: 2026-11-08T09:41:46.217305+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox.test.ts

## Purpose

Integration tests for the transactional outbox pattern, run against a real replica-set MongoDB. Verifies that outbox rows commit or abort atomically with the caller's transaction, that the relay delivers at-least-once and in order per aggregate, that failing consumers are retried with backoff and eventually parked dead, and that a relay crashing mid-dispatch is recovered without losing or duplicating events.

## Key elements

- **`setupTestDb()`** — one-time replica-set Mongo connection for the suite.
- **`subscribe(failWhen?)`** — registers a `'test.outbox'` domain-event handler that records deliveries into `seen`; optionally throws for selected payloads to simulate consumer failure.
- **`write(n, aggregateId?)`** — writes one outbox event inside its own committed transaction via `withTransaction` + `enqueueOutboxEvent`.
- **`makeDue()`** — bulk-sets all pending rows to `nextAttemptAt: epoch` and clears `lockedUntil`, standing in for the passage of backoff time.
- **`describe('enqueueOutboxEvent')`** — asserts atomicity (rolled-back write leaves no row) and read-visibility (row invisible outside the session until commit).
- **`describe('relayOutbox')`** — covers single delivery with stable event id, per-aggregate ordering, head-of-line blocking across aggregates, backoff + dead-letter parking, `OUTBOX_EVENT_DEAD` announcement, dead-event non-blocking, and no-subscriber passthrough.
- **`describe('a relay that dies mid-dispatch')`** — live-lock exclusion, redelivery with the *same* event id after claim expiry, and concurrent relay safety.
- **`marks()` / `insertMark()` / `announce()`** — minimal stand-ins for a domain write + announcement used by the `announceInTransaction` tests.
- **`describe('announceInTransaction')`** — atomic commit of write + event, null-write short-circuit, rollback on event-build failure, rollback on write failure, and multi-announcement ordering.
- **`describe('announceWithin')`** — verifies the event joins the caller's existing transaction (row stays `pending` until the caller commits; `settleOutboxNudges` triggers delivery).

## Relationships

- **`src/kernel/outbox.ts`** — the module under test; imports `announceInTransaction`, `announceWithin`, `enqueueOutboxEvent`, `nudgeOutbox`, `OUTBOX_EVENT_DEAD`, `outboxEventModel`, `relayOutbox`, `settleOutboxNudges`.
- **`src/kernel/events.ts`** — imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents`, `DomainEventMeta`; augments `DomainEventMap` with the `'test.outbox'` type.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` to open caller-side transactions for atomicity and `announceWithin` scenarios.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to provision the replica-set connection.
- **`tests/support/environment.ts`** — imports `withEnvironmentOverrides` to scope `NODE_OUTBOX_MAX_ATTEMPTS` changes to individual tests.

## Notes

- Requires a **replica set** (multi-node or single-node RS); a standalone `mongod` will not satisfy the `withTransaction` / session-isolation tests.
- `makeDue()` is the only mechanism to advance backoff timers; without it a second `relayOutbox()` call in the same tick will skip rows still within `nextAttemptAt`.
- `beforeEach` calls `resetDomainEvents()` then `markDomainEventsWired()` — forgetting the second call makes all `onDomainEvent` registrations inert, causing silent "no subscriber" results.
- The `OUTBOX_EVENT_DEAD` announcement test registers its listener *outside* the `withEnvironmentOverrides` callback so the handler persists across the relay calls.
- The file is truncated in this snapshot; the `announceWithin` suite (and possibly additional `nudgeOutbox` / `settleOutboxNudges` coverage) continues past the visible cutoff.
