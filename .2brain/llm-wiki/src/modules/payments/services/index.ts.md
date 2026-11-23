---
source: src/modules/payments/services/index.ts
source_sha256: ebedceb8711dd4ded7982cbea3851d0488c46c912972b495a39b362a7920a18c
context_sha256: 74ab844cb9a943a5a8e96174c5e6ca78e1e418cd5e1acb234f4871a83d014784
generated_at: 2026-11-22T06:50:43.957296+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/index.ts

## Purpose
Barrel and public entry point for the payments module's services. It collects the per-flow service files (intent, settlement, refunds, etc.) into a single `paymentService` object and re-exports a few errors, types and a config value. The module doc describes the design: one file per flow, an order's move to `paid` as the gate, at-most-once refunds, and the provider's webhook as the authority.

## Key elements
- **`paymentService`**: the module's one service handle. It bundles these groups:
  - Starting and settling payments: `createIntent`, `confirmPayment`, `syncPayment`, `receiveWebhook`, `applyWebhookSettlement`.
  - Reads and views: `getById`, `orderIdOf`, `getForOrder`, `listForOrder`, `getRefund`, `refundOf`, `withActions`, `presentWithActions`, `listPayments`, `listRefunds`, `listAttention`, `methodMix`.
  - Refunds: `refundPayment`, `openReturnRefund`, `returnRefundState`, `sendOpenedRefund`, `settleRefundByHand`, `cancelRefund`, `syncRefunds`, `settledRefundPayloads`, `refundLegalDue`.
  - Disputes: `disputeStanding`, `keptInOtherCurrencyOn`.
  - Background jobs: `retryOpenRefunds`, `reconcileStalePayments`.
  - Offline and transfer payments: `recordOfflinePayment`, `openTransferPayment`.
  - Retention and privacy: `detachUserId`, `findOwnPayments`, `findOwnPaymentsForExport`, `reapAbandonedPayments`.
  - Notifications: `mailPaymentReceived`, `mailRefundIssued`, `mailRefundUndeliverable`.
  - Access scoping: `callerScope`, `payerScope`, `buyerOrderScope`, `readsAllPayments`.
  - Config: `listPaymentMethods`.
- **Re-exports**: `RefundLeftOpenError`, `WebhookProviderUnknownError`, the types `OfflinePaymentInput`, `OpenedReturnRefund`, `MixRow` and `PaymentMethodInfo`, and `paymentAttentionMinutes` from `../config`.

## Relationships
- Imports from the sibling files `./intent`, `./settlement`, `./refunds`, `./return-refunds`, `./external-refunds`, `./effects`, `./offline`, `./transfer`, `./notify`, `./scope`, `./view`, `./retention`, `./list`, `./stats`, `./deadline`, `./disputes` and `./errors`. It contains no logic of its own.
- `../config` (`src/modules/payments/config.ts`) supplies `listPaymentMethods`, `PaymentMethodInfo` and `paymentAttentionMinutes`.
- The listed payments controllers (`get-payment`, `get-payments`, `get-order-payments`, `get-refund`, `get-refunds`, `get-payment-attention`) sit next to this barrel in the graph. They are plausibly consumers of `paymentService`, but the file itself doesn't show this.
- Other modules and tests in the neighbor list (cart `checkout.ts`, invoicing `issue-credit-note.ts`, and the cart, invoicing and account tests) are related through the graph. The file doesn't say which members of `paymentService` they use.

## Notes
- Some functions are deliberately **not** published: `settlePayment`, `applyWebhookDelivery` and `performRefund`. They are the choreography beneath the guarded entry points, and a caller using them directly would skip the scope, own-money and order-gate guards.
- `refundForOrder` and `cancelOpenIntentForOrder` are also kept off the object, because only the `order.canceled` listener uses them.
- The module doc says the `order.canceled` listener, `refundPayment` and `openReturnRefund` are each made at-most-once by `addRefund`'s conditional write on `amountRefunded`.
- The module doc says money moves only if the order is `paid`. A slipped-away order is refunded immediately.
- The service object is named `paymentService` after the record it serves, like `paymentRepository`.
