---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: d3482826ca4cee6584620f8d384b23f1f3eeb77d56e30c0411ee238bd6029153
generated_at: 2026-11-14T19:54:33.418935+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery module's service layer, covering shipping-rate pricing, fulfillment-order lifecycle (creation, idempotency, race conditions), and the ship action (shipment write, order-status transition, tracking email). It runs against a real MongoDB instance and asserts email side-effects through a mocked queue rather than a real transport.

## Key elements

- **`wireDelivery()`** — Resets domain events, subscribes `deliveryModule` listeners, and marks the event bus as wired; must be called before any test that depends on event-driven behaviour (e.g. the `paid` listener).
- **`processingOrderOf(quantities, extras, email)`** — Factory helper that creates a user, N products at 10.00, and an order in `processing` status with the given line quantities.
- **`shipFrom(orderId, input, number)`** — Locates the Nth physical fulfillment order for the order and calls `deliveryService.shipFulfillmentOrder` as the admin caller.
- **`describe('rates')`** — Unit-level checks on `priceShipping`, `findShippingMethod`, and `SHIPPING_METHODS` (free-above-threshold, no-threshold methods, pickup, unknown-id, tracked-method uniqueness).
- **`describe('the fulfillment orders of a paid order')`** — Verifies idempotent creation, the paid→cancel race (read-then-write), absence for unpaid/delivered orders, event-driven creation via `markPaid`, and that listing returns empty before payment.
- **`describe('shipping a whole fulfillment order')`** — End-to-end ship: shipment record, order status → `shipped`, fulfillment-order → `closed`, exactly one `enqueueEmail` call with correct template/tracking, fallback-name policy when user lookup fails, and resilience when the email queue throws.
- **`mockEnqueueEmail`** — The single mock for all email assertions; cleared and inspected per test.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Module-level mock replacing `enqueueEmail` with a jest.fn.

## Relationships

- **`src/modules/delivery/services/index.ts`** — `deliveryService` is the system under test; every act in the suite calls its methods.
- **`src/modules/delivery/domain/index.ts`** — `findShippingMethod`, `priceShipping`, and `SHIPPING_METHODS` are imported from here and asserted in the `rates` block.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel` imported for direct document inspection.
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf` and `shipmentsOf` used as read helpers in assertions.
- **`src/infrastructure/adapters/mailer.ts`** — Entirely mocked; `enqueueEmail` is the assertion surface for email side-effects.
- **`src/kernel/events.ts`** — `resetDomainEvents` (in `afterEach`) and `markDomainEventsWired` (in `wireDelivery`) manage the event-bus lifecycle per test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` awaited after event-driven operations so outbox entries flush before assertions.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` and `AuditEntry` imported for audit-sink assertions.
- **`src/modules/inventory/index.ts`** — `inventoryService` imported; used in the truncated portion for stock-related shipping tests.

## Notes

- **Real DB, mocked transport.** The file calls `setupTestDb()` (real Mongo) but mocks the mailer module. There is no DB mock; test isolation relies on per-test data creation, not truncation.
- **Event wiring is manual.** Tests that depend on domain-event listeners must call `wireDelivery()` explicitly; without it, `markPaid` or other triggers will not reach the delivery module.
- **Outbox is not synchronous.** After any event-driven act, `await settleOutboxNudges()` is required before asserting on downstream effects (email, order status).
- **Race-condition test.** The "canceled between read and write" test spies on `orderService.recordFulfillmentProgress` to simulate a lost order and asserts the service resolves cleanly (no throw) rather than propagating the error.
- **Fallback greeting.** When `userService.getById` rejects, the shipping email uses the order's email address as the greeting (`username ?? email` policy).
- **`afterEach` restores all mocks and resets domain events**, so each test starts with a clean event bus and no lingering mock state.
