---
source: src/modules/delivery/tests/integration/order-status-races.test.ts
source_sha256: de781da539ffb91f8dd7c38e7ae915f5706bef775fa32ff83a43b8358e27332a
context_sha256: 90b55740e32cf1559b86e1c6e7bdd32ae631cc7fd96f7319546ffadcb9be6535
generated_at: 2026-11-22T05:01:12.467976+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/order-status-races.test.ts

## Purpose
Integration test that exercises concurrent status-changing requests on the same order over real HTTP, checking that two callers cannot both pass a check and both write, nor trigger an email for the wrong final state. It covers the delivery "ship door" (creating shipments against a fulfillment order) under N-way contention, and a ship racing a cancel of the whole order.

## Key elements
- **`mockEnqueueEmail`**: typed handle on the Jest-mocked `enqueueEmail`. It stands in for the mail queue so tests can assert which mail was enqueued.
- **`SHIPMENT_WON` / `CANCEL_WON`**: the two expected whole outcomes of a ship-vs-cancel race: HTTP statuses, order status, shipment count, and fulfillment-order status.
- **`two admins racing the same ship door`**:
  - Fires `RACE_SIZE` concurrent full-ship POSTs. Expects exactly one 201, the rest 409, no 5xx, exactly one email, one shipment, and the order `shipped`.
  - Fires `RACE_SIZE` concurrent racers each asking for 1 unit of a 3-unit order. Expects exactly three 201s, three shipped units in total, and the order `shipped`.
- **`a ship racing a cancel of the whole order`**: runs a ship and `POST /orders/:id/cancel` together via `Promise.all`. After the outbox settles, expects the observed state to equal exactly `SHIPMENT_WON` or `CANCEL_WON`, depending on whether the ship returned 201.
- **`a first shipment from a paid order that moved away meanwhile`**: spies on `orderService.markProcessing` to return `null` once, simulating a lost `paid → processing` write. Expects 409 `ORDER_NOT_PAID`, no shipments, and the order still `paid`.

## Relationships
- `@tests/setup-test-db` (`setupTestDb`) sets up the test database.
- `@tests/http` (`api`, `authenticateAs`) makes HTTP requests as an admin.
- `@tests/race` (`raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`) drives and checks concurrency.
- `@tests/eventually` (`eventually`) polls until the email shows up.
- `@kernel/outbox` (`settleOutboxNudges`) flushes the outbox relay, so event-driven effects such as the shipped email and the delivery listener's fulfillment-order cancellation are done before asserting.
- `@infrastructure/adapters/mailer` is replaced with a Jest mock.
- `@modules/orders` (`orderService`) is spied on in the paid-order case.
- Factories (`@modules/products/tests/factories`, `@modules/orders/tests/factories`, `../factories`) create products, orders, and items, and read orders, shipments, and fulfillment orders.
- `@types` provides `OrderStatus`.

## Notes
- The email assertion waits with `eventually` plus `settleOutboxNudges`, then settles again to catch stragglers before asserting a single call. The mail rides the `shipment.shipped` event.
- Each ship request sends a fresh `Idempotency-Key` (`randomUUID()`), so racers are distinct requests rather than replays.
- In the ship-vs-cancel test the outcome is not fixed; the assertion branches on which side won and requires a non-hybrid state.
- The paid-order case mocks `markProcessing` because that race cannot be triggered on demand.
- `afterEach` calls `jest.restoreAllMocks()`.
