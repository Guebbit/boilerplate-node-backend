---
source: src/modules/orders/emails.ts
sha256: b0e52e25b919598a78003b7bd1683c931cd2e8fb2e7e3fdacb972255d8da6402
generated_at: 2026-10-15T11:03:55.103324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Resolves all order-related email copy into finished, localized strings. The language is passed in as an argument; the output is ready-to-interpolate text that the mailer's template engine only plugs into a layout. Follows the same "copy lives here, template only interpolates" rule as `@modules/account/emails`. Invoice document copy is deliberately *not* here (it lives in `@modules/invoicing/emails.ts`).

## Key elements

- **`OrderLines`** (interface) — Structural subset of an order: line items with `title`, `price`, `quantity`, optional `requiresShipping` / `noWithdrawal` flags, plus `shippingCost` and `currency`. Kept narrow so both email builders and tests can pass a two-line fixture without a full `OrderDocument`.
- **`totalOf`** — Delegates to `orderTotal` from `./domain` using explicit fields (not spread) so it works with hydrated Mongoose documents.
- **`addressLine`** — Joins a `ReturnAddress` into a single comma-separated line, skipping absent fields.
- **`withdrawalCase`** — Classifies the order as `'goods'` (at least one shipped line is withdrawable), `'digital'` (all withdrawable lines are digital), or `'none'` (Art. 16 excludes every line).
- **`withdrawalForm`** (private) — Builds the 9-row model withdrawal form (Annex I(B)) with the trader pre-filled.
- **`goodsEffects`** (private) — Adds the goods-specific effects: refund hold, send-back address/deadline, postage payer, diminished-value note (Annex I(A) notes 4 & 5).
- **`withdrawalNotice`** (export) — Assembles the full right-of-withdrawal notice required by CRD Art. 6(1)(h), 8(7), Annex I: heading, terms, effects, and form. Returns empty `effects`/`form` when all lines are excluded.
- **`orderConfirmEmail`** (export) — Builds the "order received, awaiting payment" email (`EmailContent`). Includes per-line copy, total, link, and the full withdrawal notice. Sent at creation; the order is still `pending`.
- **`bankTransferInstructionsEmail`** (export) — Alternative to `orderConfirmEmail` for `bank_transfer` checkout: beneficiary, IBAN, BIC, reference, deadline (via `Intl.DateTimeFormat`), total, and withdrawal notice.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; every builder returns this shape.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `translator(locale)` to resolve every string key.
- **`src/modules/orders/config.ts`** — Imports `orderFrontendLink`, `returnAddress`, `returnPostagePayer`, `shopIdentity`, `withdrawalPeriodDays`, and the `ReturnAddress` type.
- **`src/modules/orders/domain/index.ts`** (re-exporting `rules.ts`, `totals.ts`) — Imports `isExcludedFromWithdrawal`, `isShippedItem`, `orderTotal` for classification and arithmetic.
- **`src/modules/orders/index.ts`** — Re-exports this module's public API.
- **`src/modules/orders/services/notify.ts`** / **`services/cancel.ts`** — Downstream callers that pass hydrated order documents into the builders.
- **`src/modules/orders/tests/unit/emails.test.ts`** / **`withdrawal-notice.test.ts`** — Unit tests for the builders and `withdrawalNotice`.
- **`src/modules/payments/emails.ts`** / **`src/modules/returns/emails.ts`** — Sibling modules following the identical copy-owns-strings pattern.

## Notes

- **Product titles are pre-resolved.** `item.product.title` arrives already in the order's frozen checkout locale (`resolveSnapshotProducts`). Neither builder re-translates; they only interpolate. Passing a different locale for the *recipient* does not change line-item titles.
- **No spread on order objects.** `totalOf` and the builders destructure explicit fields rather than `{ ...order }` because callers (e.g. `notify.ts`) may pass a hydrated Mongoose document whose schema paths are prototype getters a spread silently drops.
- **`bic` in `bankTransferInstructionsEmail` is intentionally `undefined`-able, not conditionally spread.** The template guards on `typeof bic !== "undefined"`, and a bare key keeps the data object a plain literal that `tests/cross-cutting/mail-copy.test.ts` can read statically.
- **Date formatting uses `Intl.DateTimeFormat`.** No third-party date library; consistent with the repo's node-stdlib-first rule.
- **`STATUTORY_DAYS = 14`** is the legal floor for return/reimbursement windows regardless of any longer shop-offered period.
- **Order confirm ≠ order confirmed.** The email is "received, awaiting payment" because the order is always `pending` at send time; `bankTransferInstructionsEmail` is sent *instead* of it for that payment method.
