---
source: src/modules/returns/tests/integration/remedy.test.ts
sha256: 8e283ff4efb54aa3c932fd1a7bb190c7846a9aedb9d8293d5a6cf6c9528efe10
generated_at: 2026-10-29T05:48:27.006853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/remedy.test.ts

## Purpose

Integration tests for the remedy ladder (EU Directive 2019/771 Art. 13) on returned defective/wrong items. Verifies that a **replacement** reopens the original order's fulfillment units and re-ships them through the normal delivery pipeline without moving money, and that a **repair** extends the guarantee by 12 months (once per order) while leaving the order in `delivered` state. Runs against a real database with the `fake` payment provider.

## Key elements

- **`approvedReturn(reason, onHand, preferredRemedy?)`** — Full scenario fixture: creates a user, product, order (2 × 30.00), reserves inventory, confirms a card payment via `paymentService`, carries the order to `delivered`, creates an approved return, and settles outbox nudges. Returns `{ user, shirt, orderId, id }`.
- **`broken(opened)`** — Marks the returned line as non-restockable (`restock: 0`), representing a defective item.
- **`statusOf(orderId)` / `statusOfReturn(id)`** — Small readers for order status and return status from the database.
- **`refundedOf(orderId)`** — Reads the cumulative refund amount from `paymentService.getForOrder`.
- **`describe('asking for a remedy')`** — Validates that a buyer may attach `preferredRemedy` on a defect return but the field is rejected (`RETURN_REMEDY_INVALID`) on a withdrawal.
- **`describe('receiving with a replacement')`** — Covers: order reopens at `processing` with 0 refund; ships via `deliveryService.shipFulfillmentOrder`; inventory reserves the replacement; backorder creates a second fulfillment order on hold when stock is insufficient; returns 409 (`DELIVERY_NOT_REOPENABLE`) if fewer units were actually shipped.
- **`describe('receiving with a repair')`** — Covers: guarantee extends by exactly 12 months; a second repair does not extend again; order stays `delivered` with 0 refund.

## Relationships

- **`src/modules/returns/services/index.ts`** — Primary SUT: `returnService.createReturn`, `.approveReturn`, `.receiveReturn` are the actions under test.
- **`src/modules/returns/module.ts`** — Registered via `registerCheckoutModules` so the return service is wired in.
- **`src/modules/returns/repository.ts`** — `returnRepository.findById` used to assert stored state (status, `preferredRemedy`).
- **`src/modules/delivery/index.ts` / `services`** — `deliveryService.shipFulfillmentOrder` exercises the replacement shipping path.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo`, `deliverEverything`, `fulfillmentOrdersOf`, `setFirstLineShipped` drive the delivery lifecycle in fixtures and assertions.
- **`src/modules/payments/index.ts` / `module.ts` / `services`** — `paymentService.createIntent` / `.confirmPayment` set up the paid order; `paymentsModule` is registered; `refundedOf` asserts no money moved.
- **`src/modules/inventory/index.ts` / `services`** — `inventoryService.reserveForOrder` allocates stock for the original order.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build and inspect the order.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf` manage shelf stock assertions.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes queued side-effects (e.g., status transitions) between steps.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` prevents event-bus leakage between tests.

## Notes

- The test suite relies on a **real database** (`setupTestDb`) and the **fake** payment provider; no network calls are made.
- `customers` is a module-level counter ensuring unique e-mails across test runs within a single file.
- The "owes what the shelf cannot cover" case depends on `onHand: 2` (exactly the ordered quantity), so reserving 2 leaves 0 for the replacement, forcing a backorder fulfillment order.
- The 409 guard (`DELIVERY_NOT_REOPENABLE`) is triggered by `setFirstLineShipped(origin, 1)`, which simulates that only 1 of the 2 units was actually shipped—replacement is then impossible.
- Repair extension is asserted as **exactly +1 year** (same month/day, year + 1) and **idempotent** on a second repair within the same order.
