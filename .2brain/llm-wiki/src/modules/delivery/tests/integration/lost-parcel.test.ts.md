---
source: src/modules/delivery/tests/integration/lost-parcel.test.ts
sha256: d2508ad43fa75119587bc879d4e0ba294d885fdcdf37d14845830ac7771a2301
generated_at: 2026-11-14T19:52:41.629909+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/lost-parcel.test.ts

## Purpose

Integration test suite for the "lost parcel" lifecycle in the delivery module. It verifies that when a shipment is reported lost, the units reopen on the *same* fulfillment order, the stock hold is re-reserved, the order regresses `shipped → processing` and can be re-shipped and delivered through the normal path, the buyer receives exactly one templated email, and no side effects (new order, invoice, re-charge) occur. Uses a real Mongo instance and a real outbox; the mailer is the only mocked boundary.

## Key elements

- **`shippedOrder(quantity, onHand?, email?)`** – End-to-end fixture: creates a user, product, paid order, inventory reservation, and ships one parcel. Returns IDs for the order, product, and shipment.
- **`reportLost(shipmentId, input?)`** – Calls `deliveryService.markShipmentLost` then `settleOutboxNudges()` to flush async outbox work.
- **`reship(orderId)`** – Re-ships the first fulfillment order (the "second attempt" after a loss).
- **`lostMails()`** – Filters the mocked `enqueueEmail` calls for the `delivery.shipment-lost` template.
- **Read helpers** (`statusOf`, `timelineTypes`, `reservedOf`, `holdStatusOf`, `firstShipmentStatus`, `shipmentWith`, `levelOf`) – Thin async wrappers over repositories/factories used in assertions.
- **`describe('reporting a parcel lost')`** – Core invariant tests: unit reopening, stock re-hold, single audit/timeline/event/mail record, no invoice/order duplication, re-ship → deliver cycle, partial-shipment edge case.
- **`describe('the admin override after a loss')`** – Verifies that an admin can force a reopened order forward as a single forced shipment.
- **`beforeEach`** – Resets domain events, re-subscribes both delivery and orders modules, then marks events as wired.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a jest mock; everything else runs for real.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/services/index.ts` | Primary SUT: `markShipmentLost`, `shipFulfillmentOrder`, `deliverShipment` are exercised across all tests. |
| `src/modules/delivery/module.ts` | Subscribed in `beforeEach` so its domain-event handlers are active during every test. |
| `src/modules/delivery/model.ts` | `shipmentModel` imported (used indirectly via read helpers). |
| `src/modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf`, `shipmentsOf` read helpers used throughout assertions. |
| `src/modules/inventory/services/index.ts` | Used in the `shippedOrder` fixture to reserve and commit stock before shipping. |
| `src/modules/inventory/tests/factories.ts` | `reservationRepository`, `stockLevelRepository` for asserting hold and stock-level changes. |
| `src/modules/inventory/repository.ts` | Underlying repository the stock-level and reservation factories read from. |
| `src/modules/inventory/index.ts` | Module barrel re-exporting the inventory service used in fixtures. |
| `src/modules/orders/index.ts` | Provides `orderService`, called in the admin-override suite to force a status change. |
| `src/modules/orders/module.ts` | Subscribed in `beforeEach` so order-side event handlers fire alongside delivery's. |
| `src/infrastructure/adapters/mailer.ts` | Mocked; `enqueueEmail` is the sole fake boundary. |
| `src/infrastructure/observability/audit.ts` | `registerAuditSink` captures audit entries for assertions; verifies notes/messages are excluded. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes async outbox; `outboxEventModel` used to assert event counts. |
| `src/kernel/events.ts` | `resetDomainEvents` / `markDomainEventsWired` manage the in-process event bus per test. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` imported (used internally by services under test). |

## Notes

- **Only the mailer is mocked.** Mongo, the outbox, and both domain modules run for real, making this a true integration test.
- **`settleOutboxNudges()` must follow any action that enqueues outbox work** (e.g., reporting lost, overriding status); forgetting it leaves async assertions racy.
- **Audit-leak guard:** the test explicitly asserts that the admin's free-text `note` and custom `message` never appear in audit metadata — only the structured `reason` does.
- **The "lost shipment still counts as shipped" invariant:** `order.fulfillment.shipped` stays `true` after a loss, which keeps the whole-order cancel path closed. This is a deliberate business rule pinned by the first test.
- **The file is truncated in this snapshot;** the admin-override `describe` block is incomplete. The full file likely contains additional assertions on the forced shipment.
- **Convention:** the module-level `admin` constant is a `callerContextAs('admin')`; all service calls pass it as the actor, with `asAdmin()` as the authentication token.
