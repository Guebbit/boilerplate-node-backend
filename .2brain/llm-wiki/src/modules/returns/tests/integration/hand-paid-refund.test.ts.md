---
source: src/modules/returns/tests/integration/hand-paid-refund.test.ts
sha256: d9b8aca63a17a371ae90bcfcb93d4cafc8f3e5ab022d5a341995dc8d5df974a6
generated_at: 2026-11-08T08:08:19.078320+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/hand-paid-refund.test.ts

## Purpose

Integration test verifying the lifecycle of refunds on offline (cash / manual-transfer) payments. Because no external gateway can confirm the money was returned, these tests assert that a received return or a buyer cancellation only *opens* a refund in `pending` state, and that only an explicit operator call to `settleRefundByHand` transitions it to settled and closes the return.

## Key elements

- **`paidInCash`** (local helper) — Creates a user, two products, an order (2 shirts + 1 mug), reserves inventory, and records an offline cash payment. Returns the fixture objects needed by both test suites.
- **`paymentOf`** (local helper) — Reads a payment record for a given order ID via `paymentService.getForOrder` as admin.
- **`owedRows`** (local helper) — Filters the accumulated `AuditEntry[]` for entries with action `payment.refund_owed_by_hand`.
- **`describe('a received return on a cash-paid order')`** — Asserts that `receiveReturn` leaves the refund `pending` with `settledByHand` undefined, writes exactly one owed audit row, and that `settleRefundByHand` flips the return to `closed` (via the `payment.refunded` event) without adding a second owed row.
- **`describe('a buyer cancelling the unshipped remainder…')`** — Ships one fulfillment line, then asserts that a cancellation-type `createReturn` opens a single `pending` refund with reason `cancellation` and one owed audit row.

## Relationships

- **`src/modules/returns/services/index.ts`** — Calls `returnService.createReturn` and `returnService.receiveReturn` to drive the return lifecycle.
- **`src/modules/returns/repository.ts`** — Reads the stored return via `returnRepository.findById` inside the `eventually` assertion to confirm the event-driven close.
- **`src/modules/returns/module.ts`** — Imported and registered with the checkout module registry in `beforeEach`.
- **`src/modules/payments/services/index.ts`** — Calls `paymentService.recordOfflinePayment`, `paymentService.getForOrder`, and `paymentService.settleRefundByHand`.
- **`src/modules/payments/module.ts`** — Registered alongside `returnsModule` so both modules' event handlers are active.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures entries into the local `audited` array; the tests assert on `owedRows()` derived from it.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears the in-memory event bus between tests.
- **`src/modules/delivery/index.ts`** / **`services/index.ts`** — `deliveryService.shipFulfillmentOrder` used to partially ship the order in the cancellation test.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` (advances order to `delivered`) and `fulfillmentOrdersOf` (retrieves fulfillment orders).
- **`src/modules/inventory/index.ts`** / **`services/index.ts`** — `inventoryService.reserveForOrder` holds real stock units.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem` for order setup.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for fixture items.

## Notes

- The "owed" state is verified exclusively through the **audit sink**, not a direct DB query. If the `payment.refund_owed_by_hand` audit action is removed or renamed, these assertions silently pass with zero rows.
- The return-close assertion in the first suite uses the `eventually` retry helper because the close is driven by an asynchronous `payment.refunded` event, not a synchronous return from `settleRefundByHand`.
- The `customers` module-level counter ensures each call to `paidInCash` produces a unique email; this matters if the users collection enforces uniqueness across tests within the same process.
- The test file is intentionally scoped to the *hand-paid* path; automated (card / gateway) refunds follow a different code path and are covered elsewhere.
