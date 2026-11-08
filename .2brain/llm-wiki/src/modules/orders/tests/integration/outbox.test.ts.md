---
source: src/modules/orders/tests/integration/outbox.test.ts
sha256: 126d00201bf91fa5d8cf8d702cebe75d085553cf79b7a625d65abc15771cec92
generated_at: 2026-11-08T07:07:26.921745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/outbox.test.ts

## Purpose

Integration tests proving that every order-state door (create, status move, admin override, cancel) commits its outbox event row atomically with the order write against a real MongoDB instance. Each door is tested in both directions: the event row appears when the write succeeds, and the order write is rolled back when the event write fails.

## Key elements

- **`failNextOutboxWrite()`** — Spies on `outboxEventModel.create` to reject the next call once, simulating a mid-transaction I/O failure.
- **`rowsNamed(name)`** — Fetches outbox rows for a given event name, ordered by `_id`.
- **`place()`** — Creates a real user, product, and order via `orderService.create`; returns the result.
- **`pendingOrderOfBuyer()`** — Seeds a pending order belonging to a fresh buyer; used for cancel tests.
- **`describe('a status move reported to orders')`** — Covers `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`. Verifies the `ORDER_STATUS_CHANGED` payload and that a failed outbox write leaves the order in its prior status.
- **`describe('an admin override')`** — Verifies `overrideStatus` writes one `ORDER_STATUS_CHANGED` row and that a failed write leaves both the order and its timeline untouched.
- **`describe('placing an order')`** — Verifies `ORDER_CREATED` is written with the order id; on failure no order row exists.
- **`describe('cancelling an order')`** — Verifies `ORDER_CANCELED` carries `refund` and `cause` fields; on failure the order stays pending.

## Relationships

- **`src/kernel/outbox.ts`** — `outboxEventModel` is the model under test (spied/found); `settleOutboxNudges()` is called after each operation to flush the outbox before assertions.
- **`src/modules/orders/services/index.ts`** — `orderService` is the primary service under test (create, markPaid, markProcessing, markShipped, markDelivered, markFulfillmentComplete, cancelOnRequestById).
- **`src/modules/orders/services/override.ts`** — `overrideStatus` is the admin-override path under test.
- **`src/modules/orders/events.ts`** — Provides the event-name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`) used to query outbox rows.
- **`src/modules/orders/tests/factories.ts`** — Supplies `seedOrder`, `seedDigitalOrder`, `readOrder`, `countOrders`, `toOrderItem`, `timelineOf`, `createOrder`.
- **`src/modules/users/tests/factories.ts`** — `createUser` for fresh buyers.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for orderable items.
- **`tests/support/callers.ts`** — `callerContextAs` and `asCustomer` provide the caller/actor context for service calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real MongoDB test instance before the suite runs.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the `markFulfillmentComplete` call, which requires a session.
- **`src/types/index.ts`** — `OrderStatus` enum used for seed statuses and assertions.

## Notes

- Tests run against **real MongoDB** (`setupTestDb`), not an in-memory mock.
- `settleOutboxNudges()` must be awaited after any operation that enqueues an outbox event **before** asserting on outbox rows; without it the rows may not yet be visible.
- `failNextOutboxWrite` uses `mockRejectedValueOnce`, so it affects exactly one `create` call. `afterEach` restores all spies to prevent cross-test leakage.
- `markFulfillmentComplete` is the only status move that requires an explicit transaction session (`withTransaction`); the others are called directly.
- The rollback tests assert **zero** outbox documents and the **original** order status, confirming the write and its event are a single atomic unit.
