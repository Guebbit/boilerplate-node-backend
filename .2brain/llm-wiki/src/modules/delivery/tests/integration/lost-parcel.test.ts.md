---
source: src/modules/delivery/tests/integration/lost-parcel.test.ts
sha256: f9027705fddee2d367816b9149f1b4b02cc372aa08013cdbe241e30661703705
generated_at: 2026-10-29T03:46:13.432800+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/lost-parcel.test.ts

## Purpose

Integration test for the "parcel lost in transit" workflow. It verifies the full lifecycle—reporting a shipment lost, reopening its units on the same fulfillment order, topping up the stock hold, stepping the order back to `processing`, reshipping, and delivering the replacement—against a real MongoDB with the mailer mocked at its queue boundary.

## Key elements

- **`shippedOrder(quantity, onHand?, email?)`** — End-to-end setup: creates a user, product, order in `processing`, reserves & commits stock, ships via `deliveryService.shipFulfillmentOrder`. Returns IDs needed by the test.
- **`reportLost(shipmentId, input?)`** — Calls `deliveryService.markShipmentLost` then `settleOutboxNudges()` so outbox-driven side-effects (mail, events) are flushed.
- **`reship(orderId)`** — Ships the (now reopened) fulfillment order a second time with a new tracking code.
- **`lostMails()`** — Filters `mockEnqueueEmail` calls to only those using the `delivery.shipment-lost` template.
- **`levelOf(productId)`** — Reads the stock-level document and returns `{ onHand, reserved, available, backordered }`.
- **`describe('reporting a parcel lost', …)`** — Six tests covering: unit reopening & order status regression; hold top-up from free shelf; single recording across timeline/audit/outbox/mail; no invoice or new order created; full reship-and-deliver cycle; partial-shipment loss leaving other units untouched.
- **`describe('the admin override after a loss', …)`** — Verifies `orderService.overrideStatus` can force a reopened order to `shipped` and produces a `forced: true` shipment alongside the `lost` one.
- **`describe('what it refuses', …)`** — Negative cases (delivered, already-lost, cancelled-order shipments).
- **`beforeEach`** — Resets domain events, re-subscribes `deliveryModule`, marks events wired.
- **`afterEach`** — Resets events and clears all mocks.

## Relationships

| Neighbor | Interaction |
|---|---|
| `delivery/services/index.ts` | Primary SUT: `markShipmentLost`, `shipFulfillmentOrder`, `deliverShipment`. |
| `delivery/module.ts` | `deliveryModule.subscribe()` wired in `beforeEach` so domain events reach the outbox. |
| `delivery/tests/factories.ts` | `fulfillmentOrdersOf`, `shipmentsOf` query helpers. |
| `delivery/model.ts` | `shipmentModel` imported (used in refusal-case assertions). |
| `inventory/index.ts` | `inventoryService.reserveForOrder` / `commitForOrder` in setup. |
| `inventory/tests/factories.ts` | `reservationRepository`, `stockLevelRepository` for direct stock-level and hold assertions. |
| `orders/index.ts` | `orderService.overrideStatus` in the admin-override test. |
| `orders/tests/factories.ts` | `createOrder`, `readOrder`, `timelineOf`, `toOrderItem` helpers. |
| `infrastructure/adapters/mailer.ts` | Mocked via `jest.mock`; `enqueueEmail` is the single spy used to assert mail side-effects. |
| `infrastructure/observability/audit.ts` | `registerAuditSink` captures entries to assert exactly one `admin.shipment.lost` audit line. |
| `kernel/outbox.ts` | `settleOutboxNudges` flushes queued outbox events; `outboxEventModel` counts emitted domain events. |
| `kernel/events.ts` | `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle per test. |

## Notes

- The mailer is the **only** infrastructure mock; everything else (Mongo, outbox, audit sink) runs for real. If a new side-effect is added, it will surface as an unflushed outbox nudge—call `settleOutboxNudges()` after the triggering action.
- The test asserts that the staff-written `message` reaches the mailer but the free-text `note` must **not** appear in audit metadata (`expect(JSON.stringify(audit)).not.toMatch(/box crushed|Sorry/)`). This is an intentional PII/privacy boundary.
- `deliveryModule.subscribe()` is called in `beforeEach` rather than in a one-time setup, so each test gets a clean event subscription; omitting it silently breaks outbox delivery.
- The doc-comment at the top of the file is the canonical spec for this workflow (see `docs/modules/delivery.md#lost-in-transit`); the tests are written to match it one-for-one.
- `shippedOrder` defaults `onHand` to 10; tests that need the backorder path pass a smaller value so the hold exceeds free shelf stock.
