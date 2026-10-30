---
source: src/modules/returns/tests/integration/hand-paid-refund.test.ts
sha256: 2ed501399dcba2e539b5b4ffa24a3c9e1c7edea1a7a85dd8e8728549f7641ce1
generated_at: 2026-10-29T05:46:58.710885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/hand-paid-refund.test.ts

## Purpose

Integration test verifying the two-step refund flow for hand-paid (cash/offline) orders: receiving a returned parcel or a buyer's withdrawal only **opens** a refund (status `pending`, audit row `payment.refund_owed_by_hand`), and a separate operator call to `settleRefundByHand` is what actually settles it and closes the return. This file exists to pin down that the system never auto-closes a hand refund and that the owed-then-settled audit trail is correct.

## Key elements

- **`paidInCash()`** — fixture helper: creates a user, two products (shirt ¥30, mug ¥10), an order, reserves real inventory via `inventoryService.reserveForOrder`, and records an offline cash payment via `paymentService.recordOfflinePayment`. Returns the handles the tests need.
- **`paymentOf(orderId)`** — reads the payment record as admin; throws if absent.
- **`owedRows()`** — filters the accumulated audit sink for `payment.refund_owed_by_hand` entries; the primary assertion target for the "owed" trail.
- **`describe('a received return on a cash-paid order')`** — asserts that `receiveReturn` leaves the refund `pending` (not settled), then `settleRefundByHand` transitions it and asynchronously closes the return via the `payment.refunded` domain event (verified with `eventually`).
- **`describe('a buyer cancelling the unshipped remainder…')`** — ships part of the order, then creates a cancellation return; asserts the refund is opened as `pending` with reason `cancellation` and the owed audit row is written, without any settlement.
- **`beforeEach` / `afterEach`** — registers `paymentsModule` + `returnsModule`, resets the audit sink and domain events, restores mocks.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — imports `registerAuditSink` and the `AuditEntry` type; the test pushes all audit entries into a local array and asserts on `payment.refund_owed_by_hand` rows.
- **`src/kernel/events.ts`** — imports `resetDomainEvents` for `afterEach` cleanup.
- **`src/modules/payments/module.ts` / `services/index.ts`** — imports `paymentsModule` (registered in `beforeEach`) and `paymentService` (`recordOfflinePayment`, `getForOrder`, `settleRefundByHand`).
- **`src/modules/returns/module.ts` / `services/index.ts`** — imports `returnsModule` (registered) and `returnService` (`createReturn`, `receiveReturn`).
- **`src/modules/returns/repository.ts`** — imports `returnRepository.findById` to verify the final `closed` status after settlement.
- **`src/modules/delivery/index.ts` / `tests/factories.ts`** — imports `deliveryService.shipFulfillmentOrder` and the helpers `carryOrderTo`, `fulfillmentOrdersOf`.
- **`src/modules/inventory/index.ts`** — imports `inventoryService.reserveForOrder` to lock stock before the payment step.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder`, `forceOrderStatus`, `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct`.

## Notes

- Settlement closure of the return is **asynchronous** (driven by the `payment.refunded` domain event); the test uses `eventually` polling rather than a synchronous assert on `returnRepository`.
- The module-level doc comment states the domain rule explicitly: nobody in the system can verify hand money went back, so the refund is deliberately two-step.
- `paidInCash` uses a module-level `customers` counter to generate unique emails, so tests are order-independent in their identities but share the counter within a single run.
- The cancellation test ships only the shirt (2 units) and leaves the mug unshipped, so the cancellation return targets the unshipped remainder via `fulfillmentOrderId`.
