---
source: src/modules/orders/emails.ts
sha256: c105eec1129395807430ddb2400465b4ea0dca0187d00b1a0ea44a0d0ae958b3
generated_at: 2026-10-29T04:41:53.983534+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Holds the full resolved copy (finished strings) for every email the orders module sends. Each function takes a locale and order data, produces translated text with all placeholders filled, and returns it as structured data the mailer's template engine can interpolate. The file is the single source of truth for order-module email wording, mirroring the convention in `@modules/account/emails`.

## Key elements

- **`OrderLines`** (interface) — Structural minimum an email needs from an order: per-line quantity, product title/price, shipping flags, optional backorder/preorder fields, shipping cost, and currency. Deliberately narrower than `OrderDocument` so tests can pass a two-line fixture.
- **`WithdrawalNotice`** (interface) — Shape of the right-of-withdrawal block: heading, terms, effects, form (each a string array; `effects`/`form` are empty when they don't apply).
- **`withdrawalNotice(locale, order, orderId)`** (exported) — Builds the full CRD Art. 6/8/Annex I withdrawal notice. Classifies the order as `goods`, `digital`, or `none` via the private `withdrawalCase` helper, then assembles terms, effects, and the model form (Annex I(B)).
- **`orderConfirmEmail(locale, name, order, orderId)`** (exported) — Builds the "order received, awaiting payment" email. Renders each line individually (per-line copy can't be a single pre-set string), appends a delivery promise where relevant, computes the total via `orderTotal`, and embeds the withdrawal notice.
- **`cardHoldExpiredEmail(locale, order)`** (exported) — Notification for a lapsed `card` payment hold (30-min reservation expired, customer never finished checkout).
- **`STATUTORY_DAYS`** (const, 14) — The legal return/refund window used in copy.
- **`withdrawalCase`** (private) — Returns `'goods' | 'digital' | 'none'` based on whether any withdrawable line ships or is all digital.
- **`withdrawalForm`** (private) — The nine rows of the Annex I(B) model form with the trader identity filled in.
- **`goodsEffects`** (private) — Send-back address, postage payer, and diminished-value note (Annex I(A) notes 4–5).
- **`longDate`** (private) — Formats a `Date` in the shop's timezone using `Intl.DateTimeFormat`, avoiding the UTC-evening-before problem.
- **`linePromise`** (private) — Produces the delivery-promise sentence for backordered or preorder lines; returns `undefined` for ready-now items.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that every builder returns.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `translator` for all copy resolution.
- **`src/domain-primitives/money.ts`** — Imports `formatMoney` to render every amount as a locale-formatted string.
- **`src/modules/orders/config.ts`** — Imports `orderFrontendLink` (builds the order-page URL) and `withdrawalPeriodDays` (shop-configured window).
- **`src/modules/orders/domain/index.ts`** (re-exports from `rules.ts`, `totals.ts`, `withdrawal.ts`) — Imports `isExcludedFromWithdrawal`, `isShippedItem`, and `orderTotal` for classification and the authoritative total.
- **`src/modules/orders/index.ts`** — Barrel that re-exports this module's public API.
- **`src/modules/orders/services/notify.ts`** / **`cancel-mail.ts`** — Sibling services that call these builders when dispatching mail.
- **`src/modules/payments/emails.ts`** — Handles the `bank_transfer` placed-order email; this file explicitly does not cover that case.
- **`src/modules/orders/tests/unit/emails.test.ts`** / **`withdrawal-notice.test.ts`** — Unit tests exercising the builders with fixture `OrderLines` objects.

## Notes

- **Product titles are pre-resolved.** They arrive in the order's frozen locale (see `OrderDocumentItem.locale` / `resolveSnapshotProducts`). Neither builder here re-resolves them; they only interpolate.
- **"Awaiting payment", never "confirmed."** Every order this file renders for is still `pending` at send time. A `bank_transfer` order's placed-order mail is the `transferInstructionsEmail` from `@modules/payments`, not this file.
- **Total comes from `orderTotal`.** The email quotes the order's canonical total (shipping included) rather than re-summing line items.
- **Dates use the shop's timezone.** `longDate` explicitly formats with `shopTimezone()` so a staff-entered day doesn't shift to the previous evening in UTC.
- **`OrderLines` is structural, not `OrderDocument`.** This keeps the builders testable with minimal fixtures and avoids coupling email rendering to the full domain entity.
- **Invoice copy lives elsewhere.** The invoice document's own email text is in `@modules/invoicing/emails.ts`, not here.
- **All amounts are locale-formatted strings** via `formatMoney(locale, value, currency)` — never bare numbers in the output data.
