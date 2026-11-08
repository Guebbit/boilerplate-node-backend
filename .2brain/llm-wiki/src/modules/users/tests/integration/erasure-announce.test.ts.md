---
source: src/modules/users/tests/integration/erasure-announce.test.ts
sha256: 6fc6fe713bba59cb1ef69922e55ecc6f45f705ccda9cf798f0a02bcacf6f64f7
generated_at: 2026-11-08T08:53:57.785462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-announce.test.ts

## Purpose

Integration tests that verify the `user.erased` outbox event is written (exactly once) on every hard-delete path, absent when the erasure is abandoned or the delete is soft, and that the analytics provider's `forget` method is invoked in response. PostHog is never called directly—`forget` is observed on the resolved provider via a spy.

## Key elements

- **`erasedRows()`** – Queries `outboxEventModel` for rows named `user.erased`; used in every assertion.
- **`DAY_MS`** – 86 400 000 ms constant for positioning `purgeAt` before/after the current time.
- **`scheduled(email, purgeAt)`** – Creates a user via `createUser` and calls `userService.scheduleOwnDeletion`; returns the user.
- **`afterEach`** – Restores all jest mocks and calls `resetDomainEvents()` to clear event-bus state between tests.
- **`describe('user.erased')`** – Six cases covering: admin hard delete, scheduled purge, lost purge claim (409), soft delete (no event), provider `forget` invocation, and provider-failure retry semantics.

## Relationships

- **`src/modules/users/services/index.ts`** – `userService` is the SUT: `removeById`, `scheduleOwnDeletion`, `eraseScheduledDeletion` are the operations under test.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried to assert event rows; `settleOutboxNudges` triggers outbox processing so listeners fire.
- **`src/kernel/events.ts`** – `markDomainEventsWired` / `resetDomainEvents` control the event bus; `onDomainEvent` is used in the retry test to prove the failure is the provider's, not the bus's.
- **`src/modules/users/module.ts`** – `usersModule.subscribe()` wires the module's `user.erased` listener (which calls `forget`) into the bus.
- **`src/infrastructure/observability/analytics/index.ts`** – `resolveAnalyticsProvider()` returns the provider whose `forget` method is spied/mocked.
- **`src/kernel/permissions.ts`** – `systemCallerContext('User')` supplies the caller for the scheduled-purge path.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` supplies the caller for admin-initiated deletes.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates seeded user documents.
- **`src/modules/users/model.ts`** – `userModel.countDocuments` confirms the row still exists after a lost-claim rejection.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory MongoDB used by all tests.

## Notes

- The provider-level tests (last two) require the explicit wiring sequence `markDomainEventsWired()` → `usersModule.subscribe()` *before* the delete call; without it the outbox event is written but no listener consumes it.
- The "keeps the row pending" test deliberately registers an unrelated no-op `onDomainEvent` listener to disambiguate a provider failure from a bus failure in the assertion.
- Soft delete (`removeById(id, false, …)`) is asserted to produce **zero** outbox rows—the event is exclusive to hard-delete paths.
- `erasedRows` uses `.lean()` so assertions compare plain objects; `aggregateId` and `payload.userId` both equal the deleted user's id.
