---
source: src/modules/users/tests/integration/erasure-announce.test.ts
sha256: 62b88ad36bfc5425371de7da630f45e93e9d29e8c45126b7ec75fdf17de700a0
generated_at: 2026-11-14T22:33:53.710207+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/erasure-announce.test.ts

## Purpose

Integration tests verifying the `user.erased` outbox event lifecycle: it must be written exactly once on every hard-delete path (admin removal, scheduled purge), must be absent on soft deletes and lost purge claims, and must be consumed by the analytics provider's `forget` method—with the outbox row kept `pending` for retry when that call fails.

## Key elements

- **`erasedRows()`** — Queries `outboxEventModel` for rows where `name === 'user.erased'`; used as the primary assertion helper.
- **`scheduled(email, purgeAt)`** — Creates a user via the test factory and schedules own-deletion with the given `purgeAt`, returning the user for subsequent purge tests.
- **`afterEach`** — Restores all Jest mocks and calls `resetDomainEvents()` to clear wired listeners between tests.
- **Six test cases** (one per behavior listed in Purpose) — Each isolates a single guarantee about event emission or provider interaction.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `outboxEventModel` (queried for assertions) and `settleOutboxNudges` (awaited to trigger event consumption).
- **`src/kernel/events.ts`** — Provides `markDomainEventsWired`, `onDomainEvent`, and `resetDomainEvents` to set up, register, and tear down the listener bus.
- **`src/kernel/permissions.ts`** — Provides `systemCallerContext` to supply the caller context for scheduled-purge tests.
- **`src/modules/users/services/index.ts`** — The `userService` imported here is the action-under-test surface for both hard and soft delete scenarios.
- **`src/modules/users/friends/account.ts`** — The `accountUserService` imported here drives the scheduled-purge scenarios (scheduling and erasing).
- **`src/modules/users/module.ts`** — The `usersModule` imported here registers the analytics listener that reacts to `user.erased` when `subscribe` is called.
- **`src/infrastructure/observability/analytics/index.ts`** — `resolveAnalyticsProvider` is called to obtain the provider whose `forget` method is spied on; PostHog itself is never invoked.
- **`src/modules/users/model.ts`** — `userModel` is queried to confirm the user row still exists after a lost-claim purge.
- **`src/modules/users/tests/factories.ts`** — `createUser` provides test user fixtures.
- **`tests/support/callers.ts`** — `callerContextAs` supplies the admin caller context.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory test database.

## Notes

- PostHog is never invoked directly; the test observes `forget` on the *resolved* provider to keep the dependency boundary explicit.
- The "lost claim" test schedules `purgeAt` **5 days in the future**, so the erasure call returns `false` and the user row survives—this is the intended no-op path, not an error.
- The retry test registers a *second, unrelated* listener on `user.erased` specifically to prove that a provider rejection is not misattributed to the event bus.
- `markDomainEventsWired()` + `usersModule.subscribe()` must both be called before the action; without them the outbox row is written but no consumer fires.
