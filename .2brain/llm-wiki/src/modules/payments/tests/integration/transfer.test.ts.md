---
source: src/modules/payments/tests/integration/transfer.test.ts
sha256: 6e891991ffae9aa295e364a29ad9658a5d8706d4c82ee681c510c5e39d680070
generated_at: 2026-11-08T07:39:12.720580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/transfer.test.ts

## Purpose

End-to-end integration test for the bank-transfer payment lifecycle: opening the payment row when an order is placed, presenting the instructions (IBAN, BIC, reference, deadline), recording a late or on-time settlement, handling expiry vs. customer cancellation, and matching a transfer that arrives after the order is already closed. Runs against a real MongoDB instance; only the mailer adapter is mocked.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a Jest mock so tests can assert which templates were queued without sending mail.
- **`transferOrder` (from `../factories`)** – one-call fixture that creates a user, product, order with `paymentMethod: 'bank_transfer'`, and triggers the `order.created` event, returning `{ order, payment, reference }`.
- **`templatesSent()`** – extracts the second argument (template name) from every `mockEnqueueEmail` call, in order.
- **`paymentOf` / `paymentStatusOf` / `orderStatusOf`** – read-back helpers for assertions.
- **`lapse(orderId)`** – simulates the reservation sweep: calls `orderService.expireReservationById` then `settleOutboxNudges`.
- **`describe('opening the transfer payment')`** – verifies row shape, idempotent mail (single `payments.transfer-instructions` even if the event fires twice), and that card orders / non-payable orders / pre-existing payments are left untouched.
- **`describe('the instructions on the payment')`** – asserts `presentPayment(payment).nextAction` contents (beneficiary, grouped IBAN, reference, `payBy`); BIC appears only when `NODE_BANK_TRANSFER_BIC` is set; `nextAction` vanishes after a card switch or when `NODE_BANK_TRANSFER_BENEFICIARY` is empty.
- **`describe('what the buyer may still do')`** – confirms `actions.pay` is `true` when a card provider is configured, `false` when `NODE_PAYMENT_PROVIDER` is undefined.
- **`describe('recording the money')`** – `recordOfflinePayment` returns 200 (not 201), converts the existing row to `succeeded`, and marks the order `paid`.
- **`describe('a transfer nobody sent')`** – lapse → payment `canceled` + `payments.transfer-expired` mail; customer cancel → `orders.order-canceled` mail (not the transfer template).
- **`describe('a transfer that lands after its order was canceled')`** – late transfer is still matched by `transferReference`, recorded onto the closed row, refund is created in a non-`succeeded` state (operator pays by hand), and an audit entry is written.

## Relationships

- **`@modules/payments/services/index.ts`** (`paymentService`) – the SUT; calls `openTransferPayment`, `recordOfflinePayment`, `getForOrder`, `listPayments`, `createIntent`.
- **`@modules/payments/presenter.ts`** (`presentPayment`) – transforms the stored payment into the `nextAction` shape asserted in the instructions block.
- **`@modules/payments/repository.ts`** (`paymentRepository`) – used by `paymentOf` helper to read back the row.
- **`@modules/payments/model.ts`** (`paymentModel`) – `countDocuments` to verify no duplicate rows.
- **`@modules/payments/module.ts`** – registered via `registerCheckoutModules` in `beforeEach`.
- **`@modules/orders/index.ts`** (`orderService`) – `expireReservationById` (lapse path) and `cancelOnRequestById` (customer-cancel path).
- **`@kernel/events.ts`** (`resetDomainEvents`) – cleared in `afterEach` to isolate event-bus state between tests.
- **`@kernel/outbox.ts`** (`settleOutboxNudges`) – flushes deferred outbox work (e.g. cancellation mails) inside `lapse` and the cancel test.
- **`@infrastructure/adapters/mailer.ts`** – the sole mocked dependency; `enqueueEmail` replaced by a Jest fn.
- **`@infrastructure/observability/audit.ts`** (`registerAuditSink`) – captures audit entries to assert the late-transfer refund row.
- **`@modules/users/tests/factories.ts`**, **`@modules/products/tests/factories.ts`**, **`@modules/orders/tests/factories.ts`** – fixture helpers for creating test users, products, and orders.
- **`@modules/payments/tests/factories.ts`** – source of the `transferOrder` composite fixture.

## Notes

- **Only the mailer is fake.** Everything else (Mongo, order service, payment service, outbox, event bus) runs for real. This makes the test slow but faithful to production wiring.
- **IBAN formatting:** the presenter groups digits into blocks of four (e.g. `IT60 X054 2811 1010 0000 0123 456`); the test hard-codes this format rather than deriving it.
- **BIC is opt-in:** absent unless `NODE_BANK_TRANSFER_BIC` is set in the environment. Tests use `withEnvironmentOverrides` to toggle it.
- **200 vs 201 on record:** recording money onto an *existing* payment row is a conversion (200), not a creation (201). The test asserts this explicitly.
- **Late-transfer refund stays open:** `refunds[0].status` is asserted to be *not* `'succeeded'` because the operator must pay out by hand; the system only records the debt and the audit trail.
- **Customer cancel ≠ lapse:** both end with payment `canceled`, but they emit different mail templates (`orders.order-canceled` vs `payments.transfer-expired`). The test guards against conflating them.
