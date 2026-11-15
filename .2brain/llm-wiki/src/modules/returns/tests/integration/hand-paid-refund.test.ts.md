---
source: src/modules/returns/tests/integration/hand-paid-refund.test.ts
sha256: 5194ee0aac87a849e1043dd2a10d9e7804f83f8804e0b7fade3e0e7af5921a88
generated_at: 2026-11-14T21:43:35.700099+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/hand-paid-refund.test.ts

## Purpose

Integration tests for refunds on offline (cash / transfer) payments. Because no external system can verify that physical money was returned, these tests assert the full lifecycle: a received return or buyer cancellation only **opens** the refund (status `pending`, audit row `payment.refund_owed_by_hand`), and the refund stays pending until an operator calls `settleRefundByHand`, at which point the `payment.refunded` event closes the return.

## Key elements

- **`paidInCash()`** – Fixture helper. Creates a user, two products (shirt × 2 @ 30.00, mug × 1 @ 10.00), an order, reserves real inventory, and records an offline cash payment. Returns the IDs needed by each test.
- **`paymentOf(orderId)`** – Reads the payment document for an order via the payments service (admin caller context).
- **`owedRows()`** – Filters the collected audit entries to rows with action `payment.refund_owed_by_hand`; used to assert the "owed" state.
- **`describe('a received return on a cash-paid order')`** – Verifies that receiving goods leaves the refund `pending` / `settledByHand` undefined, then that settling the refund flips the return to `closed` (asserted via `eventually` + the returns repository).
- **`describe('a refund that pays for no return')`** – Emits a raw `PAYMENT_REFUNDED` domain event **without** a `returnId`; asserts the unrelated return remains `received`.
- **`describe('a buyer cancelling the unshipped remainder…')`** – Ships one fulfillment line, then cancels the remainder; asserts the refund is `pending` with reason `cancellation` and an owed audit row exists.

## Relationships

- **`src/modules/returns/services/index.ts`** – Provides `returnService`, whose `createReturn` and `receiveReturn` are the primary subject of every test.
- **`src/modules/returns/repository.ts`** – Provides `returnRepository`, used to read the persisted return status after settlement.
- **`src/modules/returns/module.ts`** – `returnsModule` is registered in `beforeEach` so its event handlers are active.
- **`src/modules/payments/module.ts`** – `paymentsModule` is registered alongside returns for the same reason.
- **`src/modules/payments/index.ts`** – Re-exports `paymentService` and the `PAYMENT_REFUNDED` constant used in the synthetic-event test.
- **`src/modules/payments/services/index.ts`** – Also provides `paymentService` (the concrete implementation the test calls).
- **`src/kernel/events.ts`** – `emitDomainEvent` fires a synthetic `PAYMENT_REFUNDED` event; `resetDomainEvents` cleans up between tests.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures audit rows into the `audited` array; the `AuditEntry` type is used by `owedRows()`.
- **`src/modules/inventory/index.ts`** – Re-exports `inventoryService` for stock reservation in the fixture.
- **`src/modules/inventory/services/index.ts`** – Provides the concrete `inventoryService` used to reserve units.
- **`src/modules/delivery/index.ts`** – Re-exports `deliveryService` for the partial-cancellation test.
- **`src/modules/delivery/services/index.ts`** – Provides the concrete `deliveryService` used to ship a fulfillment order.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` advances the order to `delivered`; `fulfillmentOrdersOf` retrieves the fulfillment order to ship.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `forceOrderStatus` build and manipulate the order fixture.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the shirt and mug.

## Notes

- The `eventually` helper (from `@tests/eventually`) is used because the `payment.refunded` → return-closed transition is driven by an async domain-event handler, not a synchronous return from the settle call.
- The module doc-comment intentionally frames the "why": for hand-paid money, *receiving goods ≠ returning cash*; only an operator's explicit settle action closes the loop.
- The "refund that pays for no return" test deliberately emits the event without a `returnId` field to prove the return-closing handler ignores refunds not linked to a specific return.
- The `customers` counter guarantees unique emails across tests within the same suite (avoids factory collisions in a shared in-memory DB).
