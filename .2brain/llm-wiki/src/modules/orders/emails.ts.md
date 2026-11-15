---
source: src/modules/orders/emails.ts
sha256: 5cbeb26c0e984f7ad24290e8fbf1ba3b5c51c3b0d44e63724b655c2b38e553dd
generated_at: 2026-11-14T20:36:55.999116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Resolves every customer-facing email this module sends into finished, locale-specific strings. Language is an input argument; the output is complete text that the mailer template only interpolates. The same "resolve-then-interpolate" contract applies here as in `@modules/account/emails`. Invoice-document copy intentionally lives in `@modules/invoicing`'s own `emails.ts`, not in this file.

## Key elements

- **`OrderLines`** (interface) — Minimal structural subset of an order (items with quantity, product title/price, backorder/preorder fields, shipping cost, currency). Deliberately narrower than `OrderDocument` so tests can build a two-line fixture.
- **`WithdrawalNotice`** (interface) — Shape of the statutory withdrawal block (heading, terms, effects, form) that must appear on the durable medium (CRD Annex I).
- **`withdrawalNotice(locale, order, orderId)`** (exported) — Builds the full withdrawal notice. Determines `goods` / `digital` / `none` via `withdrawalCase`, names Art. 16-excluded lines, and assembles terms, effects, and the model form.
- **`orderConfirmEmail(locale, name, order, orderId)`** (exported) — Builds the placed-order email (`EmailContent`). Includes per-line copy, delivery promises, total (via `orderTotal`), the withdrawal notice, and a frontend link. Sent immediately at creation; the order is still `pending`.
- **`holdExpiredEmail(locale, order)`** (exported) — Notification to the buyer when an unpaid stock reservation lapses. (Truncated in source.)
- **`withdrawalCase`**, **`withdrawalForm`**, **`goodsEffects`**, **`longDate`**, **`linePromise`** — Private helpers for classification, form rows, goods-specific effects, shop-timezone date formatting, and per-line delivery promises.

## Relationships

- **`src/domain-primitives/money.ts`** — Calls `formatMoney` to render every amount in the order's frozen currency and the recipient's locale.
- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that both exported email builders return.
- **`src/infrastructure/i18n/context.ts`** / **`src/infrastructure/i18n/index.ts`** — Imports `translator` to obtain a locale-scoped translation function for all copy.
- **`src/modules/account/index.ts`** / **`src/modules/account/services/operator-identity.ts`** — Calls `operatorIdentity()` to get the trader's legal name, address, and email for the withdrawal notice and form.
- **`src/modules/orders/config.ts`** — Reads `orderFrontendLink` (URL builder) and `withdrawalPeriodDays` (statutory period).
- **`src/modules/orders/domain/index.ts`** (re-exporting `rules.ts`, `totals.ts`, `withdrawal.ts`) — Reads `WITHDRAWAL_REFUND_DAYS`, `WITHDRAWAL_SEND_BACK_DAYS`, `isExcludedFromWithdrawal`, `isShippedItem`, and `orderTotal`.
- **`@modules/shop`** — Reads `addressLine`, `returnAddress`, `returnPostagePayer`, `shopTimezone`, `traderPhone` for the goods-return block and date rendering.
- **`src/modules/orders/tests/unit/emails.test.ts`** — Unit-tests the public builders with `OrderLines` fixtures.
- **`src/modules/orders/services/cancel-mail.ts`**, **`src/modules/orders/services/notify.ts`** — Sibling services that compose or dispatch the emails produced here.

## Notes

- **Pre-resolved titles.** `product.title` arrives already translated into the order's frozen checkout locale. The builders here only interpolate; they never call `resolveSnapshotProducts` or re-translate.
- **Not "confirmed."** The email is explicitly "order received, awaiting payment." `bank_transfer` orders receive `transferInstructionsEmail` from the `payments` module instead.
- **Shop timezone for dates.** `longDate` formats using `shopTimezone()`, not UTC, because staff type a day on the shop's wall clock and a UTC render would shift the date by a day.
- **Total via `orderTotal`.** The email quotes `orderTotal(order)` (the domain's own arithmetic), not a re-summed figure, ensuring the email matches what the order stands for.
- **Structural, not nominal.** `OrderLines` is an interface, not a reference to `OrderDocument`. Keeping it narrow is a deliberate testability choice.
