---
source: src/modules/payments/emails.ts
sha256: edc66a687b62b6742e31219f6d16c9f007251968c93a14822396517a71a378c4
generated_at: 2026-10-29T05:05:56.002263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/emails.ts

## Purpose
Builds the five email bodies the payments module sends (payment received, refund issued, refund undeliverable, transfer instructions, transfer expired). Each function resolves all i18n strings into finished text at call time — language is an argument, output is done — and returns an `EmailContent` object whose template only performs simple interpolation later. This keeps translation logic out of the mailer adapter and out of the HTML templates.

## Key elements
- **`paymentReceivedEmail`** — "Your card settled" email. Lists order lines with formatted prices, total, and a link to the order page.
- **`refundIssuedEmail`** — "Refund completed" email. Distinguishes full vs. partial refund via a different `detail` string. Not used for return-driven refunds (those are announced by the `returns` module).
- **`refundUndeliverableEmail`** — "We couldn't push the refund back to your card" email. Asks the buyer how to proceed; never includes the provider's rejection reason.
- **`TransferInstructions`** (interface) — Shape for bank-transfer details: `beneficiary`, `iban`, optional `bic`, and `reference` (the RF creditor reference used for matching).
- **`transferInstructionsEmail`** — "Here's how to pay by bank transfer" email. Includes IBAN/BIC, reference, and a deadline formatted in the shop's timezone.
- **`transferExpiredEmail`** — "Your transfer deadline passed, order cancelled" email. Minimal: greeting, body, total, footer.

## Relationships
- **`@infrastructure/adapters/mailer`** — Provides the `EmailContent` type every builder returns.
- **`@infrastructure/i18n`** — Provides `translator(locale)` used by every builder to resolve strings.
- **`@domain-primitives/money`** — Provides `formatMoney` for all monetary display values.
- **`@modules/orders`** (`index.ts`) — Provides `OrderLines` type, `orderTotal`, and `orderFrontendLink`.
- **`@modules/shop`** — Provides `shopTimezone()` for the transfer deadline's timezone name.
- **`src/modules/payments/services/notify.ts`** — The service layer that calls these builders and hands the result to the mailer.
- **`src/modules/payments/tests/unit/emails.test.ts`** / **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Unit tests for the builders and the mailer templates they feed.
- **`src/modules/orders/emails.ts`** — Pattern sibling; the module docblock points to the account-emails convention, and this file follows the same "resolve strings here, interpolate in template" rule.

## Notes
- `bic` is passed through as `undefined` rather than conditionally spread, because the mailer template guards with `typeof bic !== "undefined"` — omitting the key entirely would break that check.
- The transfer deadline uses `Intl.DateTimeFormat` with explicitly spelled-out fields (year, month, day, hour, minute, `timeZoneName`) because `dateStyle`/`timeStyle` shorthand does not emit a `timeZoneName`.
- The deadline is rendered in the **shop's** timezone (via `shopTimezone()`), not the buyer's, so an international customer doesn't misread the cutoff as local time.
- `refundUndeliverableEmail` deliberately withholds the provider's rejection reason and frames the request for alternate payment as a question (consent language), not a decision.
