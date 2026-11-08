---
source: src/modules/returns/tests/integration/lost-parcel.test.ts
sha256: ea17ef2474b06a4c73a4434f28c6724928332b4183ef69ef336214c309215f62
generated_at: 2026-11-08T08:08:37.777111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/lost-parcel.test.ts

## Purpose

Integration test covering the buyer-remedy surface when a shipped parcel is marked lost in transit. It verifies three invariants: (1) the buyer can still cancel the units the lost parcel carried (full refund including delivery, stock returned), (2) goods that never arrived cannot be returned, and (3) a replacement shipment is counted once—never double the original quantity. Runs against a real database with the `fake` payment provider.

## Key elements

- **`shippedParcel()`** – Builds the full pre-condition: user, two products (shirt ×2, mug ×1), order with payment (75.00), inventory reservation, `processing` status, and a single shipped parcel. Returns all IDs and entities needed by tests.
- **`lose(parcel)`** – Calls `deliveryService.markShipmentLost` as admin; the single action that transitions the parcel to lost.
- **`cancelRemainder(parcel)`** – Calls `returnService.createReturn` with `kind: 'cancellation'` and `reason: 'withdrawal'` as the customer.
- **`refundsOf(orderId)`** – Reads the payment record and returns the list of refund entries (reason + amount).
- **`describe('cancelling what a lost parcel carried')`** – Asserts the 75.00 refund, stock counters reset, and that the parcel's top-up holds shelf units until the buyer acts.
- **`describe('settling an order whose every parcel was lost and refunded')`** – Four tests:
  - Order ends `canceled` / `refunded`, no clocks, timeline shows exactly one `shipped` row and one system `canceled` row (`cause: 'lost'`), reservation released.
  - **Idempotency under outbox relay retry** – Force-resets the `order.canceled` outbox event to `pending`, re-nudges, and asserts analytics (`order_canceled`) and audit (`order.canceled`) each fire exactly once.
  - A parcel found later returns `DELIVERY_NOT_DELIVERABLE`; the shipment view hides the `deliver` action.
  - If a *second* parcel (replacement) arrives and is delivered, the order stays `delivered` with `withdrawUntil` set—loss of one parcel does not sink the whole order.
- **`describe('returning goods after a loss')`** – Confirms `shippedQuantities` returns empty after loss (nothing to return), and that a replacement shipment reports shipped quantity equal to the original purchase, not 2×.

## Relationships

| Neighbor | Interaction |
|---|---|
| `kernel/events.ts` | `resetDomainEvents()` in `afterEach` clears the in-memory event bus between tests. |
| `kernel/outbox.ts` | `nudgeOutbox`, `outboxEventModel`, `settleOutboxNudges` drive the relay-retry idempotency test. |
| `modules/delivery/index.ts` / `services/index.ts` | `deliveryService` is the primary actor for shipping, `markShipmentLost`, `deliverShipment`, `getShipment`, `shippedQuantities`. |
| `modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf`, `shipmentsOf` read delivery state. |
| `modules/inventory/index.ts` / `services/index.ts` | `inventoryService.reserveForOrder` sets up real reservations. |
| `modules/inventory/repository.ts` | `reservationRepository.findByOrderId` asserts reservation is released. |
| `modules/inventory/tests/factories.ts` | Exposes `reservationRepository` for the assertion above. |
| `modules/orders/tests/factories.ts` | `createOrder`, `forceOrderStatus`, `readOrder`, `timelineOf`, `toOrderItem` build and inspect order state. |
| `modules/payments/index.ts` / `module.ts` / `services/index.ts` | `paymentsModule` registered via `registerCheckoutModules`; `paymentService` used for intent, confirmation, and refund reads. |
| `infrastructure/observability/audit.ts` | Replaced (not spied) with `auditPortMock`; `emitAuditEvent` observed via `observePort`. |
| `infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` stubbed with `jest.fn`; calls filtered in the idempotency test. |

## Notes

- The audit and analytics ports are **replaced** via `jest.mock` (see `tests/support/ports.ts`), not merely spied—`observePort` wraps the mock to record calls.
- The outbox relay-retry test manually writes `status: 'pending'` back onto the `order.canceled` event and resets `nextAttemptAt` to epoch, then calls `nudgeOutbox()` a second time. This is the only place in this file that directly mutates outbox rows.
- `customers` is a module-level counter used solely to generate unique emails; it is not reset between tests.
- The test file is truncated in the source (the last `describe` block is incomplete), so the "counts the replacement once" test may have additional assertions not visible here.
