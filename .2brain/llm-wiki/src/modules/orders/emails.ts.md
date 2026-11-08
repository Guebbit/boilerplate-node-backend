---
source: src/modules/orders/emails.ts
sha256: 8fc3076345a771be7eb7190278456587801f4ea4b3f58e201ef9b16136e24c32
generated_at: 2026-11-08T06:51:38.031560+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Resolves the copy of every order-related email into finished, locale-specific strings before handing them to the mailer template. The language is an input argument and the output is fully interpolated text; the template behind it only does variable substitution. This mirrors the convention in `@modules/account/emails` and keeps translation, money formatting, and legal-copy assembly in one place per module.

## Key elements

- **`OrderLines`** (exported interface) — Minimal structural type the email builders need: line items with `quantity`, `product.{title, price, requiresShipping?, noWithdrawal?, releaseDate?, preorder?}`, plus optional `backorderedQuantity`, `promisedAt`, `promiseDated`, `shippingCost`, and `currency`. Deliberately narrower than a full `OrderDocument` so tests can pass a two-line fixture.
- **`STATUTORY_DAYS`** (const, 14) — The legal minimum withdrawal/reimbursement window used in copy.
- **`WithdrawalNotice`** (exported interface) — Shaped output of the withdrawal block: `heading`, `terms[]`, `effectsHeading`, `effects[]`, `formHeading`, `form[]`. Empty sections are omitted when inapplicable.
- **`withdrawalCase`** (private) — Classifies the order as `'goods' | 'digital' | 'none'` based on which lines are excluded from withdrawal and whether any are shipped.
- **`withdrawalForm`** (private) — Builds the Annex I(B) model withdrawal form rows with the trader's identity filled in.
- **`goodsEffects`** (private) — Goods-specific effects: refund hold, return address, postage responsibility, diminished-value note (Annex I(A) notes 4–5).
- **`withdrawalNotice`** (exported function) — Assembles the full CRD Art. 6(1)(h)/8(7)/Annex I withdrawal notice and model form. Returns a `WithdrawalNotice` with all placeholders resolved.
- **`longDate`** (private) — Formats a `Date` using the recipient's locale **and** the shop's timezone (`shopTimezone()`), not UTC.
- **`linePromise`** (private) — Produces a per-line delivery sentence (backorder owed by a date, or preorder ships from a date), or `undefined` if the line ships immediately.
- **`orderConfirmEmail`** (exported function) — Builds the placed-order email (`EmailContent`) for a `pending` order. Includes per-line copy, delivery promises, the total (via `orderTotal`), the withdrawal notice, and a link to the order page.
- **`cardHoldExpiredEmail`** (exported function) — Builds the email for a lapsed `card` hold (30-min reservation expired). Bank-transfer lapses are handled by the `payments` module instead.

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type; all exported email builders return this shape for the mailer to dispatch.
- **`@infrastructure/i18n`** — Imports `translator` to produce a locale-bound `t` function; every user-facing string in this file goes through it.
- **`@domain-primitives/money`** — Imports `formatMoney` so every monetary amount is rendered in the order's frozen currency and the recipient's locale.
- **`./config`** — Imports `orderFrontendLink` (order-page URL) and `withdrawalPeriodDays` (shop-configured withdrawal window).
- **`./domain`** — Imports `isExcludedFromWithdrawal`, `isShippedItem`, and `orderTotal` for line classification and the authoritative total.
- **`@modules/account`** — Imports `operatorIdentity` to fill the trader's legal name, address, and email into the withdrawal form and notice.
- **`@modules/shop`** — Imports `addressLine`, `returnAddress`, `returnPostagePayer`, `shopTimezone`, and `traderPhone` for return logistics and timezone-correct date formatting.
- **`src/modules/orders/tests/unit/emails.test.ts`** — Unit tests for the builders in this file.
- **`src/modules/orders/index.ts`** — Re-exports or coordinates the email functions alongside the rest of the orders module.

## Notes

- **Frozen locale, not recipient locale, for product titles.** `product.title` arrives pre-resolved into the order's checkout-time locale (see `OrderDocumentItem.locale`). Builders in this file only interpolate; they never re-translate a title.
- **Structural over nominal typing.** `OrderLines` is intentionally a flat structural type rather than a full domain document. This keeps `orderConfirmEmail` and `withdrawalNotice` callable from tests with a two-line fixture without constructing a complete `Order`.
- **Timezone for dates.** `longDate` formats in `shopTimezone()`, not UTC. Staff enter dates on the shop's wall clock; using UTC would shift the printed date by a day.
- **Pending only.** Every order passed to `orderConfirmEmail` is still `pending` at send time. A `bank_transfer` order that needs transfer instructions gets a different email from the `payments` module.
- **Total is `orderTotal`, not a re-sum.** The email quotes the order's authoritative total (shipping included) via the domain function, avoiding a second source of truth.
- **Invoice copy is elsewhere.** The invoice document's own mail copy lives in `@modules/invoicing/emails.ts`, not here.
- **`cardHoldExpiredEmail` scope.** This email is specifically for lapsed `card` reservations. A bank-transfer order nobody paid is answered by the `payments` module, not this file.
