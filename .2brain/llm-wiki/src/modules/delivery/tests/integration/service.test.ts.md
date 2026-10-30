---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: 36459b05911d2bce865ca6067cd767cb4f8b93a2d33223161a8709cc7b36f323
generated_at: 2026-10-29T03:48:15.799497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration tests for the delivery service covering three areas: shipping-rate pricing rules, fulfillment-order lifecycle (creation on the `paid` event, idempotency, guard conditions), and the ship operation (writing the shipment, advancing order status, sending the tracking email). Runs against a real Mongo instance via `setupTestDb`; only the mailer is mocked.

## Key elements

- **`wireDelivery()`** — resets domain events, calls `deliveryModule.subscribe()`, then marks events as wired. Must be invoked before any test that depends on the `paid` → create-fulfillment-order listener.
- **`processingOrderOf(quantities)`** — seeds a user, N products at price 10, and an order in `processing` status. Returns `{ user, order, products }`.
- **`shipFrom(orderId, input?, number?)`** — looks up the fulfillment order by sequence number and calls `deliveryService.shipFulfillmentOrder` as admin.
- **`describe('rates')`** — pure-function tests for `priceShipping`, `findShippingMethod`, and the `SHIPPING_METHODS` catalog (threshold-free rule, no-threshold method, pickup, unknown id, tracked-flag uniqueness).
- **`describe('the fulfillment orders of a paid order')`** — idempotent creation, cancellation race between read and write, rejection for unpaid / delivered orders, listener-driven creation after `markPaid`, and per-role listing.
- **`describe('shipping a whole fulfillment order')`** — happy path (shipment record, order status → `shipped`, single email), fallback greeting when user lookup fails, resilience to mail-queue failure, and refusal to double-ship.

## Relationships

- **`@modules/delivery/services/index.ts`** — primary SUT; every act under test goes through `deliveryService`.
- **`@modules/delivery/domain/index.ts`** — `findShippingMethod`, `priceShipping`, `SHIPPING_METHODS` are the functions exercised in the rates suite.
- **`@modules/delivery/repository.ts`** — `fulfillmentOrderRepository.findByOrderId` used to assert persisted state.
- **`@modules/delivery/model.ts`** — `fulfillmentOrderModel` imported (available for direct-DB assertions).
- **`@modules/delivery/module.ts`** — `deliveryModule.subscribe()` wires the `paid` event listener that creates fulfillment orders.
- **`@modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `shipmentsOf` helpers read DB state.
- **`@infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; assertions inspect its call arguments to verify the tracking email.
- **`@infrastructure/adapters/logger.ts`** — `logger.error` spied in the mail-queue-down test.
- **`@kernel/outbox.ts`** — `settleOutboxNudges()` flushes async outbox work so listener effects are observable.
- **`@kernel/events.ts`** — `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle per test.
- **`@infrastructure/observability/audit.ts`** — `registerAuditSink`, `AuditEntry` imported (audit trail assertions, visible in truncated portion).
- **`@modules/inventory/index.ts`** — `inventoryService` imported for inventory-side interactions during shipping.

## Notes

- **Real database.** `setupTestDb()` connects to Mongo; no DB mocking. This makes the tests slower but exercises the full write path (repository → model → collection).
- **`wireDelivery()` is opt-in per test.** Tests that don't call it will not trigger the `paid` listener; forgetting it silently skips the event-driven creation path.
- **`settleOutboxNudges()` is required** after any action that enqueues outbox work (e.g., `markPaid`, `shipFulfillmentOrder`); without it, listener effects are still in flight.
- **Single mailer mock.** `enqueueEmail` is the only infrastructure mock. Logger is spied selectively. Everything else (orders, users, products, inventory) hits the real service layer against the test DB.
- **Idempotency is explicitly tested.** Calling `fulfillmentOrdersOf` (or the underlying `ensureFulfillmentOrders`) multiple times must still yield exactly one physical fulfillment order.
- **Cancellation race guard.** A test simulates `recordFulfillmentProgress` resolving to `null` (order vanished) and asserts `ensureFulfillmentOrders` resolves cleanly rather than throwing, preventing the outbox from stalling.
