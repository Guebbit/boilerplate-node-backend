---
source: src/modules/orders/tests/integration/outbox.test.ts
sha256: c9d851623fa9307aa3377f3c1b159a306941109b79efe97b709e235f9999e5e0
generated_at: 2026-10-15T11:15:37.752979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/outbox.test.ts

## Purpose

Integration tests that prove the transactional-outbox guarantee for every order mutation door: an event row commits atomically with the order write it announces, and a failed event write rolls back the write. Runs against a real MongoDB instance (not in-memory) to exercise genuine transactional semantics.

## Key elements

- **`failNextOutboxWrite()`** — spies on `outboxEventModel.create` to reject once, simulating a database failure mid-transaction.
- **`rowsNamed(name)`** — queries outbox event rows by event name, oldest first, for assertions.
- **`place()`** — end-to-end order creation through `orderService.create` with a real buyer and product.
- **`pendingOrderOfBuyer()`** — seeds a pending order owned by a freshly created user (for cancel tests).
- **`describe('a status move reported to orders')`** — verifies `ORDER_STATUS_CHANGED` events for `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, and `markFulfilmentComplete`; also asserts no event on a lost status race and rollback on outbox failure (parametrised via `it.each`).
- **`describe('an admin override')`** — verifies `ORDER_STATUS_CHANGED` from `overrideStatus` and full rollback (order status + timeline untouched) when the outbox write fails.
- **`describe('placing an order')`** — verifies `ORDER_CREATED` event and that no order row exists when the outbox write fails.
- **`describe('cancelling an order')`** — verifies `ORDER_CANCELLED` event (with `refund` flag) and rollback on failure.
- **`afterEach`** — calls `jest.restoreAllMocks()` to clean up the `outboxEventModel.create` spy.

## Relationships

- **`src/kernel/outbox.ts`** — imports `outboxEventModel` (the Mongoose model being spied/asserted) and `settleOutboxNudges` (flushes deferred outbox writes before assertions).
- **`src/modules/orders/services/index.ts`** — imports `orderService` for all mutation calls (`create`, `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilmentComplete`, `cancelById`).
- **`src/modules/orders/services/override.ts`** — imports `overrideStatus` for the admin-override door.
- **`src/modules/orders/events.ts`** — imports event-name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`) used in assertions.
- **`src/modules/orders/tests/factories.ts`** — imports seed/read helpers (`seedOrder`, `seedDigitalOrder`, `readOrder`, `countOrders`, `toOrderItem`, `timelineOf`).
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to build a real product for order placement.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to build a real buyer.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` (wraps the `markFulfilmentComplete` call, which requires an explicit session).
- **`src/types/index.ts`** — imports `OrderStatus` enum for seeding and assertions.
- **`tests/support/callers.ts`** — imports `callerContextAs` and `asCustomer` for caller-identity construction.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module level to connect the real test database.

## Notes

- Tests hit a **real MongoDB** (via `setupTestDb`), so the transactional semantics are genuine; there is no in-memory fallback.
- `markFulfilmentComplete` is the only status move wrapped in `withTransaction` explicitly; all others rely on the service's internal transaction handling. The test mirrors that asymmetry.
- `settleOutboxNudges()` must be awaited **after** each service call and **before** asserting on outbox rows — it flushes deferred writes that the service enqueues asynchronously.
- The `failNextOutboxWrite` helper uses `mockRejectedValueOnce`, so only the *first* `create` call fails; `jest.restoreAllMocks()` in `afterEach` prevents leakage between tests.
- The file references `docs/tools/outbox.md` for the broader outbox design rationale.
