---
source: src/modules/payments/services/notify.ts
sha256: 6f0ffbd00f12998ff437bd32d3f865869e7e469eeda4898eb1b7ab8c594e5856
generated_at: 2026-10-29T05:11:59.378975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/notify.ts

## Purpose

Sends all buyer-facing emails for the payment lifecycle: payment received, refund issued, refund undeliverable, bank-transfer instructions, and transfer-expired cancellation. Two exports are registered as event listeners (`payment.succeeded`, `payment.refunded`) so they fire on every settlement path (webhook, browser confirm, offline record, crash-recovery sweep); the other two are called directly by the code that opens or cancels a transfer payment. A failed email never rolls back a financial action — all failures are logged and swallowed.

## Key elements

- **`mailPaymentReceived`** — event listener on `payment.succeeded`; tells the buyer their card payment went through.
- **`mailRefundIssued`** — event listener on `payment.refunded`; tells the buyer their money went back. Skips return-linked refunds (those get a `returns` closing notice) and refunds that moved no real money.
- **`mailRefundUndeliverable`** — handles both `payment.refund_failed` (final) and `payment.refund_reversed`; asks the buyer how to receive a refund the bank could not return. Skips if the record no longer owes the buyer another way.
- **`mailTransferInstructions`** — called by the transfer-payment opener; emails IBAN/BIC, beneficiary, reference, and deadline.
- **`mailTransferExpired`** — called by the transfer-payment canceller; notifies the buyer the transfer never arrived and the order is cancelled.
- **`moneyWentBack`** (private) — true if a settled refund has a `providerRefundRef` or `settledByHand === true`.
- **`completesPayment`** (private) — sums all succeeded refunds settled up to (and including) the target refund and compares to the payment total, using `toMinorUnits`.

## Relationships

- **`@infrastructure/adapters/mailer`** — every send goes through `enqueueEmail`; this file never rejects on mail failure.
- **`@infrastructure/adapters/logger`** — all `.catch` handlers log via `logger.error` before swallowing.
- **`@kernel/events`** — consumes `DomainEventMap` payload types for the three event-driven exports.
- **`@modules/orders`** (`orderService`) — resolves the order, its email, locale, and buyer name for every mail; also the channel for `mailBuyerOfOrder` / `mailBuyer`.
- **`@modules/payments/emails`** — imports the five template builders (`paymentReceivedEmail`, `refundIssuedEmail`, `refundUndeliverableEmail`, `transferInstructionsEmail`, `transferInstructionsEmail`).
- **`@modules/payments/config`** — reads `bankTransferBeneficiary`, `bankTransferIbanFriendly`, `bankTransferBic` for the instructions mail.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` in both refund handlers.
- **`@modules/payments/model`** — `PaymentDocument` and `RefundRecord` types.
- **`@modules/payments/domain`** — `owesBuyerAnotherWay` guard in `mailRefundUndeliverable`.
- **`@domain-primitives/money`** — `toMinorUnits` for currency-accurate comparison in `completesPayment`.
- **`@modules/payments/services/intent`** — the caller side: the service that opens a transfer payment calls `mailTransferInstructions`; the canceller calls `mailTransferExpired`.
- **`@modules/payments/services`** (`index.ts`) — re-exports these functions for external consumers.

## Notes

- **Idempotency is the caller's job.** `mailTransferInstructions` and `mailTransferExpired` are called once by the code that transitions the payment (open / cancel), so a redelivered event does not double-mail. The two event-listener emails rely on the event bus delivering each event once.
- **`mailRefundIssued` is intentionally narrow.** A refund with a `returnId` *and* reason ≠ `cancellation` is skipped (the `returns` module owns that notice). A remainder-cancellation refund *does* carry a `returnId` but has no closing notice, so it is mailed here.
- **`completesPayment` reads records, not payment status.** This keeps the "is this the final refund?" answer stable even if a later refund arrives after the mail is composed.
- **`enqueueEmail` never rejects.** Every `void enqueueEmail(...)` call is fire-and-forget with an eslint suppression; the surrounding `.catch` on the `orderService` chain is the only error surface.
- **Stryker mutants are disabled** around the `logger.error` calls in `.catch` blocks to prevent mutation testing from flagging the intentional log-only handlers.
