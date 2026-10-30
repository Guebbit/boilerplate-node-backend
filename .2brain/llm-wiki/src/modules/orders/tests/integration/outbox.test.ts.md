---
source: src/modules/orders/tests/integration/outbox.test.ts
sha256: 2a5b16635b379881e0fc42895e47d499860dfe7962dec78ddfeb297146c080b9
generated_at: 2026-10-29T04:55:02.655416+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/outbox.test.ts

## Purpose

Integration test that proves every order state transition is atomic with its outbox event row against a real MongoDB: the event lands with the write, or the write is rolled back when the event cannot be written. Covers order creation, status progression, admin overrides, and customer cancellation.

## Key elements

- **`failNextOutboxWrite()`** — Spies on `outboxEventModel.create` and rejects once, simulating a mid-transaction DB failure.
- **`rowsNamed(name)`** — Queries `outboxEventModel` for rows of a given event name, ordered by insertion.
- **`place()`** — Creates a user, a product, and an order via `orderService.create`, returning the service result.
- **`pendingOrderOfBuyer()`** — Seeds a pending order for a fresh user, used by cancellation tests.
- **`describe('a status move reported to orders')`** — Verifies `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, and `markFulfilmentComplete` each emit `ORDER_STATUS_CHANGED` with correct `from`/`to`, and that the order is left unchanged when the outbox write fails.
- **`describe('an admin override')`** — Same atomicity contract for `overrideStatus`, including the audit timeline.
- **`describe('placing an order')`** — Verifies `ORDER_CREATED` payload and full rollback on outbox failure.
- **`describe('cancelling an order')`** — Verifies `ORDER_CANCELLED` payload (refund flag, cause) and rollback on outbox failure.

## Relationships

- **`src/kernel/outbox.ts`** — Imports `outboxEventModel` (the Mongoose model the tests assert against) and `settleOutboxNudges` (flushes queued outbox writes before assertions).
- **`src/modules/orders/services/index.ts`** — Imports `orderService`, the primary service under test.
- **`src/modules/orders/services/override.ts`** — Imports `overrideStatus`, the admin status-change path.
- **`src/modules/orders/events.ts`** — Imports the event-name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`) used in assertions.
- **`src/modules/orders/tests/factories.ts`** — Imports seeding helpers (`seedOrder`, `seedDigitalOrder`, `readOrder`, `countOrders`, `toOrderItem`, `timelineOf`).
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` for realistic product fixtures.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` for realistic buyer fixtures.
- **`src/infrastructure/runtime/database.ts`** — Imports `withTransaction` to wrap `markFulfilmentComplete` (which requires an explicit session).
- **`src/types/index.ts`** — Imports `OrderStatus` for seed states and assertions.
- **`tests/support/callers.ts`** — Imports `callerContextAs` and `asCustomer` to build the auth context passed to services.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` at module level to connect a real (test) MongoDB instance.

## Notes

- Runs against **real MongoDB**, not an in-memory mock. Requires the test DB to be available.
- `settleOutboxNudges()` must be awaited after every service call before inspecting outbox rows; skipping it leaves events unflushed.
- `markFulfilmentComplete` is the only method that requires an explicit `withTransaction` session; the others rely on the service's internal transaction.
- The "lost its race" test (`cancelled` → `markPaid` returns `null`) verifies that an invalid transition writes *no* outbox row at all, not just a wrong one.
- `jest.restoreAllMocks()` runs in `afterEach`, so the `mockRejectedValueOnce` spy is cleaned up automatically.
