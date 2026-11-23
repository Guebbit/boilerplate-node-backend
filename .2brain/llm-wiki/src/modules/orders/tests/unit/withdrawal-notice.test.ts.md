---
source: src/modules/orders/tests/unit/withdrawal-notice.test.ts
source_sha256: d7c40047586f4d526203f9770b66e97db456c6665369f9c26e5f948327ce4e91
context_sha256: 39c8512ccfe7fa99ab3130968bd3e30a9b6d2d9e252b06ab371595f4af7993e9
generated_at: 2026-11-22T06:39:14.521470+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/withdrawal-notice.test.ts

## Purpose
Unit tests for the withdrawal information and model withdrawal form included in placed-order emails (CRD Art. 6(1)(h), 8(7), Annex I). They check which of three cases a basket falls into (goods, digital-only, all excluded), and that every placeholder in the official text is filled: period, shop identity, goods return address, and postage payer. They also check the notice in English and Italian, and the rendered email partial.

## Key elements
- `ORDER_ID`, `line()`, `GOODS`, `DIGITAL`: fixtures. `line()` builds an order item, and its `requiresShipping` and `noWithdrawal` flags decide the case. `GOODS` is a single shippable item and `DIGITAL` a single non-shipping item.
- `textOf(notice)`: joins `terms`, `effects` and `form` so tests can use substring checks regardless of which row holds the text.
- `render(email)`: renders `orders/templates/<template>.ejs` with `ejs.renderFile`, using `REPO_ROOT` as the root, to mimic the mailer.
- `describe('withdrawalNotice: which case applies')`:
  - Goods: the period runs from physical possession, with return instructions.
  - Digital-only: the period runs from the contract, with no goods-return text.
  - A mix of goods and digital follows the goods clock.
  - All lines excluded: a single "no right of withdrawal" term, empty `effects`, and an empty `form`.
  - Some lines excluded: the instructions stay and the excluded lines are named.
  - No exclusion text appears when nothing is excluded.
- `describe('withdrawalNotice: every placeholder is filled')`:
  - The shop identity appears in both `terms` and `form`.
  - `NODE_WITHDRAWAL_PERIOD_DAYS` sets the period, while refund and return stay at 14 days.
  - The goods address is the shop address, or the one set by the `NODE_RETURN_ADDRESS_*` variables.
  - `NODE_RETURN_POSTAGE_PAYER` switches between consumer-pays and shop-pays wording.
  - The notice links to the order page via `orderFrontendLink`.
  - It offers the online withdrawal function with the Annex I(A) note 3 acknowledgement wording (Directive 2023/2673), in English and Italian.
  - No `{{` or `orders.email-withdrawal` keys are left unresolved, and the heading is "Diritto di recesso" in Italian.
- `describe('the placed-order email carries the notice')`: `orderConfirmEmail(...).data.withdrawal` equals `withdrawalNotice(...)`.
- `describe('the shared partial, rendered')`: the real EJS template prints the notice and form. When everything is excluded it prints only the exclusion sentence, and a shop name like `Smith & Sons` is escaped once (`&amp;`, never `&amp;amp;`).

## Relationships
- `../../emails`: provides `withdrawalNotice`, `orderConfirmEmail` and the `OrderLines` type under test.
- `../../config`: provides `orderFrontendLink`, used to compute the expected order-page link.
- `@tests/environment` (`tests/support/environment.ts`): `withEnvironmentOverrides` temporarily sets `NODE_*` variables such as the period, return address, postage payer and legal name.
- `@tests/paths` (`tests/support/paths.ts`): `REPO_ROOT` and `MODULES_ROOT` locate and root the EJS templates.

## Notes
- Tests that use `withEnvironmentOverrides` return a promise, so callbacks that are otherwise synchronous end with `Promise.resolve()`.
- Assertions match the exact English and Italian legal wording, so any copy change in the translations will break them.
- The default shop identity expected by the tests is "Guebbit Demo Shop Srl, Via Roma 1, 20100 Milano, IT", with `support@example.com` and `+39 02 1234567`.
