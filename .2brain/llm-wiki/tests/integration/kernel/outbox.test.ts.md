---
source: tests/integration/kernel/outbox.test.ts
sha256: bdc98b007ed541ae6655cd2d486f096a32939b8b4bad58a079708a0572074414
generated_at: 2026-11-14T23:17:02.819405+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox.test.ts

## Purpose
Integration test suite for the transactional outbox (`@kernel/outbox`) running against a real replica-set MongoDB. It verifies that outbox rows commit atomically with the caller's transaction, that the relay delivers events at-least-once and in order per aggregate, that failing consumers are retried with backoff and eventually parked as dead, and that a relay crashing mid-dispatch is recovered without losing or duplicating the logical event.

## Key elements
- **`subscribe(failWhen?)`** — registers a `'test.outbox'` domain-event listener that records deliveries into the module-level `seen` array; optionally throws to simulate a failing consumer.
- **`write(n, aggregateId?)`** — wraps `enqueueOutboxEvent` inside `withTransaction` so each test event is committed in its own transaction.
- **`makeDue()`** — bulk-updates all `pending` rows to set `nextAttemptAt = epoch` and clear `lockedUntil`, simulating the passage of backoff time.
- **`deadCounted()`** — reads the `outboxEventsDeadTotal` metric and sums all label values, used to assert the dead-letter counter.
- **`describe('enqueueOutboxEvent')`** — verifies atomicity (rolled-back write leaves zero rows) and read-isolation (row invisible to outside readers until commit).
- **`describe('relayOutbox')`** — covers single delivery, per-aggregate ordering, per-aggregate hold-behind-failing-head, retry/backoff/dead-letter parking, dead-event announcement, dead-counter increment, dead-event unblocking, and no-subscriber no-op.
- **`describe('a relay that dies mid-dispatch')`** — covers live-claim exclusion, re-delivery with the *same* stable event id after a missed `markPublished`, and concurrent relay runs delivering each event exactly once.
- **`describe('a relay whose lease was taken over mid-dispatch')`** — verifies that a consumer which throws *after* a peer relay has taken over the lease does not increment attempts, fire the dead metric, or emit a dead announcement.
- **`declare module '@kernel/events'`** — module augmentation registering the `'test.outbox'` event shape `{ n: number }` for type-safe `onDomainEvent` calls.

## Relationships
- **`@kernel/outbox`** (system under test) — exercises `enqueueOutboxEvent`, `relayOutbox`, `outboxEventModel`, and the `OUTBOX_EVENT_DEAD` constant; also imports `announceInTransaction`, `announceWithin`, `nudgeOutbox`, `settleOutboxNudges` (used in the truncated portion).
- **`@kernel/events`** — registers and resets domain-event subscribers via `onDomainEvent`, `resetDomainEvents`, `markDomainEventsWired`; the callback signature uses the `DomainEventMeta` type exported from this module.
- **`@infrastructure/runtime/database`** — provides `withTransaction` for the atomic-write tests and for the `write` helper.
- **`@infrastructure/observability/metrics-outbox`** — reads `outboxEventsDeadTotal` to assert dead-letter counting.
- **`tests/support/setup-test-db`** — `setupTestDb()` bootstraps the replica-set connection before any test runs.
- **`tests/support/environment`** — `withEnvironmentOverrides` temporarily sets `NODE_OUTBOX_MAX_ATTEMPTS` for retry/dead-letter tests.

## Notes
- The suite requires a **real MongoDB replica set** (not an in-memory stub) because it exercises multi-document transactions and lease semantics. `setupTestDb` must be run before the suite.
- The `seen` array and `resetDomainEvents` in `beforeEach` give each test a clean subscriber state; the `afterAll` call prevents listeners from leaking across files.
- `makeDue()` is a test-only time-warp: it directly mutates the collection to make backoffed rows immediately eligible, bypassing real waiting.
- The module augmentation (`declare module '@kernel/events'`) is file-local; other test files that need the same event type must repeat the declaration.
- The dead-counter assertion (`deadCounted`) diffs before/after because the Prometheus-style metric is a process-lifetime registry, not per-test.
