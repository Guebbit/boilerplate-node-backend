---
source: src/modules/users/tests/integration/erasure-announce.test.ts
sha256: 6fc6fe713bba59cb1ef69922e55ecc6f45f705ccda9cf798f0a02bcacf6f64f7
generated_at: 2026-10-29T06:20:07.257923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-announce.test.ts

## Purpose

Integration tests verifying that the `user.erased` outbox event is written (or withheld) correctly across every hard-delete path in the users module, and that the analytics provider's `forget` is the sole downstream consumer. PostHog is never called directly; only the resolved provider interface is observed.

## Key elements

- **`erasedRows()`** – Queries `outboxEventModel` for rows with `name: 'user.erased'` and returns them as plain objects for assertions.
- **`scheduled(email, purgeAt)`** – Helper that creates a user and calls `userService.scheduleOwnDeletion`, returning the user for later purge testing.
- **`describe('user.erased')`** – Six test cases:
  - *Admin hard delete* writes exactly one outbox row.
  - *Scheduled purge* (due) writes exactly one outbox row.
  - *Lost claim* (purge not yet due) returns `409 USER_ERASURE_NOT_DUE`, writes no row, and leaves the user document intact.
  - *Soft delete* writes no outbox row.
  - *Analytics forget* – after `settleOutboxNudges`, the provider's `forget` is called once with the user id.
  - *Provider failure* – when `forget` rejects, the outbox row stays `pending` with `attempts: 1`, and the removal itself still succeeds.
- **`afterEach`** – Restores all mocks and calls `resetDomainEvents()` to clear the event bus between tests.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initializes a real database instance for every test.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` fabricates a caller identity for `removeById`.
- **`src/kernel/permissions.ts`** – `systemCallerContext('User')` provides the system-level identity required by `eraseScheduledDeletion`.
- **`src/kernel/events.ts`** – `markDomainEventsWired()`, `onDomainEvent()`, and `resetDomainEvents()` control the in-process domain-event bus used by the "forget" and retry tests.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is the Mongoose model queried by `erasedRows()`; `settleOutboxNudges()` drains the outbox so listeners fire synchronously in the test.
- **`src/infrastructure/observability/analytics/index.ts`** – `resolveAnalyticsProvider()` returns the singleton whose `forget` method is spied on; no HTTP call to PostHog occurs.
- **`src/modules/users/services/index.ts`** – `userService.removeById`, `scheduleOwnDeletion`, and `eraseScheduledDeletion` are the SUT methods under test.
- **`src/modules/users/model.ts`** – `userModel.countDocuments` verifies the user row still exists after a failed claim.
- **`src/modules/users/module.ts`** – `usersModule.subscribe()` registers the analytics `forget` listener so `settleOutboxNudges` can dispatch to it.
- **`src/modules/users/tests/factories.ts`** – `createUser` builds a persisted user document for each scenario.

## Notes

- The "provider failure" test deliberately registers a no-op `onDomainEvent('user.erased', …)` listener alongside the analytics one, proving the pending status is caused by the provider rejection and not by a bus-level error.
- `settleOutboxNudges()` must be called manually; the outbox does not dispatch automatically in the test environment.
- `markDomainEventsWired()` gates event delivery to the wired state—without it, listeners registered via `usersModule.subscribe()` are inert.
- The `DAY_MS` constant is local and used only to place `purgeAt` before/after the current time; it is not a shared utility.
