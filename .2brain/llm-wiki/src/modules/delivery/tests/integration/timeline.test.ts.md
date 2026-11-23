---
source: src/modules/delivery/tests/integration/timeline.test.ts
source_sha256: c097e21d2e946905de46e2b17608b3802557ebb279a0720e26350e6b9670e4f9
context_sha256: 1b5213b8294496ab159d09c4ae10d8cbff2b7ec7993dbdfc18a576114e3f96c3
generated_at: 2026-11-22T05:03:41.804570+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/timeline.test.ts

## Purpose
Integration test suite verifying what the delivery module writes to an order's timeline: one row per shipment, arrival, hold and release, written in the act's own transaction. Rows carry ids and codes, never the hold's note. Tests run against a real Mongo instance and go through the public `deliveryService` API.

## Key elements
- **`setupTestDb()`**: sets up the real test database; an `afterEach` restores mocks, calls `resetDomainEvents()` and clears the mail mock.
- **`mockEnqueueEmail`**: a `jest.mock` of `@infrastructure/adapters/mailer` that stands in for the mail queue.
- **`admin`**: a `callerContextAs('admin', 'admin-1')` context. It is the actor expected on timeline rows.
- **`processingOrder()`**: helper that creates a user, a product (price `10.00`) and a `processing` order of 2 units. It returns the order, the product and the first fulfillment order id.
- **`trail(orderId)`**: maps an order's timeline to `[type, actor]` pairs.
- **Test groups**:
  - `shipping and delivering`:
    - A partial shipment writes only `shipment_shipped`. Shipping the rest adds a second `shipment_shipped` and then `shipped`.
    - Rows carry `shipmentId`, `fulfillmentOrderId` and `trackingCode`. Delivering the shipment adds `shipment_delivered` and `delivered`.
    - Shipping a held fulfillment order is refused (`success: false`) and leaves the timeline unchanged.
    - Digital fulfillment writes `shipment_shipped`, `shipment_delivered` and `delivered`.
  - `starting fulfillment`: `processOrder` writes a `processing` row with actor `admin-1`.
  - `holds`: `fulfillment_held` carries `reason: 'high_risk'`, and `fulfillment_released` follows. The note text must not appear anywhere in the serialized rows.
  - `an order canceled whole`: `cancelAllForOrder` adds no timeline rows.

## Relationships
- Calls `deliveryService` (`@modules/delivery/services`): `shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `processOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder` and `cancelAllForOrder`.
- Uses the factories from `users`, `products` and `orders` (`createUser`, `createProduct`, `createOrder`, `seedDigitalOrder`, `toOrderItem`, `timelineOf`) and from `delivery` (`fulfillmentOrdersOf`, `shipmentsOf`) to seed and read state.
- Imports `OrderStatus` from `@types`.
- Uses `asAdmin` and `callerContextAs` from `tests/support/callers`, and `setupTestDb` from `tests/support/setup-test-db`.
- Mocks `enqueueEmail` from `infrastructure/adapters/mailer`. The mail queue is mocked, though no test here asserts on it.
- Calls `resetDomainEvents` from `kernel/events` after each test.

## Notes
- The `starting fulfillment` test uses `toContainEqual` rather than a whole-trail match, because `ensureFulfillmentOrders` writes rows of its own.
- Order matters. The shipment row precedes the order's own status row, as the shipment is the fact and the order's move is its consequence.
- A whole-order cancel is expected to leave the timeline empty, since the order's own `canceled` row already records it.
