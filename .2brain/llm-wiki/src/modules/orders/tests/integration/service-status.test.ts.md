---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: a9df17660b3993b702c17a88c7b98d0e396a96ad0af76960ceedf2ae89db56b3
generated_at: 2026-09-23T19:12:47.251649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration tests for the order status-transition functions (`markPaid`, `markShipped`, `markDelivered`) in `services/status.ts`. They verify correct state moves, illegal-move rejection, domain-event emission, and single-writer correctness under a concurrent race — all against a real MongoDB instance rather than mocks, because the guarantee under test is the conditional `$in` write that only a live database can exercise.

## Key elements

- **`seedOrder(status)`** — local helper that creates a user, a product, and an order in the given status via the module factories.
- **`describe('markPaid')`** — happy path (pending → paid + event) and rejection from paid/processing/cancelled (null return, no event).
- **`describe('markShipped')`** — happy path (processing → shipped) and rejection from paid.
- **`describe('markDelivered')`** — happy path (shipped → delivered) and rejection from processing.
- **`describe('two callers racing the same move')`** — fires two concurrent `markPaid` calls with `Promise.all`; asserts exactly one succeeds and exactly one `ORDER_STATUS_CHANGED` event is emitted.
- **`afterEach`** — calls `resetDomainEvents()` to clear the in-memory event bus between tests.

## Relationships

- **`src/modules/orders/services/status.ts`** — the system under test; imports `markPaid`, `markShipped`, `markDelivered`.
- **`src/modules/orders/events.ts`** — imports `ORDER_STATUS_CHANGED` to subscribe to the domain event.
- **`src/kernel/events.ts`** — imports `onDomainEvent` / `resetDomainEvents` for event-bus assertion and cleanup.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder`, `toOrderItem`, `readOrder` for seeding and read-back.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for order-item seeding.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` for order-creator seeding.
- **`src/types/index.ts`** — imports the `OrderStatus` enum used in seeds and assertions.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module top level to connect a real Mongo before any test runs.

## Notes

- The file is intentionally **not** a unit test: it hits real Mongo to validate the conditional-write semantics of `updateStatusIfIn`. The module docblock states explicitly that a mock "cannot race against itself."
- `setupTestDb()` is called at import time (top level), not inside a `beforeAll`, so the DB connection is established before the test framework's lifecycle hooks fire.
- Event assertions rely on the in-memory kernel bus (`onDomainEvent`), not on Mongo change streams — the bus is process-local and reset in `afterEach`.
- The race test does **not** use `beforeEach` isolation for its own order; it depends on the top-level `setupTestDb` plus the per-test factory seeding.
