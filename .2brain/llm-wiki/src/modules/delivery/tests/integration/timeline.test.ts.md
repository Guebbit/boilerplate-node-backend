---
source: src/modules/delivery/tests/integration/timeline.test.ts
sha256: e448cc3973eb2aabb7a174fcc65f4823927aa9fa31fb44eac369e066cc5b8b66
generated_at: 2026-11-08T05:45:11.420941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/timeline.test.ts

## Purpose

Integration test that verifies exactly what the delivery service writes to an order's timeline. It exercises the service's public methods (`shipFulfillmentOrder`, `deliverShipment`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `fulfillFulfillmentOrder`, `processOrder`, `cancelAllForOrder`) against a real MongoDB instance, asserting the type, actor, and data of each timeline row and their ordering.

## Key elements

- **`processingOrder()`** — async helper that seeds a `processing` order (2 units, 1 product) and returns the order, product, and fulfillment-order id.
- **`trail(orderId)`** — maps an order's timeline rows to `[type, actor]` pairs for compact assertions.
- **`describe('shipping and delivering')`** — four tests covering: one timeline row per partial shipment plus the order-level `shipped` row only when the last unit leaves; tracking-code and id propagation plus arrival closing the order; no row on a refused act; digital fulfillment producing a "born-delivered" shipment.
- **`describe('starting fulfillment')`** — asserts `processOrder` writes a `processing` row attributed to the operator (uses `toContainEqual` because `ensureFulfillmentOrders` adds its own rows).
- **`describe('holds')`** — asserts hold stores the `reason` code and release is recorded, while the free-text `note` is **never** persisted.
- **`describe('an order canceled whole')`** — asserts `cancelAllForOrder` adds **zero** timeline rows (the order's own `canceled` event suffices).
- **`afterEach`** — restores all mocks, calls `resetDomainEvents()`, clears `mockEnqueueEmail`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/services/index.ts` | System under test — every assertion targets a `deliveryService` method. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is mocked out so tests don't send real mail; verified via `mockEnqueueEmail`. |
| `src/kernel/events.ts` | `resetDomainEvents()` is called in `afterEach` to clear any queued domain events between tests. |
| `src/modules/delivery/tests/factories.ts` | Provides `fulfillmentOrdersOf` and `shipmentsOf` query helpers. |
| `src/modules/orders/tests/factories.ts` | Provides `createOrder`, `seedDigitalOrder`, `toOrderItem`, and the `timelineOf` reader used in assertions. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the product referenced by order items. |
| `src/modules/users/tests/factories.ts` | `createUser` seeds the order owner. |
| `src/types/index.ts` | `OrderStatus` enum values (`processing`, `paid`) used when seeding orders. |
| `tests/support/callers.ts` | `asAdmin()` and `callerContextAs` build the caller-context argument passed to service methods. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises and tears down the real Mongo connection for the suite. |

## Notes

- The file explicitly asserts the **order** of timeline rows (shipment row before the order-level row), not just their presence.
- The hold test uses `JSON.stringify(rows)).not.toContain('caller sounded odd')` as a belt-and-suspenders check that the note never leaks into persisted data.
- The digital-fulfillment test expects three rows (`shipment_shipped`, `shipment_delivered`, `delivered`) with **no** separate delivery act — the shipment is "born delivered."
- `cancelAllForOrder` is the one delivery act that writes **nothing** to the timeline; this is intentional and asserted.
- The processing test deliberately avoids a full-array `toEqual` match because `ensureFulfillmentOrders` (called internally by `processOrder`) writes additional rows the test doesn't care about.
