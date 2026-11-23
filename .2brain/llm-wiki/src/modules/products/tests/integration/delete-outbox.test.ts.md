---
source: src/modules/products/tests/integration/delete-outbox.test.ts
source_sha256: 221a81e7431de247c896c150f599f5fb98f136c63a767981aabc184558c0ab9d
context_sha256: 6861858e94b1ed31e0341033fecae2e8ea2a3d4c4ac6d6b77eede8c241fe6d03
generated_at: 2026-11-22T07:15:55.410863+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/delete-outbox.test.ts

## Purpose
Integration test verifying that the `product.deleted` event is delivered through the transactional outbox on both delete paths (soft and hard). It checks that an outbox row exists exactly when the delete committed, and that a failing consumer is retried by the relay rather than lost.

## Key elements
- `setupTestDb()` – sets up the test database for the suite.
- `rows()` – helper that queries `outboxEventModel` for all `product.deleted` rows in any state.
- `beforeEach` – resets domain events, calls `markDomainEventsWired()` (the relay only dispatches in a process where modules have subscribed), and subscribes a `deleted` jest mock via `onDomainEvent(PRODUCT_DELETED, ...)`.
- Test (parametrized over `hardDelete` false/true): `removeById` writes exactly one row with `aggregateId` = product id and `status: 'published'`, and the consumer is called once with `{ productId, hardDelete, titles: { en: 'Blue mug' } }` and a context containing `eventId` equal to the row's `_id`.
- Test (parametrized): when the repository write fails (`deleteOne` for hard delete, `save` for soft), `removeById` rejects, no outbox row exists, and the product is still found.
- Test: a consumer that throws once leaves the row `pending` with `attempts: 1`; after `nextAttemptAt` is reset to epoch, `relayOutbox()` publishes it (`published: 1`) and the consumer has been called twice.
- Test: repeating a soft delete on an already-deleted product leaves only one row.

## Relationships
- `@kernel/events` – supplies `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for subscribing and isolating consumers.
- `@kernel/outbox` – supplies `outboxEventModel`, `relayOutbox`, and `settleOutboxNudges` (awaited after deletes so delivery completes).
- `../../events` – provides the `PRODUCT_DELETED` event name.
- `../../repository` – `productRepository` is spied on (`deleteOne`, `save`) to simulate write failures and used for `findById` checks.
- `../../services` – the `productService` exported from the services index; its `removeById(id, hardDelete)` method is the code under test.
- `@modules/products/tests/factories` – `createProduct` creates fixtures.
- `@tests/setup-test-db` – `setupTestDb` provides the database lifecycle.

## Notes
- `afterEach` calls `jest.restoreAllMocks()`; the failure test also restores mocks before asserting so the repository read is not mocked.
- Tests call `settleOutboxNudges()` after deletes before asserting on row state or consumer calls.
