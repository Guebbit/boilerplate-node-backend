---
source: src/modules/orders/tests/integration/outbox.test.ts
sha256: 6ec75d66fe00470e9b3f8b32deaf10beb9ddfb8248f44eed41d7320840f0c905
generated_at: 2026-11-14T20:53:14.722324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/outbox.test.ts

## Purpose

Integration tests (real Mongo) proving the transactional-outbox invariant for order events: every status move, creation, or cancellation either commits its outbox row together with the write it announces, or rolls back entirely. Each "door" that mutates an order is tested in both the happy path (event row appears with correct payload) and the failure path (event write fails → the order write is undone).

## Key elements

- **`failNextOutboxWrite()`** — Spies on `outboxEventModel.create` and makes the next call reject with `'disk full'`, simulating a DB failure mid-transaction.
- **`rowsNamed(name)`** — Queries outbox rows by event `name`, sorted by `_id` (oldest first).
- **`place()`** — Creates a real user, product, and order via `orderService.create` with an admin caller context.
- **`pendingOrderOfBuyer()`** — Seeds a pending order with a fresh buyer who will issue the cancellation.
- **`describe('a status move reported to orders')`** — Verifies `order.status_changed` is written for `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, and `markFulfillmentComplete`; also confirms no event fires for a lost race (already-canceled order) and that a failed event write rolls back the order status.
- **`describe('an admin override')`** — Verifies `overrideStatus` writes `order.status_changed` and that a failed event write leaves both status and timeline untouched.
- **`describe('placing an order')`** — Verifies `order.created` payload; confirms no order row exists if the event write fails.
- **`describe('cancelling an order')`** — Verifies `order.canceled` payload (including `refund`, `cause`, `informedAt`); confirms the order stays `pending` if the event write fails.

## Relationships

- **`src/kernel/outbox.ts`** — Source of `outboxEventModel` (the collection under test) and `settleOutboxNudges()` (flushes pending outbox dispatches before assertions).
- **`src/modules/orders/services/index.ts`** — `orderService` provides `create`, `markProcessing`, and `cancelOnRequestById`.
- **`src/modules/orders/services/status.ts`** — `markShipped`, `markDelivered`, `markFulfillmentComplete` are the status-move doors under test.
- **`src/modules/orders/services/override.ts`** — `overrideStatus` is the admin-correction door.
- **`src/modules/orders/friends/payments.ts`** — `markPaid` is the payment-driven status door.
- **`src/modules/orders/events.ts`** — Supplies event-name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`) used in assertions.
- **`src/modules/orders/tests/factories.ts`** — `seedOrder`, `seedDigitalOrder`, `readOrder`, `countOrders`, `timelineOf`, `createOrder`, `toOrderItem` for setup and teardown assertions.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — `createUser`, `createProduct` for realistic fixtures.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the `markFulfillmentComplete` call (the only door that explicitly takes a session).
- **`tests/support/callers.ts`** — `callerContextAs`, `asCustomer` build the auth/role context passed to service methods.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` configures the in-memory or temp Mongo instance before the suite runs.
- **`src/types/index.ts`** — `OrderStatus` enum used in seeding and assertions.

## Notes

- `settleOutboxNudges()` must be called after every service mutation and **before** asserting on outbox rows; without it the event may still be in-flight.
- The `markFulfillmentComplete` case is the only one wrapped in an explicit `withTransaction` call in the test, mirroring its production signature that requires a session parameter.
- `failNextOutboxWrite` uses `mockRejectedValueOnce`, so only the *next* `create` call fails — subsequent calls in the same test would succeed.
- The cancel test asserts `informedAt: expect.any(String)` rather than a fixed value; this field marks the day the 14-day refund clock started for the buyer.
- `afterEach` calls `jest.restoreAllMocks()` to clear the `outboxEventModel.create` spy between tests.
