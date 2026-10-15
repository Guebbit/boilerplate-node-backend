---
source: src/modules/products/tests/integration/delete-outbox.test.ts
sha256: 221a81e7431de247c896c150f599f5fb98f136c63a767981aabc184558c0ab9d
generated_at: 2026-10-15T11:47:26.899742+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/delete-outbox.test.ts

## Purpose

Integration test proving that the `product.deleted` domain event is written to the transactional outbox atomically with the delete on both soft-delete and hard-delete paths, and that a failing consumer is retried by the relay rather than silently dropped.

## Key elements

- **`rows()`** – Helper that returns all outbox rows whose `name` is `PRODUCT_DELETED`, in any status.
- **`describe('product.deleted through the outbox')`** – The sole test suite. Each `beforeEach` resets domain-event state, marks events as wired, and subscribes a jest mock to `PRODUCT_DELETED`.
- **Test: "writes one row … and delivers it"** (parametric over `hardDelete: false | true`) – Asserts exactly one outbox row keyed on the aggregate id, status `published`, and a single consumer invocation with the expected payload.
- **Test: "leaves no row and the product in place when the write fails"** (parametric) – Spies on `productRepository.deleteOne`/`save` to reject, then asserts the service throws, no outbox row exists, and the product is still present.
- **Test: "a throwing consumer leaves the row pending, and the relay retry delivers it"** – First delivery rejects; asserts row stays `pending` with `attempts: 1`, then forces `nextAttemptAt` to epoch and calls `relayOutbox()` to confirm the second delivery succeeds.
- **Test: "announces nothing for a soft delete repeated on a deleted product"** – Calls `removeById` twice with `hardDelete: false`; asserts only one outbox row exists (idempotent soft-delete).

## Relationships

- **`src/modules/products/services/index.ts`** – `productService.removeById` is the system under test for every case.
- **`src/modules/products/repository.ts`** – `productRepository` is spied on to simulate a DB failure; also queried to confirm the product still exists after a failed write.
- **`src/modules/products/events.ts`** – Supplies the `PRODUCT_DELETED` event-name constant used for subscription and row queries.
- **`src/kernel/events.ts`** – Provides `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` to wire/tear down the in-process event bus between tests.
- **`src/kernel/outbox.ts`** – Provides `outboxEventModel` (Mongo query), `relayOutbox` (explicit relay trigger), and `settleOutboxNudges` (flush pending nudges within the test transaction).
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product document for each test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory / test MongoDB connection before the suite runs.

## Notes

- `markDomainEventsWired()` must be called in `beforeEach`; without it the relay refuses to dispatch because no module subscription is registered in the test process.
- The retry test bypasses the normal scheduling delay by writing `nextAttemptAt: new Date(0)` directly to the outbox collection before calling `relayOutbox()`.
- `settleOutboxNudges()` is an async yield point that lets the outbox writer flush its nudge queue inside the test transaction—without it the row may not yet be visible to the query.
- The first two tests are parametric (`it.each([false, true])`) so both soft and hard delete paths are covered in a single case.
