---
source: src/modules/payments/emails.ts
sha256: c0adb773882d64ee88454e72a53b9cd9988474f5a5edd160e9fd17923d01b1a0
generated_at: 2026-11-08T07:20:49.608240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/emails.ts

## Purpose

Pure email-builder functions for the five customer-facing messages the payments module sends: payment received, refund issued, refund undeliverable, bank-transfer instructions, and transfer deadline expired. Each function takes a locale plus domain data and returns a fully translated `EmailContent` object whose `template` field the mailer adapter interpolates — the same "language is an argument, output is finished text" convention as `@modules/orders/emails` and `@modules/account/emails`.

## Key elements

- **`paymentReceivedEmail(locale, name, order, orderId)`** — Builds the "payment settled" confirmation. Maps each order line through a translated item template, includes the order total (via `orderTotal` + `formatMoney`), and a front-end order link.
- **`refundIssuedEmail(locale, name, orderRef, refund, full)`** — Announces a settled refund (cancel-refund or goodwill refund; return-refunds use the returns module's own notice). Selects a full vs. partial detail string.
- **`refundUndeliverableEmail(locale, name, orderRef, refund, shopEmail, orderId)`** — Tells the buyer the refund couldn't reach their card, asks (not instructs) how they'd like the money, and includes the shop's contact email and an order link.
- **`TransferInstructions`** *(interface)* — The bank-transfer details the buyer needs: `beneficiary`, `iban` (grouped in blocks of four), optional `bic`, and the RF creditor `reference`.
- **`transferInstructionsEmail(locale, name, order, instructions, payBy, orderId)`** — Sends the transfer details plus a formatted deadline. Uses `Intl.DateTimeFormat` with the shop's timezone (`shopTimezone()`) and a named zone so an international buyer reads the shop's wall clock, not their own.
- **`transferExpiredEmail(locale, order)`** — Sent by the sweep when a bank-transfer order's deadline passes with no payment. No personalization (no `name` param).

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type that every builder returns.
- **`@infrastructure/i18n`** — Imports `translator(locale)` which all five builders call to obtain a translation function `t`.
- **`@domain-primitives/money`** — Uses `formatMoney` to render amounts in the recipient's locale.
- **`@modules/orders`** (index → `config.ts`, `domain/totals.ts`) — Imports `orderFrontendLink`, `orderTotal`, and the `OrderLines` type.
- **`@modules/shop`** (index → `service.ts`) — Imports `shopTimezone()` for the transfer-deadline date formatting.
- **`@modules/payments/services/notify.ts`** — The service layer that calls these builders and passes the result to the mailer adapter.
- **`@modules/payments/index.ts`** — Re-exports the builders (and `TransferInstructions`) for external consumers.
- **`src/modules/payments/tests/unit/emails.test.ts`** — Unit tests for these builders.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Tests the HTML templates (`payments.payment-received`, `payments.refund-issued`, etc.) that these builders reference by name.
- **`src/modules/orders/emails.ts`** — Referenced in the module docblock as the precedent for the "language-in, finished-text-out" convention.

## Notes

- **`bic` is passed as `undefined`, not omitted.** The template guards on `typeof bic !== "undefined"`; a conditional spread would change the key's presence and break that check.
- **Date formatting is field-by-field, not `dateStyle`/`timeStyle`.** Those presets refuse to include `timeZoneName`, so each unit (`year`, `month`, `day`, `hour`, `minute`, `timeZone`, `timeZoneName`) is spelled out explicitly.
- **`orderRef` (human number or id) is the display reference** in refund emails; the raw `orderId` is only used for the front-end link.
- **The undeliverable-refund email deliberately omits the provider's refusal reason** (not appropriate for a shopper) and uses imperative-free, ask-oriented language because the shop may change the payment method only with the buyer's express consent.
- **`transferExpiredEmail` has no greeting name** — it is a generic system notice, not a personal one.
