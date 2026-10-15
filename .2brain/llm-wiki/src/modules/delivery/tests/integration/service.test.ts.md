---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: 082a2193eb2a0b4b1f8b3b2537b5423ec9faac3e7124c21463d218f3c756408d
generated_at: 2026-10-15T10:28:59.030790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery module's service layer. It exercises the full stack — real MongoDB, real domain logic, real event/outbox flow — with only the mailer adapter mocked. It pins the invariants the module's doc comment calls out: free-above pricing, idempotent fulfillment-order creation, atomic ship-and-move, partial-shipping state, withdrawal-clock timing, holds, digital fulfilment, forced shipments, and cancel.

## Key elements

- **`wireDelivery()`** — calls `deliveryModule.subscribe()` + `markDomainEventsWired()` so the outbox delivers events to the module's listeners (mirrors app boot). Must be invoked before any test that relies on the `paid` listener.
- **`processingOrderOf(quantities, extras?, email?)`** — factory that creates a user, N products (price 10), and an order in `processing` status with the given line quantities. Returns `{ user, order, products }`.
- **`shipFrom(orderId, input?, number?)`** — locates the n-th fulfillment order for the order and calls `shipFulfillmentOrder` as admin.
- **`admin`** — pre-built `callerContextAs('admin')` reused as the caller for every service act.
- **`describe('rates')`** — unit-level checks on `priceShipping` / `findShippingMethod` / `SHIPPING_METHODS` (threshold, no-threshold, pickup, unknown-id, tracked flag).
- **`describe('the fulfillment orders of a paid order')`** — idempotency, non-creation for unpaid/delivered orders, creation via the `paid` domain-event listener (outbox), and the read API (`getForOrder`) returning empty lists for unpaid orders vs. populated actions for paid.
- **`describe('shipping a whole fulfillment order')`** — happy-path shipment write + order status move + single email; fallback-name logging on buyer-lookup failure; 409 on non-processing order; 422 missing tracking code for tracked method; untracked method ships without code.
- *(truncated sections cover partial shipping, holds, digital fulfilment, forced shipments, and cancel — all imported from `@modules/delivery/services`)*
- **`jest.mock('@infrastructure/adapters/mailer')`** — sole infrastructure mock; every email assertion goes through `mockEnqueueEmail`.
- **`afterEach`** — `jest.restoreAllMocks()` + `resetDomainEvents()` to isolate tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/services/index.ts` | Barrel import of every service act under test (`shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `editShipmentTracking`, `getForOrder`, `cancelAllForOrder`, `splitForAllocation`). |
| `src/modules/delivery/services/deliver.ts` | `deliverShipment` exercised in partial-shipment and digital-fulfilment scenarios. |
| `src/modules/delivery/services/holds.ts` | `holdFulfillmentOrder` / `releaseFulfillmentOrder` tested for hold lifecycle. |
| `src/modules/delivery/services/fulfill.ts` | `fulfillFulfillmentOrder` tested for digital fulfilment path. |
| `src/modules/delivery/services/cancel-remainder.ts` | `cancelAllForOrder` tested for order-cancel scenario. |
| `src/modules/delivery/services/read.ts` | `getForOrder` tested for the read API (empty vs. populated, action flags). |
| `src/modules/delivery/domain/index.ts` | `findShippingMethod`, `SHIPPING_METHODS` used in rate tests. |
| `src/modules/delivery/domain/rates.ts` | `priceShipping` is the pricing function under test. |
| `src/modules/delivery/module.ts` | `deliveryModule.subscribe()` wired by `wireDelivery()` to activate event listeners. |
| `src/modules/delivery/repository.ts` | `fulfillmentOrderRepository.findByOrderId` used to assert persistence directly. |
| `src/modules/delivery/model.ts` | `fulfillmentOrderModel` imported (likely used for direct model assertions). |
| `src/kernel/events.ts` | `markDomainEventsWired` / `resetDomainEvents` manage the event-bus lifecycle per test. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes the outbox so listeners fire synchronously in tests. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` mocked; asserted for template, recipient, tracking data, and call count. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` spied on to verify fallback-name logging. |

## Notes

- **Real Mongo, one mock.** `setupTestDb()` gives a real collection; the *only* stubbed dependency is the mailer. Everything else (domain, services, repository, outbox, events) runs for real.
- **Outbox is synchronous in tests.** `settleOutboxNudges()` must be awaited after triggering an event (e.g. `markPaid`) to guarantee the listener has run before assertions.
- **`wireDelivery()` is opt-in per test.** Only tests that depend on the `paid` listener call it; forgetting it means the fulfillment order is never created by the event path.
- **Caller context matters.** All service acts are invoked as `admin`; the read API test also uses `asCustomer(user._id)` to verify authorization boundaries.
- **Email is asserted, not sent.** The mailer mock records `(envelope, template, data)` tuples; tests check template name (`delivery.shipment-shipped`), recipient, tracking string, and that `data.more` is absent for a full shipment.
- **Error codes are part of the contract.** Tests assert specific `errors[0].code` values (`ORDER_NOT_PROCESSING`, `DELIVERY_TRACKING_CODE_REQUIRED`) alongside HTTP status, so renaming a code breaks this suite.
