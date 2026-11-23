---
source: src/modules/orders/tests/integration/outbox.test.ts
source_sha256: 3d88f3e1bcdbe0e202e0ad55c99903e15092c63c920e1dbbcd4ee2de7d24dc71
context_sha256: da4ec4ce1e9af92f2fe370711ee04cad1c3b86205ee63fbfc9105643d368a876
generated_at: 2026-11-22T06:30:50.980027+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/outbox.test.ts

## Purpose
Integration tests (real Mongo) proving that order events ride the transactional outbox. For each operation that moves an order, the test checks two things. When the write lands, the matching outbox row appears. When the outbox write fails, the order write is rolled back too.

## Key elements
- `setupTestDb()` – prepares the test database. An `afterEach` calls `jest.restoreAllMocks()`.
- `failNextOutboxWrite()` – spies on `outboxEventModel.create` and rejects once with `Error('disk full')`, simulating a database failure mid-transaction.
- `rowsNamed(name)` – returns the outbox rows for one event name, sorted by `_id` ascending.
- `place()` – creates a user and a product (`onHand: 10`), then places a one-item order via `orderService.create` as an admin caller.
- `pendingOrderOfBuyer()` – creates a user, a product and a pending order, and returns `{ user, order }`.
- Test groups:
  - **Status moves** (`markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`):
    - `markPaid` writes one `ORDER_STATUS_CHANGED` row with `aggregateId`, `orderId`, `from: 'pending'` and `to: 'paid'`.
    - A move that loses its race (`markPaid` on a canceled order returns a null result) writes no event.
    - An `it.each` table covers all five moves. When the outbox write fails, each rejects with `disk full`, the order keeps its original status, and no outbox rows exist.
  - **Admin override** (`overrideStatus`):
    - Success writes one `ORDER_STATUS_CHANGED` row.
    - On a failed outbox write, the order status stays `paid` and `timelineOf` is empty.
  - **Placing an order**:
    - Success writes one `ORDER_CREATED` row with payload `{ orderId }`.
    - On a failed outbox write, `countOrders()` is 0 and no outbox rows exist.
  - **Cancelling an order** (`orderService.cancelOnRequestById` as a customer):
    - Success writes one `ORDER_CANCELED` row with payload `{ orderId, refund: true, cause: 'customer', informedAt: <string> }`.
    - On a failed outbox write, the order stays `pending` and no outbox rows exist.

## Relationships
- `@kernel/outbox` supplies `outboxEventModel`, which is queried and spied on, and `settleOutboxNudges`, which is awaited before reading rows.
- `@infrastructure/runtime/database` supplies `withTransaction`, used to call `markFulfillmentComplete` with a session.
- The units under test are `orderService` (`services/index`), `markPaid` (`friends/payments`), `overrideStatus` (`services/override`), and `markShipped`, `markDelivered` and `markFulfillmentComplete` (`services/status`).
- `orders/events` provides the event name constants `ORDER_CREATED`, `ORDER_CANCELED` and `ORDER_STATUS_CHANGED`. `OrderStatus` comes from `@types`.
- Test factories from `orders/tests/factories`, `products/tests/factories` and `users/tests/factories` seed and read data (`seedOrder`, `seedDigitalOrder`, `readOrder`, `countOrders`, `timelineOf`, `createUser`, `createProduct`).
- `@tests/callers` supplies `callerContextAs` and `asCustomer`. `@tests/setup-test-db` supplies `setupTestDb`.

## Notes
- Events are only read after `await settleOutboxNudges()` on the success paths.
- `markFulfillmentComplete` is seeded with `seedDigitalOrder`, while the other moves use `seedOrder`.
- The failure tests assert both that the domain write is rolled back and that no outbox row exists, which shows the two share one transaction.
- The `informedAt` comment in the cancel test says it marks the day the buyer's cancel started the 14-day refund clock.
