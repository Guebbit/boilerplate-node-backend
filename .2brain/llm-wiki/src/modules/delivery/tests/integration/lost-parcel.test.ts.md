---
source: src/modules/delivery/tests/integration/lost-parcel.test.ts
sha256: 6d26fa67957385441f75559dfcb383c2a1d470dc24cb07976eb0f4a21d6e4c01
generated_at: 2026-11-08T05:42:21.539290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/lost-parcel.test.ts

## Purpose

Integration tests for the lost-in-transit parcel workflow. They pin the full lifecycle: an admin reports a shipment lost, the order regresses `shipped → processing`, stock hold is restored from free shelf (or overflowed to backorder), the order is re-shipped through the ordinary `shipFulfillmentOrder` path, and the replacement is delivered. They also cover the admin `overrideStatus` path and assert that `deliverShipment` accepts a lost parcel back only when all its units are still open. Uses real MongoDB and a real outbox; the mailer is the sole mock.

## Key elements

- **`shippedOrder(quantity, onHand?, email?)`** – Builds a complete shipped order (user → product → order → reserve → commit → `shipFulfillmentOrder`) and returns the IDs needed by each test.
- **`reportLost(shipmentId, input?)`** – Calls `deliveryService.markShipmentLost` as admin, then `settleOutboxNudges()` to let the outbox process the event.
- **`reship(orderId)`** – Re-ships the first fulfillment order with a new tracking code, simulating the staff reship after a loss.
- **`lostMails()`** – Filters `mockEnqueueEmail` calls for the `delivery.shipment-lost` template.
- **Readers** – `statusOf`, `timelineTypes`, `reservedOf`, `holdStatusOf`, `firstShipmentStatus`, `shipmentWith`, `levelOf` – thin async helpers that read a single field or row so test assertions stay one-liners.
- **`describe('reporting a parcel lost')`** – Six tests: unit reopen + status regression, stock-hold top-up, single-record side-effects (timeline, audit, outbox event, mail), no invoice/new-order/no re-charge, reship-and-deliver round-trip, partial-shipment (order already `processing`).
- **`describe('the admin override after a loss')`** – Verifies `orderService.overrideStatus` can still force the reopened order to `shipped` and that a forced shipment is created.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a `jest.fn`; the rest of the stack is real.
- **`beforeEach`** – Resets domain events, re-subscribes `deliveryModule` and `ordersModule`, calls `markDomainEventsWired`.

## Relationships

- **`src/modules/delivery/services/index.ts`** – Primary SUT: `deliveryService.markShipmentLost`, `deliveryService.shipFulfillmentOrder`, `deliveryService.deliverShipment`.
- **`src/modules/delivery/tests/factories.ts`** – `fulfillmentOrdersOf`, `shipmentsOf` helpers for reading delivery state.
- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` wires the module's event handlers before each test.
- **`src/modules/inventory/services/index.ts`** – `inventoryService.reserveForOrder` / `commitForOrder` set up the stock hold.
- **`src/modules/inventory/tests/factories.ts`** – `reservationRepository`, `stockLevelRepository` for asserting hold status and `onHand / reserved / available / backordered` counters.
- **`src/modules/orders/index.ts`** – `orderService.overrideStatus` exercised in the admin-override test.
- **`src/modules/orders/module.ts`** – `ordersModule.subscribe()` ensures order-side event handlers are active.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox writes; `outboxEventModel.countDocuments` asserts exactly one `shipment.lost` event and zero `order.created` / invoice events.
- **`src/kernel/events.ts`** – `resetDomainEvents` / `markDomainEventsWired` manage the in-process event bus between tests.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures audit entries to assert a single `admin.shipment.lost` record with the expected metadata and no leakage of the internal `note`.
- **`src/infrastructure/adapters/mailer.ts`** – Mocked; assertions count and filter `enqueueEmail` calls.
- **`src/modules/delivery/model.ts`** – `shipmentModel` imported (available for direct model-level assertions if needed).
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` imported for use in transactional test scenarios.

## Notes

- The file's doc-comment block explicitly enumerates the invariants it pins; treat it as the acceptance spec for the lost-parcel feature.
- Only the mailer is mocked. MongoDB (`setupTestDb`) and the outbox are real, so these tests exercise real persistence and real event fan-out.
- `reportLost` always calls `settleOutboxNudges()` after the service call—tests that assert outbox row counts depend on this; forgetting it in a new test will cause flaky "0 instead of 1" failures.
- The mail assertion checks that the buyer-facing `message` appears in the queued email while the internal `note` does **not** (staff-only field).
- `beforeEach` re-subscribes both modules each time; if a new module is added to the dependency chain, it must also be subscribed here or its event handlers will be silent.
- The partial-shipment test (order with 3 units, only 1 shipped) verifies the order stays `processing` and the unshipped 2 units remain on the same fulfillment order—this guards against an implementation that splits the fulfillment order on loss.
