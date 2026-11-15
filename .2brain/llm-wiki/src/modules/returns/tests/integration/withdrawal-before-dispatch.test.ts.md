---
source: src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts
sha256: c3b185a5cd042e609610747f894ab19a57623686f0ebf859b276888e14379532
generated_at: 2026-11-14T21:48:27.322686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts

## Purpose

Integration test for the "withdrawal before dispatch" flow on a fully-paid order. It pins the cross-module contract: a single `payment.refunded` event drives both the refund and the credit note (so money is never announced twice), the return is written **closed at birth**, exactly one acknowledgement mail goes out from `returns`, and the entire operation is atomic — either the record, the cancel, and the outbox rows all land, or none do.

## Key elements

- **`paidOrder()`** (local helper) — builds a user, two products (Shirt 30.00, Mug 10.00), an order with one of each, reserves inventory, charges by card via `payByCard`, and calls `settleOutboxNudges()` so the settlement rows are visible before the test proceeds.
- **`withdrawalRows(orderId)`** (local helper) — counts outbox documents for the order whose name is one of `order.canceled`, `return.requested`, `return.closed`; used in failure tests to assert nothing was written.
- **`describe("a withdrawal before dispatch on a paid order")`** — four happy-path tests:
  - *single refund, credit note, closed return* — asserts order status → `canceled`, payment `displayStatus` → `refunded` at 40.00, return record status `closed` with `refundAmount: '40.00'` and empty `lines`, exactly one `PAYMENT_REFUNDED` payload with **no** `returnId`, and exactly one credit note.
  - *14-day refund stamp* — asserts `storedRefundStamps` carries `dueRule: 'withdrawal'` and `dueBy` computed by `withdrawalRefundDueBy(requestedAt, shopTimezone())`.
  - *one returns mail* — filters `enqueueEmail` calls for template `returns.notice`; expects exactly one, subject "We received your withdrawal", with `postage` and `address` both `undefined`.
  - *one refund-issued mail, no cancel notice* — expects one `payments.refund-issued`, one `returns.notice`, and **zero** `orders.order-canceled` mails.
- **`describe("a withdrawal before dispatch that dies half way")`** — two failure/atomicity tests:
  - *`returnRepository.create` rejects* — order stays `paid`, no return record, zero outbox rows.
  - *`outboxEventModel.create` rejects* — same assertions; the cancel rolled back with the record.
- **Mocks / spies** — `enqueueEmail` is module-mocked (cleared in `beforeEach`); `returnRepository.create` and `outboxEventModel.create` are spied per-test in the failure block.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | `onDomainEvent` captures the `PAYMENT_REFUNDED` payload; `resetDomainEvents` clears listeners in `afterEach`. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` drains the async relay after each state change; `outboxEventModel` is used to count rows and is spied in the failure test. |
| `src/modules/payments/index.ts` | Imported for `paymentService` (read to assert final payment state) and `PAYMENT_REFUNDED` (the event constant listened to). |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules` so the payment listener chain is wired. |
| `src/modules/payments/services/index.ts` | Graph neighbor reached through `src/modules/payments/index.ts`; the `paymentService` export ultimately resolves to the services layer. |
| `src/modules/payments/tests/factories.ts` | `payByCard` simulates the card charge; `storedRefundStamps` reads the dated stamp rows. |
| `src/modules/invoicing/index.ts` | Imported for `invoicingService` (used to query credit notes for the order). |
| `src/modules/invoicing/module.ts` | Registered so the credit-note listener fires in the relay pass. |
| `src/modules/invoicing/services/index.ts` | Graph neighbor reached through `src/modules/invoicing/index.ts`; the `invoicingService` export ultimately resolves to the services layer. |
| `src/modules/inventory/index.ts` | Imported for `inventoryService` (used to reserve stock in the fixture). |
| `src/modules/inventory/services/index.ts` | Graph neighbor reached through `src/modules/inventory/index.ts`; the `inventoryService` export ultimately resolves to the services layer. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `readOrder`, `toOrderItem` build and inspect the order fixture. |
| `src/modules/orders/index.ts` | Imported for `withdrawalRefundDueBy` (pure function computing the expected 14-day stamp); the function is defined in `src/modules/orders/domain/withdrawal.ts`. |
| `src/modules/orders/domain/withdrawal.ts` | Source of `withdrawalRefundDueBy`, re-exported through the orders index. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is the sole mail seam; the whole module is replaced with a jest mock to assert template, subject, and payload. |

## Notes

- **Multiple `settleOutboxNudges()` calls are intentional.** The relay publishes settlement rows *after* the HTTP response returns, and each listener (refund, credit note, mail) runs in its own pass. The tests call it 2–3 times to let every pass complete.
- **`eventually()` is required for the `payments.refund-issued` mail.** `announceRefund` starts with `void`, so the mail is enqueued *after* `settleOutboxNudges` resolves; a plain assertion would race.
- **The refund event carries no `returnId`.** This is the core "never announce the same money twice" invariant: the refund belongs to the order's cancel, and the already-closed return is not re-closed by it.
- **Failure tests assert triple-absence** (order unchanged, no return record, zero outbox rows) to prove the record and cancel are in the same transaction.
- The `beforeEach` registers all three modules (`paymentsModule`, `invoicingModule`, `returnsModule`) via `registerCheckoutModules`; omitting any of them would silently skip a listener.
