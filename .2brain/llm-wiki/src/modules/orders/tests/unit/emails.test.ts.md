---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: b1cb22c62c05fc3723db8972af10b0605c0223dd3594c2a67d67bb82e63400bf
generated_at: 2026-09-27T15:21:06.176664+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the two order-documentation builders (`orderConfirmEmail` and `invoiceDocument`). The focus is on rendering correctness—line counts, per-item field fidelity, total consistency with `orderTotal`, locale propagation, and specific invariants (no `t()` re-resolution of product titles, payment-status language, VAT-block arithmetic)—rather than on the underlying math, which is covered by `totals.property.test.ts`.

## Key elements

- **`ORDER` (shared fixture)** – Two-line `InvoiceOrder` with distinct titles, quantities, prices, and a 22 % tax rate; reused by both the email and invoice describe blocks.
- **`describe('orderConfirmEmail')`** – Asserts template name, line count/content, total defers to `orderTotal` (incl. shipping), greeting uses the customer's name, empty-items safety, locale translation, all copy slots resolved, link URL matches `orderFrontendLink`, titles are never passed through `t()`, and the email says "awaiting payment" (never "confirmed").
- **`describe('invoiceDocument')`** – Asserts line rendering, order-ID in title metadata (including non-string IDs), locale, no `t()` re-resolution, and that the document self-identifies as a receipt/confirmation with an explicit "not a tax invoice" disclaimer in both EN and IT.
- **`describe('invoiceDocument — the VAT block')`** – Verifies `grossAmount = netAmount + taxAmount` (not a float multiply), and that all amounts are formatted via `Intl.NumberFormat` in EUR.
- **`VAT_ORDER` / `eur`** – Single-line fixture and a `NumberFormat` instance matching the default shop currency, used only in the VAT-block suite.

## Relationships

- **`src/modules/orders/emails.ts`** – Module under test; provides `orderConfirmEmail`, `invoiceDocument`, and the `OrderLines` / `InvoiceOrder` / `InvoiceVatBlock` types.
- **`src/modules/orders/domain/index.ts`** (re-exports) and **`src/modules/orders/domain/totals.ts`** – Source of `orderTotal` and `orderTaxBreakdown`, used to assert the builders *defer* to the domain total rather than recomputing.
- **`src/modules/orders/config.ts`** – Source of `orderFrontendLink`, used to verify the confirmation email's `linkUrl` is the exact output of that helper for the given locale and order ID.

## Notes

- The file explicitly does **not** re-test `orderTotal` arithmetic; it only asserts the builder *uses* it. The sum logic belongs to `totals.property.test.ts`.
- "SH2 = C" invariant: the email must never imply payment has completed. This is a product-level constraint encoded as a regex check on subject + body.
- The "title collides with a translation key" tests guard against a Phase 6 regression where `item.product.title` was accidentally routed through `t()`. Any future refactoring of interpolation must keep these passing.
- VAT-block tests are sensitive to IEEE 754 rounding: the assertion checks `netAmount + taxAmount`, not `price × quantity`, to catch a builder that re-derives from raw floats.
- The `eur` formatter is hard-coded to `en` locale + EUR to match the `.env-example` default (`NODE_DEFAULT_CURRENCY`); it is not read from environment.
