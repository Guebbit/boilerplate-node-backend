---
source: src/modules/payments/services/index.ts
sha256: 73b90dc65b3be5aa9b97f56dd0b4260b44add0ba9365cae96ad4d705cbb28b9b
generated_at: 2026-10-29T05:11:00.042685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/index.ts

## Purpose

Barrel module that aggregates every payment-flow function (intent, settlement, refunds, effects, offline, transfer, notifications, scope, view, retention, listing, stats) into a single `paymentService` object. It exists so that the rest of the codebase has exactly one import path for all payment operations, and so the module-level docblock can document the invariants (order-gate, at-most-once refunds, provider authority) in one place.

## Key elements

- **`paymentService`** — the sole service handle. A flat object whose keys are the public doors: `createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement`, `refundPayment`, `openReturnRefund`, `sendOpenedRefund`, `settleRefundByHand`, `cancelRefund`, `retryOpenRefunds`, `reconcileStalePayments`, `recordOfflinePayment`, `openTransferPayment`, view helpers (`getById`, `getForOrder`, `listForOrder`, `getRefund`, `refundOf`, `withActions`, `presentWithActions`), scope helpers (`callerScope`, `payerScope`, `buyerOrderScope`, `readsAllPayments`), retention (`detachUserId`, `findOwnPayments`, `findOwnPaymentsForExport`, `reapAbandonedPayments`), listing (`listPayments`, `listRefunds`, `listAttention`), stats (`methodMix`), mail (`mailPaymentReceived`, `mailRefundIssued`, `mailRefundUndeliverable`), config (`listPaymentMethods`), and deadline (`refundDueAt`).
- **Re-exported types** — `OfflinePaymentInput`, `OpenedReturnRefund`, `MixRow`, `PaymentMethodInfo`.
- **Re-exported error** — `RefundLeftOpenError`.
- **Re-exported config constant** — `paymentAttentionMinutes`.
- **Deliberately omitted internals** — `settlePayment`, `performRefund`, `refundForOrder`, `cancelOpenIntentForOrder` are *not* on the object; they are choreography beneath guarded doors and must not be called directly.

## Relationships

- **`src/modules/payments/config.ts`** — source of `listPaymentMethods` and `paymentAttentionMinutes`, both re-exported here.
- **`src/modules/payments/controllers/get-payment.ts`, `get-payments.ts`, `get-order-payments.ts`, `get-payment-attention.ts`, `get-refund.ts`** — controllers that import `paymentService` from this file to read or list payment records.
- **`src/modules/cart/services/checkout.ts`** — calls into `paymentService` (intent/settlement doors) during the checkout flow.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — interacts with the refund side of `paymentService` when issuing credit notes.
- **`src/modules/notifications/services/digest.ts`** — consumes payment/refund notification data surfaced by this module.
- **`scenarios/support/doubles/payments/levers.ts`** — test doubles that mirror or stub the `paymentService` surface.
- **Test files** (`shop.contract.test.ts`, `checkout-interleavings.test.ts`, `product-removal-protects-orders.test.ts`, `credit-note-catch-up.test.ts`, `issue-credit-note.test.ts`) — exercise `paymentService` through the flows above.

## Notes

- The object is intentionally flat (no namespacing by flow); discoverability relies on the module docblock and `docs/modules/payments.md`.
- The "door" pattern means the guard logic (scope, own-money rule, order gate) lives in the published functions, not in the internal choreography. Calling an internal directly would bypass those guards — hence the explicit comment forbidding it.
- Adding a new payment flow means creating a sibling file (one-file-per-flow convention) and then adding its exports here.
