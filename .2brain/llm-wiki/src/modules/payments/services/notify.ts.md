---
source: src/modules/payments/services/notify.ts
sha256: 9367447ed03aa1a4c46d00bd34d1a6bbca50a18e28148b219257af74efe4569e
generated_at: 2026-11-08T07:27:31.821636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/notify.ts

## Purpose

Buyer-facing email notifications for the payments module. Defines five mail functions that fire on payment lifecycle events (succeeded, refunded, refund undeliverable) or are called inline for bank-transfer specifics (instructions, expired). The core guarantee: a failed mail never undoes a money movement — every listener logs and swallows errors.

## Key elements

- **`mailPaymentReceived`** — Event listener on `payment.succeeded`. Confirms to the buyer that their card payment went through.
- **`mailRefundIssued`** — Event listener on `payment.refunded`. Notifies the buyer of a refund, but skips return-linked refunds (those get their own notice from the returns module) and refunds that moved no real money.
- **`mailRefundUndeliverable`** — Event listener on `payment.refund_failed` (final) or `payment.refund_reversed`. Asks the buyer how they'd like to receive money the bank couldn't return.
- **`mailTransferInstructions`** — Inline call when a bank-transfer payment is opened. Sends IBAN/BIC/beneficiary and deadline. No-ops if config is incomplete.
- **`mailTransferExpired`** — Inline call when a transfer payment is canceled for non-receipt. Tells the buyer the order is closed.
- **`moneyWentBack`** (internal) — Returns true if the refund has a `providerRefundRef` or was settled by hand.
- **`completesPayment`** (internal) — Sums all succeeded refunds settled up to (and including) the given one and checks equality with the full payment amount.

## Relationships

- **`@modules/payments/emails`** — Source of all five email template builders; this file only assembles the send call.
- **`@modules/payments/repository`** — Reads the `PaymentDocument` (and its refund records) by order ID before mailing.
- **`@modules/orders/index`** — Resolves the buyer's order and calls `orderService.mailBuyer` / `mailBuyerOfOrder` for locale-aware delivery.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the sole delivery mechanism; it never rejects.
- **`@infrastructure/adapters/logger`** — Errors are logged (not thrown) at every catch site.
- **`@infrastructure/adapters/config`** — Reads `supportEmail` for the undeliverable-refund mail.
- **`@domain-primitives/money`** — `toMinorUnits` for amount comparison in `completesPayment`.
- **`@kernel/events`** — `DomainEventMap` types the event payloads each listener receives.
- **`@modules/payments/domain`** — `owesBuyerAnotherWay` gates the undeliverable-refund mail.
- **`@modules/payments/config`** — Bank-transfer details (beneficiary, IBAN, BIC) for the instructions mail.
- **`@modules/payments/model`** — `PaymentDocument` and `RefundRecord` types used throughout.
- **`@modules/payments/services/index`** — Re-exports these functions to the rest of the app.

## Notes

- `mailTransferInstructions` and `mailTransferExpired` are **not** event listeners; they are called synchronously by the lifecycle code that opens/cancels the transfer payment, giving exactly-once semantics per transition. The event-based ones (`mailPaymentReceived`, `mailRefundIssued`, `mailRefundUndeliverable`) cover every settlement path (webhook, browser confirm, offline record, crash-recovery sweep) that an inline send would miss.
- In `mailRefundIssued`, a refund with a `returnId` **and** `reason !== 'cancellation'` is skipped (returns module handles it). A cancellation refund that happens to carry a `returnId` is **not** skipped, because no other module mails it.
- `completesPayment` deliberately reads from individual refund records rather than the payment's aggregate status, so a later refund cannot retroactively change what an earlier one reported.
- All `enqueueEmail` calls are `void`-ed with an eslint disable for floating promises — the function is documented as never rejecting.
