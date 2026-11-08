---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: 3e786d0e3cb74b26ffcedfc5aee8b548fa620791640064f49a34184ea4337540
generated_at: 2026-11-08T05:44:44.795903+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery service and its domain rules. Validates shipping-rate pricing, fulfillment-order creation/idempotency, the full "ship" act (shipment write, order status transition, tracking email), and resilience paths (buyer-lookup failure, mail-queue failure, cancel-race) against a real MongoDB instance with only the mail adapter mocked.

## Key elements

- **`wireDelivery()`** — resets domain events, calls `deliveryModule.subscribe()`, then marks events as wired. Simulates app-boot wiring so outbox-delivered events reach the module's listeners.
- **`processingOrderOf(quantities, extras, email)`** — factory helper that creates a user, N products, and an order in `processing` status with the given line quantities.
- **`shipFrom(orderId, input, number)`** — convenience wrapper that resolves the Nth fulfillment order for an order and calls `deliveryService.shipFulfillmentOrder` as the admin caller.
- **`describe('rates')`** — unit-level assertions on `priceShipping`, `findShippingMethod`, and `SHIPPING_METHODS` (threshold, no-threshold, pickup, unknown-id, tracked-flag).
- **`describe('the fulfillment orders of a paid order')`** — idempotent creation, cancel-race safety, status-gating (no orders for `pending`/`delivered`), listener-driven creation via `markPaid`, and buyer-vs-admin visibility of actions.
- **`describe('shipping a whole fulfillment order')`** — happy-path shipment write + order transition + single email; fallback greeting when buyer lookup fails; mail-queue failure still succeeds; double-ship rejection.
- **`admin` / `asAdmin()` / `asCustomer()`** — caller-context constants for every act; tests always act as admin unless specified.
- **Module-level mock** — `jest.mock('@infrastructure/adapters/mailer')` replaces `enqueueEmail` with a jest mock for all tests in this file.

## Relationships

- **`@modules/delivery/services/index.ts`** — `deliveryService` is the primary SUT (subject under test): `shipFulfillmentOrder`, `ensureFulfillmentOrders`, `listFulfillmentOrdersForOrder`, `listShipmentsForOrder`.
- **`@modules/delivery/domain/index.ts`** (re-exports `rates.ts`) — `priceShipping`, `findShippingMethod`, `SHIPPING_METHODS` are exercised directly in the `rates` describe block.
- **`@modules/delivery/repository.ts`** — `fulfillmentOrderRepository.findByOrderId` used for direct DB assertions bypassing the service.
- **`@modules/delivery/model.ts`** — `fulfillmentOrderModel` imported (likely for collection-level queries or type reference).
- **`@modules/delivery/module.ts`** — `deliveryModule.subscribe()` wires the paid-event listener that triggers fulfillment-order creation.
- **`@modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `shipmentsOf` helpers read persisted fulfillment/shipment documents.
- **`@infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; assertions verify recipient, template name, and payload (tracking code, greeting fallback).
- **`@infrastructure/adapters/logger.ts`** — `logger.error` is spied/mocked to suppress noise when the mail queue throws.
- **`@infrastructure/observability/audit.ts`** — `registerAuditSink` / `AuditEntry` imported for audit-trail assertions (visible in truncated portion).
- **`@kernel/events.ts`** — `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle between tests.
- **`@kernel/outbox.ts`** — `settleOutboxNudges()` flushes the async outbox so listener-driven writes are observable before assertions.
- **`@modules/inventory/index.ts`** — `inventoryService` imported (likely for stock-level assertions in the truncated portion).

## Notes

- Tests run against **real MongoDB** (`setupTestDb`); only the mailer is mocked. No in-memory DB or service mocks for the delivery domain.
- After any event-driven action (e.g. `markPaid`), you **must** `await settleOutboxNudges()` before asserting on side-effects; the outbox is asynchronous.
- `wireDelivery()` must be called in tests that rely on the `paid` listener; tests that call `ensureFulfillmentOrders` directly do not need it.
- `afterEach` calls `jest.restoreAllMocks()` and `resetDomainEvents()`; the module-level `jest.mock` for mailer persists across tests, so use `mockClear()` / `mockImplementation` per-test as needed.
- The file is **truncated** in the snapshot — additional describe blocks (partial shipping, withdrawal clock, digital fulfillment, holds) are indicated by the module doc comment but not visible here.
