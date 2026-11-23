---
source: src/modules/payments/emails.ts
source_sha256: b9150fb5bb096ae1555d199d0ccee2b940916ee5d0b3f7fc90ef719c33b417e3
context_sha256: 0ddc47d1be7d5e607e048c25bcb02430a07e1e8b345f0da547d446136f3f531b
generated_at: 2026-11-22T06:44:56.936279+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/emails.ts

## Purpose
Builds the content for the five transactional emails the payments module sends. Each builder takes the recipient's locale as an argument and returns an `EmailContent` whose `data` holds fully resolved strings. The queued template only interpolates them. This follows the same rule as `@modules/account/emails`.

## Key elements
- `paymentReceivedEmail(locale, name, order, orderId)` – sent when `settlePayment` commits the stock. Lists each item (title, quantity, price), the total, and a link to the order page. Template: `payments.payment-received`.
- `refundIssuedEmail(locale, name, orderRef, refund, full)` – sent when a refund settles outside a return (after a cancel, or an operator's goodwill refund). It uses a "full" or "partial" detail string depending on `full`. Template: `payments.refund-issued`.
- `refundUndeliverableEmail(locale, name, orderRef, refund, shopEmail, orderId)` – sent when a refund could not reach the card. It asks the buyer how they want the money, shows the shop email as text, and links to the order. It never names a reason. Template: `payments.refund-undeliverable`.
- `TransferInstructions` – interface with `beneficiary`, `iban` (pre-grouped in blocks of four), optional `bic`, and the RF creditor `reference`.
- `transferInstructionsEmail(locale, name, order, instructions, payBy, orderId)` – bank-transfer instructions, sent when the transfer payment opens. Includes the deadline, total, and order link. Template: `payments.transfer-instructions`.
- `transferExpiredEmail(locale, order)` – sent when the sweep cancels a `bank_transfer` order whose deadline passed with no money. It takes no name, so the greeting is a fixed string. Template: `payments.transfer-expired`.

## Relationships
- `src/infrastructure/adapters/mailer.ts` supplies the `EmailContent` type that every builder returns.
- `src/infrastructure/i18n/index.ts` supplies `translator(locale)`, which resolves all the copy.
- `src/domain-primitives/money.ts` supplies `formatMoney`, used for amounts, line prices and totals.
- `src/modules/orders/index.ts` supplies `orderFrontendLink`, `orderTotal` and the `OrderLines` type.
- `src/modules/shop/index.ts` supplies `shopTimezone()`, used for the transfer deadline.
- `src/modules/payments/services/notify.ts` and `src/modules/payments/index.ts` are the likely consumers, and `src/modules/payments/tests/unit/emails.test.ts` covers these builders. The file's content does not show how they call it.

## Notes
- The refund builders do not know whether a refund came from a return. A return's refund is announced by `returns`' own closing notice and never reaches `refundIssuedEmail`.
- `refundUndeliverableEmail` asks rather than decides, because the shop may change the refund means only with the buyer's express agreement.
- The `payBy` deadline in `transferInstructionsEmail` is formatted with `Intl.DateTimeFormat` in the recipient's locale. It uses the shop's timezone with a short zone name (e.g. "CEST"), so a buyer abroad does not read it as their own time. The fields are spelled out individually because `dateStyle`/`timeStyle` cannot be combined with `timeZoneName`.
- `bic` is passed through as `undefined` rather than conditionally spread. The template's `typeof bic !== "undefined"` guard relies on the key being present but unset.
