---
source: src/modules/orders/emails.ts
source_sha256: 3e1792c0034d36bb2bb25dd570eb8511b3b835e5cb304c2603c8802c8ea2ecd0
context_sha256: 7e1e1cca77b700744f7394a08ba25c94f6841f1bae8d5a918ed9966803602a7c
generated_at: 2026-11-22T06:14:30.137508+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/emails.ts

## Purpose
Builds the copy of every email the orders module sends, as finished, translated strings. The language is an argument and the output is final text, so the queued template only interpolates. It follows the same rule as `@modules/account/emails`. The invoice document's copy lives in `@modules/invoicing`, not here.

## Key elements
- **`OrderLines`** (interface): the minimal structural shape the builders need from an order.
  - Each item has a quantity and a product with `title`, `price`, and optional flags (`requiresShipping`, `noWithdrawal`, `releaseDate`, `preorder`).
  - Items may also carry `backorderedQuantity`, `promisedAt` and `promiseDated`.
  - The order has an optional `shippingCost` and a required `currency`.
  - It is structural rather than `OrderDocument`, so tests can pass a two-line fixture.
- **`WithdrawalNotice`** (interface): the notice as finished strings. It has `heading`, `terms`, `effectsHeading`, `effects`, `formHeading` and `form`. `effects` and `form` are empty when they don't apply.
- **`withdrawalNotice(locale, order, orderId)`**: builds the right-of-withdrawal information and model form that placed-order emails must carry (CRD Art. 6(1)(h), 8(7), Annex I).
  - It fills in the withdrawal period, the trader identity, an online withdrawal link, and the lines excluded under Art. 16.
  - For goods orders it adds the goods-return effects.
  - When every line is excluded it returns only a "none" term, with empty effects and form.
- **`orderConfirmEmail(locale, name, order, orderId)`**: returns the `orders.order-confirm` `EmailContent`.
  - It is the "order received, awaiting payment" mail, not a confirmation, since the order is still `pending`.
  - Its data holds the greeting, body, per-line strings, total, order link, the withdrawal notice and the footer.
  - Each line shows the title, quantity and price, followed by a delivery promise if one applies.
  - The total comes from `orderTotal`, so shipping is included.
- **`holdExpiredEmail(locale, order)`**: returns the `orders.order-hold-expired` `EmailContent`. It goes to the buyer of an order whose stock hold lapsed unpaid, whether a checkout card order or a staff-created one. A transfer's equivalent belongs to `payments`. The file shown here ends partway through this function.
- Internal helpers:
  - `withdrawalCase` picks `goods`, `digital` or `none`.
  - `withdrawalForm` builds the Annex I(B) form rows.
  - `goodsEffects` builds the withhold, send-back, postage and diminished-value text.
  - `longDate` formats a date in the recipient's locale on the shop's timezone.
  - `linePromise` returns a delivery promise for a backordered or preorder line.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: supplies the `EmailContent` type that the builders return.
- `src/infrastructure/i18n/index.ts`: supplies `translator(locale)`, which resolves all copy.
- `src/domain-primitives/money.ts`: `formatMoney` formats amounts in the order's currency and the recipient's locale.
- `src/modules/orders/config.ts`: `orderFrontendLink` builds the order page URL, and `withdrawalPeriodDays` gives the period.
- `src/modules/orders/domain/index.ts`: supplies `WITHDRAWAL_REFUND_DAYS`, `WITHDRAWAL_SEND_BACK_DAYS`, `isExcludedFromWithdrawal`, `isShippedItem` and `orderTotal`.
- `src/modules/account/index.ts`: `operatorIdentity()` supplies the legal name, address and email for the trader line.
- `@modules/shop`: supplies `addressLine`, `returnAddress`, `returnPostagePayer`, `shopTimezone` and `traderPhone`.
- The graph also lists `src/modules/orders/services/notify.ts`, `src/modules/orders/services/cancel-mail.ts` and `src/modules/orders/tests/unit/emails.test.ts` as neighbors. They are not imported by this file, and the visible content doesn't show how they use it.

## Notes
- `product.title` is already resolved into the order's frozen locale (see `OrderDocumentItem.locale` and `resolveSnapshotProducts`). The builders only interpolate it and never re-resolve it.
- The withdrawal clock described in the notice mirrors the code's own split. `goods` runs from receipt and `digital` runs from the contract.
- Delivery dates are printed on the shop's timezone, not UTC, because staff enter days on the shop's wall clock.
- The confirmation email is sent immediately at order creation. Its link points to the order page, where the receipt download is always available, so it doesn't wait on the receipt.
- The module header points to the "cancel-and-refund-mails" section of the orders module documentation for further background.
