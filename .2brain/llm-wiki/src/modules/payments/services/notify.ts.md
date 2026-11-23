---
source: src/modules/payments/services/notify.ts
source_sha256: 4548feb8ae9b81cac998cdc1e582d853954cf7ef13bf5a8adee49ace6dc45fc4
context_sha256: 309aee53107ed53ef4fbb1e3a69987a0b5b1e18c066a7bde114ee219a428172d
generated_at: 2026-11-22T06:51:36.334025+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/notify.ts

## Purpose
Holds the five buyer-facing emails the payments module sends. Three are event listeners (`payment.succeeded`, `payment.refunded`, and the undeliverable-refund pair); two are called directly by the bank-transfer flow (instructions when the transfer payment opens, "no transfer received" when its order is canceled). Using listeners covers every path that settles money (webhook, browser confirm, offline record, crash-recovery sweep). A failed mail never undoes money that landed.

## Key elements
- `mailPaymentReceived({ orderId })` — listener for `payment.succeeded`. Mails the buyer via `orderService.mailBuyerOfOrder` using `paymentReceivedEmail`.
- `mailRefundIssued({ orderId, refundId })` — listener for `payment.refunded`. Loads the payment and order, finds the refund, and mails `refundIssuedEmail`. It skips the mail when:
  - the payment, order or refund is missing;
  - the refund has a `returnId` and its reason is not `'cancellation'`, because `returns` sends its own closing notice;
  - no money went back (`moneyWentBack`).
- `mailRefundUndeliverable(payload)` — listener for `payment.refund_failed` and `payment.refund_reversed`. Sends `refundUndeliverableEmail`, which asks the buyer how they want the money and includes the support email. It mails only if `owesBuyerAnotherWay(refund)` is true.
- `mailTransferInstructions(order, payment)` — sends the bank details (beneficiary, IBAN, optional BIC, reference) and the `payBy` date. It returns silently if beneficiary, IBAN, `transferReference` or `payBy` is missing. Errors are logged and swallowed.
- `mailTransferExpired(orderId)` — sends `transferExpiredEmail` after the transfer payment is canceled.
- Internal helpers:
  - `moneyWentBack` — true if the refund has a `providerRefundRef` or `settledByHand === true`.
  - `completesPayment` — true if succeeded refunds settled up to and including this one sum to the full payment amount (compared in minor units). It reads the refund records, not the payment's current status.

## Relationships
- `orders` (`orderService`): used to fetch the order (`getById`) and to resolve the buyer's locale and name before building the mail (`mailBuyer`, `mailBuyerOfOrder`).
- `../emails`: builds each template, subject and data.
- `../repository`: its `paymentRepository` loads the payment and its refunds.
- `../domain`: `owesBuyerAnotherWay` decides whether an undeliverable-refund mail is sent.
- `../config`: bank-transfer beneficiary, BIC and friendly IBAN.
- `@infrastructure/adapters/config` (`supportEmail`): support address in the undeliverable-refund mail.
- `@infrastructure/adapters/mailer` (`enqueueEmail`): queues each mail.
- `@infrastructure/adapters/logger`: logs failures.
- `@kernel/events` (`DomainEventMap`): payload types for the listeners.
- `@domain-primitives/money` (`toMinorUnits`): used in `completesPayment`.
- `../model`: `PaymentDocument` and `RefundRecord` types.
- `RefundStatus` is imported from `@types`.

## Notes
- Each send is a fire-and-forget `void enqueueEmail(...)`. The eslint-disable comments state that `enqueueEmail` never rejects.
- `mailRefundIssued`, `mailRefundUndeliverable` and `mailTransferInstructions` catch and log errors. `mailPaymentReceived` and `mailTransferExpired` have no catch of their own and rely on `orderService.mailBuyerOfOrder`.
- `mailTransferInstructions` is called by the code that opened the transfer payment, so a redelivered `order.created` mails once. `mailTransferExpired` is likewise called by the code that moves the payment to `canceled`.
- The refund-notice rules are asymmetric. A `return` refund with a `returnId` is skipped, but a cancellation refund with a `returnId` (a remainder cancel) is mailed here.
