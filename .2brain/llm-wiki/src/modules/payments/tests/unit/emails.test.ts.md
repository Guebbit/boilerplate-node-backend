---
source: src/modules/payments/tests/unit/emails.test.ts
source_sha256: f4e2a56397b53da0668c61465b6eecbcf9fac1b296afcc0fbd8e7c23ac8e9d73
context_sha256: 8e7c38f190fa83d7b40085b78c3bb824c9b784a9bfc9eb1088b401826cc37786
generated_at: 2026-11-22T07:05:18.097542+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/emails.test.ts

## Purpose
Unit tests for the payments email builders. The module doc states the rationale: these mails print money, so a formatting slip reads as a billing error. The tests check template names, translated subjects, amounts, currency formatting, links and deadlines.

## Key elements
- **Fixtures**: `NAME`, `ORDER_ID`, and `ORDER`. `ORDER` has two items with different titles, quantities and prices, shipping cost `4.25`, and currency EUR. The differences ensure no field can stand in for another. `YEN` is a one-item JPY order used for the currency checks.
- **`paymentReceivedEmail` tests**
  - Template is `payments.payment-received`, with one line per item.
  - `total` contains `€226.75`, which equals `orderTotal(ORDER)` and includes shipping.
  - Line 2 contains `€7.50`.
  - `linkUrl` equals `orderFrontendLink({ locale, id })`.
  - Subjects differ between `en` and `it`, and the English subject does not start with a raw `payments.` key.
- **`refundIssuedEmail` tests**
  - Template is `payments.refund-issued`.
  - `body` contains the order number and the amount.
  - The `detail` text differs between full and partial refunds. Full contains "everything" and partial contains "part".
  - The subject is localized.
- **Bank transfer mails** (`transferInstructionsEmail`, `transferExpiredEmail`)
  - Instructions template is `payments.transfer-instructions`. Data carries `beneficiary`, `iban`, `reference` and `linkUrl`. `bic` is undefined unless supplied.
  - The deadline is printed on the shop clock, not the viewer's. `10:30Z` in October renders as 12:30 and matches `GMT+2` or `CEST`.
  - `en` and `it` subjects differ, and no subject, body or deadline starts with `payments.`.
  - An `it.each` case checks that both the instructions and the expiry notice print `¥1,990` for a JPY order.
  - Expiry template is `payments.transfer-expired`.

## Relationships
- `src/modules/payments/emails.ts`: the code under test. It provides all four builders: `paymentReceivedEmail`, `refundIssuedEmail`, `transferInstructionsEmail` and `transferExpiredEmail`.
- `src/modules/orders/index.ts`: the test imports `orderTotal` and `orderFrontendLink` from `@modules/orders`. It uses them as the expected values for the total and the link.
- `src/modules/orders/domain/totals.ts` and `src/modules/orders/config.ts` are neighbors in the graph. The test does not import them directly, so any link to them goes through the orders module.

## Notes
- Assertions on locale compare English and Italian output. They check that the strings differ and that no raw translation key is shown.
- The deadline regexes accept either `12:30 PM`/`12:30` or `GMT+2`/`CEST`, so they tolerate differences in ICU/Node formatting.
- The `it.each` title uses `%s print ...`, so the case labels read as plural subjects ("the instructions print money...").
