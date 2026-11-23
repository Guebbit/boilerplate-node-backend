---
source: src/modules/delivery/tests/integration/service.test.ts
source_sha256: 7ce091c0d0d6856e0452d5c172948c657908e8f66d3ff1fdfcbdff04297e80ed
context_sha256: ca71d1e51ddc696f65911b4ada7f65e7be0d70070503b8abe430a548992bbd48
generated_at: 2026-11-22T05:03:25.459146+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose
Integration tests for the delivery module: shipping-rate rules and the fulfillment acts (creating fulfillment orders for paid orders, shipping them, and keeping shipments and the parent order in step). It runs against a real Mongo database via `setupTestDb`; the shipped email is asserted through a mocked mail queue.

## Key elements
- **Mocks and setup**
  - `jest.mock('@infrastructure/adapters/mailer')` replaces `enqueueEmail` with `mockEnqueueEmail`, so tests can assert which template and data were enqueued.
  - `setupTestDb()` provides the real database.
  - An `afterEach` restores spies and calls `resetDomainEvents()`.
- **Helpers**
  - `wireDelivery()` resets domain events, subscribes the delivery module's own listeners, and calls `markDomainEventsWired()`, so the outbox delivers to them as the app's boot does.
  - `admin` is `callerContextAs('admin')`, the caller of every act.
  - `processingOrderOf(quantities, extras, email)` creates a user, products priced `10.00`, and a `processing` order.
  - `shipFrom(orderId, input, number)` finds the order's fulfillment order by number and calls `deliveryService.shipFulfillmentOrder` as admin.
- **`rates` suite**
  - Checks that `priceShipping` gives the flat price below the free-above threshold and `'0.00'` at it.
  - A method with no threshold never becomes free, and pickup is free but still a method.
  - `findShippingMethod` returns `undefined` for an unknown id.
  - `express` is the only `tracked` method in `SHIPPING_METHODS`.
- **`the fulfillment orders of a paid order` suite**
  - Fulfillment orders are created once, even under concurrent calls: one `physical`, `open` order whose lines mirror the order's quantities.
  - If the order is canceled between the read and the write (`orderService.recordFulfillmentProgress` mocked to return `null`), `ensureFulfillmentOrders` resolves without error and creates nothing.
  - Unpaid orders and orders already past dispatch get none.
  - The `paid` listener creates them after `markPaid` and `settleOutboxNudges`, and the order's `fulfillment.remaining` becomes 1.
  - `listFulfillmentOrdersForOrder` and `listShipmentsForOrder` return empty lists for an unpaid order. Once paid, the listed fulfillment orders carry `actions.ship`.
- **`shipping a whole fulfillment order` suite** (visible cases)
  - Shipping writes a `shipped` shipment (number 1, with the tracking code), moves the order to `shipped` with `fulfillment` `{ shipped: true, remaining: 0, undelivered: 1 }`, and closes the fulfillment order. It enqueues exactly one `delivery.shipment-shipped` email to the order's email.
  - Shipping still succeeds and mails a fallback greeting containing the email when `userService.getById` rejects.
  - Shipping still succeeds when `enqueueEmail` throws; the logger's error output is silenced.
  - The file continues with a case that refuses an order that is not processing.

## Relationships
- **Delivery module under test:**
  - `domain` (`findShippingMethod`, `priceShipping`, `SHIPPING_METHODS`)
  - `services` (`deliveryService`)
  - `repository` (`fulfillmentOrderRepository`)
  - `model` (imported as `fulfillmentOrderModel`)
  - `module` (the default export, used to subscribe the module's listeners in `wireDelivery`)
  - `tests/factories` (`fulfillmentOrdersOf`, `shipmentsOf`)
- **Mailer adapter** (`infrastructure/adapters/mailer`): `enqueueEmail` is mocked.
- **Logger adapter** (`infrastructure/adapters/logger`): the logger is spied on and its error output silenced.
- **Kernel** (`kernel/events`, `kernel/outbox`): `resetDomainEvents` and `markDomainEventsWired` control listener wiring. `settleOutboxNudges` waits for outbox delivery before assertions.
- **Audit** (`infrastructure/observability/audit`): `registerAuditSink` and `AuditEntry` are imported. Their use is not visible in the excerpt.
- **Inventory** (`modules/inventory`): `inventoryService` is imported. Its use is not visible in the excerpt.
- **Other modules:**
  - `orders` supplies `orderService`, `withdrawUntilFrom`, `markPaid` and the order factories.
  - `users` supplies `userService` and `createUser`.
  - `products` supplies `createProduct` and `countersOf`.
  - Shared test utilities: `@tests/setup-test-db`, `@tests/callers`, `@tests/response`.

## Notes
- The header says the file also pins these behaviors:
  - Free-above pricing uses the items total alone.
  - Partial shipping keeps the order `processing` until nothing remains.
  - The withdrawal clock starts from the last arrival.
  - Holds, digital fulfillment, shipping from `paid`, and an order cancel keep the records and the order in step.
- Tests that assert on email or listeners call `wireDelivery()` first. Otherwise the outbox has no delivery listeners.
- Mail-related tests call `mockEnqueueEmail.mockClear()`. The test that makes `enqueueEmail` throw uses `mockImplementation`, which `restoreAllMocks` in `afterEach` is relied on to reset.
- `fulfillmentOrdersOf` is used both as a reader and as the stand-in for the `paid` listener's creation step in tests that do not wire the listener.
