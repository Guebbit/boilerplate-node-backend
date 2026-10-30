---
source: tests/integration/kernel/outbox.test.ts
sha256: adffbbdf953071021876ce2f0ce3e3e920859286ddef65afe353b5374cd3e707
generated_at: 2026-10-29T06:58:13.221549+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox.test.ts

## Purpose

Integration tests for the transactional outbox, run against a real MongoDB replica set. Verifies that outbox rows commit or abort atomically with the caller's transaction, that the relay delivers events at-least-once in per-aggregate order, that failing consumers are retried with backoff and eventually parked, and that a relay crashing mid-dispatch is recovered without losing or duplicating the stable event id.

## Key elements

- **`setupTestDb()`** – Bootstraps a real Mongo connection before any test runs.
- **`subscribe(failWhen?)`** – Registers a `test.outbox` subscriber that appends each delivery to `seen[]` and optionally throws for named payloads (simulating a down consumer).
- **`write(n, aggregateId?)`** – Enqueues a single outbox event inside its own committed transaction via `withTransaction` + `enqueueOutboxEvent`.
- **`makeDue()`** – Sets `nextAttemptAt` to epoch-0 and clears `lockedUntil` on all pending rows, standing in for the passage of backoff time.
- **`insertMark` / `announce` / `marks`** – Minimal stand-in domain write (insert into a `marks` collection), the matching announcement builder, and a read-back helper used by the `announceInTransaction` tests.
- **Test suites** – `enqueueOutboxEvent`, `relayOutbox`, "a relay that dies mid-dispatch", `announceInTransaction` (single and multi-announcement), and `announceWithin`.
- **`declare module '@kernel/events'`** – Augments `DomainEventMap` so the test event `test.outbox: { n: number }` is type-safe.

## Relationships

- **`src/kernel/outbox.ts`** – The module under test; all public APIs (`enqueueOutboxEvent`, `relayOutbox`, `announceInTransaction`, `announceWithin`, `nudgeOutbox`, `settleOutboxNudges`, `OUTBOX_EVENT_DEAD`, `outboxEventModel`) are exercised here.
- **`src/kernel/events.ts`** – Provides the subscriber registration (`onDomainEvent`), wiring flag (`markDomainEventsWired`), reset (`resetDomainEvents`), and the `DomainEventMeta` type that carries the stable `eventId`.
- **`src/infrastructure/runtime/database.ts`** – Supplies `withTransaction`, the real session-based transaction wrapper that gives these tests genuine commit/rollback semantics.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the shared Mongo connection used across the suite.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` injects `NODE_OUTBOX_MAX_ATTEMPTS` to control retry/dead thresholds per test.

## Notes

- Requires a reachable **replica set**; single-node Mongo cannot satisfy multi-statement transaction tests.
- `makeDue()` is the only time-travel mechanism—there is no fake-clock; backoff expiry is always simulated by rewriting the row.
- The relay is expected to deliver **at-least-once**: the "relay dies mid-dispatch" suite asserts a second delivery carries the **same** `eventId` so consumers can deduplicate.
- `settleOutboxNudges()` must be awaited after `announceInTransaction` for the event to be delivered before assertions run; forgetting it makes `seen` empty.
- When a test needs to re-subscribe (e.g., after a "consumer recovers" step), it calls `resetDomainEvents()` + `markDomainEventsWired()` + a fresh `subscribe()`—the event bus is not cleared by the outbox itself.
