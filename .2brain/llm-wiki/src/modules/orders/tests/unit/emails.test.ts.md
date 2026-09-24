---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: 1a0985e1dc5dd2ee2cc2901ceb8b8937657f29ce2ca2f91bf37af388e92a450e
generated_at: 2026-09-23T19:13:27.950041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the two customer-facing money renderers — `orderConfirmEmail` and `invoiceDocument` — that must agree with the charge the customer actually sees. The file asserts that these builders *delegate* totals to `orderTotal`, render one line per item with correct per-item fields, respect locale, and never re-resolve product titles through the i18n `t()` function. It deliberately does not re-test arithmetic (that lives in `totals.property.test.ts`).

## Key elements

- **`ORDER`** (const) — shared `InvoiceOrder` fixture with two distinct items (different titles, quantities, prices, 22 % tax) plus a `shippingCost`, reused by both the confirmation-email and invoice `describe` blocks.
- **`VAT_ORDER`** (const) — single-line, single-rate order used exclusively by the VAT-block tests.
- **`eur`** (const) — `Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' })` instance matching the project's default currency; used to format expected amounts.
- **`describe('orderConfirmEmail')`** — asserts template name, per-item line content, total delegates to `orderTotal` (shipping included), greeting by name, empty-order safety, locale passthrough, i18n key resolution, `frontendLink` passthrough, and that a title colliding with a real i18n key survives verbatim.
- **`describe('invoiceDocument')`** — asserts per-item lines, order-id in `pageMetaTitle` (including a non-string id that must not yield `[object Object]`), locale translation, and the same title-collision guard.
- **`describe('invoiceDocument — the VAT block')`** — asserts `grossAmount = netAmount + taxAmount` (not a fresh `price × qty` multiply), all amounts are `string` (formatted via `Intl.NumberFormat`), `grandTotal` equals `orderTotal` output, shipping row count matches distinct tax rates, and summary rows combine goods + shipping per rate.

## Relationships

- **`src/modules/orders/emails.ts`** — under test; provides `orderConfirmEmail`, `invoiceDocument`, and the types `OrderLines`, `InvoiceOrder`, `InvoiceVatBlock`.
- **`src/modules/orders/domain/index.ts`** — re-exports `orderTotal` and `orderTaxBreakdown`, which the tests import to compute *expected* values, ensuring the builders delegate rather than recompute.
- **`src/modules/orders/domain/totals.ts`** — source of the `orderTotal` / `orderTaxBreakdown` implementations; this file only asserts the builders *use* those, not that they are correct.
- **`src/infrastructure/http/frontend-link.ts`** — `frontendLink` is the expected value for the email's `linkUrl`; the test asserts the builder passes the order id and locale through unchanged.

## Notes

- The 19.99 × 5 IEEE 754 drift test (`99.94999999999999`) is a deliberate guard: if the builder ever re-derives `grossAmount` from `price × quantity` instead of summing the already-reconciled `netAmount + taxAmount`, a wrong total would surface.
- Title-collision tests (`'orders.email-confirm.greeting'`, `'orders.invoice.title'`) catch a regression where a product title is accidentally passed through `t()` and resolved to a different translation string.
- The non-string `id` test uses an object with a `toString` method to simulate an ObjectId; dropping `String(id)` in the builder would produce `[object Object]` in the invoice title.
- The file is truncated in the repo snapshot; the VAT-block `describe` includes additional summary-row tests beyond what is visible here.
