---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: e26e28e4ffdcc7f7251a29449396c54427ef242b59023dfbdc336107d3762ce9
generated_at: 2026-10-14T15:38:33.228740+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery module's fulfillment services. Runs against a real MongoDB instance (`setupTestDb`) to verify end-to-end behaviour of shipping, holding, delivering, and cancelling fulfillment orders, as well as the domain rate rules. The mailer adapter is mocked so that shipped-email assertions inspect the queued envelope without sending.

## Key elements

- **`setupTestDb()`** — initialises a real Mongo database for the suite.
- **`mockEnqueueEmail`** — `jest.MockedFunction<typeof enqueueEmail>` used to assert that the correct template, recipient, and data are enqueued on shipment.
- **`wireDelivery()`** — helper that resets domain events, calls `deliveryModule.subscribe()`, then calls `markDomainEventsWired()`; replicates the app-boot listener wiring so outbox events reach delivery listeners during tests.
- **`admin`** — pre-built admin caller context passed to every service call.
- **`processingOrderOf(quantities, extras, email)`** — factory that creates a user, N products, and an order in `processing` status (or a custom status via `extras`).
- **`shipFrom(orderId, input, number)`** — convenience wrapper: locates the fulfilment order by number and calls `shipFulfillmentOrder`.
- **`describe('rates')`** — unit-level checks on `priceShipping`, `findShippingMethod`, and `SHIPPING_METHODS` (threshold-free rule, no-threshold methods, pickup, unknown id, tracked-method flag).
- **`describe('the fulfillment orders of a paid order')`** — verifies idempotent creation of a single physical fulfillment order on `processing` orders, absence for `pending`/`delivered`, creation via the `paid` domain-event listener (asserted through `settleOutboxNudges`), and `getForOrder` read shapes.
- **`describe('shipping a whole fulfillment order')`** — covers full shipment write, order status transition, email enqueue, buyer-lookup fallback + error logging, refusal of non-`processing` orders (409 `ORDER_NOT_PROCESSING`), missing tracking code for tracked methods (422), and untracked-method shipping without a code.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — fully `jest.mock`'d; every shipment assertion inspects `mockEnqueueEmail.mock.calls`.
- **`src/infrastructure/adapters/logger.ts`** — `jest.spyOn(logger, 'error')` to assert the buyer-lookup-failure log message and payload.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `markDomainEventsWired` gate whether delivery listeners fire; called in `wireDelivery` and in `afterEach`.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the outbox so the `paid` event reaches the delivery listener before assertions.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` registers the module's event listeners for the duration of the test.
- **`src/modules/delivery/services/index.ts`** — barrel import supplying `shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `editShipmentTracking`, `getForOrder`, `cancelAllForOrder`, `splitForAllocation`.
- **`src/modules/delivery/domain/index.ts`** — `findShippingMethod`, `priceShipping`, `SHIPPING_METHODS` exercised directly in the `rates` block.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository.findByOrderId` used for direct-DB assertions bypassing the service layer.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel` imported (available for raw-model assertions).
- **`src/modules/delivery/services/cancel-remainder.ts`**, **`deliver.ts`**, **`fulfill.ts`**, **`holds.ts`**, **`read.ts`** — the individual service implementations under test, accessed through the barrel.

## Notes

- The mailer is the **only** external adapter mocked; all other data access hits real Mongo. This means tests are slower but exercise repository and model code paths.
- `wireDelivery` must be called before any test that depends on domain-event listeners (e.g. the `paid` → create-fulfillment-order flow). Without it, the outbox settles but no listener is registered and the fulfillment order is never created.
- `afterEach` calls `jest.restoreAllMocks()` **and** `resetDomainEvents()`, so each test starts with a clean event bus and no lingering spy state.
- Error assertions use the `asReject` helper from `@tests/response` rather than raw `expect(...).rejects`, keeping status-code and error-code checks consistent across the codebase.
- The file is truncated in the graph snapshot; additional `describe` blocks (partial shipping / holds / digital fulfilment / cancellation) are referenced in the module-level docstring but not visible in the excerpt.
