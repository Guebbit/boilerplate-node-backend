---
source: src/modules/orders/emails.ts
sha256: 0957c524ae10746a80ffa25f9bd03bcaf8128b8188ccb79a5e7275c7103790f8
generated_at: 2026-09-23T19:02:53.827307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Builds the finished, locale-resolved copy for every customer-facing document the orders module produces (confirmation email, bank-transfer instructions, expiry notice, product-unavailable cancellation, and the invoice's VAT block). Translation keys are resolved here at build time; downstream renderers (EJS for emails, Puppeteer for the PDF) only interpolate the strings they receive and never touch i18n themselves.

## Key elements

- **`OrderLines`** (interface) — Minimal structural shape (lines + optional shipping) both email and invoice builders accept. Deliberately not the full `OrderDocument`, so tests can pass a two-line fixture.
- **`orderConfirmEmail`** — Returns `EmailContent` for the standard order-confirmation email. Interpolates per-line copy and the `orderTotal`.
- **`bankTransferInstructionsEmail`** — Replaces the confirmation for `bank_transfer` checkouts; includes beneficiary/IBAN/BIC, a `Intl.DateTimeFormat`-rendered deadline, and the same order-page link.
- **`bankTransferExpiredEmail`** — Sent when a `bank_transfer` order's deadline passes unpaid. Never used for card-order timeouts.
- **`productUnavailableCancelledEmail`** — Sent when a product is hard-deleted or deactivated, cancelling the order. Accepts `readonly { title }[]` from `unavailableLines`.
- **`InvoiceOrder`** (interface) — Extends `OrderLines` with per-line `taxRate`, optional `invoiceNumber`, and `createdAt` (a real `Date`).
- **`buildInvoiceMeta`** (private) — Returns `InvoiceMeta | undefined`; gated as a unit on `invoiceNumber` being present (Art. 226 of EU VAT Directive).
- **`InvoiceVatRow`** / **`InvoiceTaxSummaryRow`** (interfaces) — Row shapes for the per-line VAT table and the rate-grouped summary.
- **`InvoiceVatBlock`** (interface) — The full VAT table (columns header + rows) plus the shop's legal identity block.
- **`buildVatBlock`** (truncated in source) — Recomputes VAT figures per line; `grossAmount` is always `netAmount + taxAmount`, never re-derived from `unitPrice × quantity`.

## Relationships

- **`@infrastructure/adapters/mailer`** — Supplies the `EmailContent` return type for all three email builders.
- **`@infrastructure/i18n`** — Supplies `translator(locale)` which yields the `TFunction` every builder uses to resolve keys.
- **`@infrastructure/http/frontend-link`** — Supplies `frontendLink('order', {…})` for the "view order" URL in email and invoice data.
- **`./config`** — Supplies `shopCurrency`, `shopCountry`, `shopLegalName`, `shopVatNumber` (used in the truncated invoice section).
- **`./domain`** (`orderTotal`, `orderTaxBreakdown`, `TaxRateSummary`) — Arithmetic for totals and the tax breakdown reused by the VAT block; the email total and the order's own total are guaranteed identical.
- **`@types`** — Supplies `OrderTransferInstructions` (beneficiary, iban, bic, reference).
- **`services/notify.ts`** — Primary caller of the three email builders at send time.
- **`services/invoice.ts`** — Caller of `buildVatBlock` / `buildInvoiceMeta` inside `renderInvoicePdf`.
- **`services/cancel.ts`** — Caller of `productUnavailableCancelledEmail`.
- **`services/availability.ts`** — Provides the `unavailableLines` list fed into the cancellation email.
- **`tests/unit/emails.test.ts`** — Unit tests exercising each builder with `OrderLines` fixtures.

## Notes

- **Product titles are pre-resolved.** They arrive in the order's _frozen_ locale (see `OrderDocumentItem.locale`). Builders only interpolate; they never call a translator on `product.title`.
- **`bic` is set to `undefined` unconditionally**, not conditionally spread. This keeps the template's `typeof bic !== "undefined"` guard working _and_ keeps the data object a plain literal that `tests/cross-cutting/mail-copy.test.ts` can read statically.
- **`grossAmount` is `netAmount + taxAmount`, not `unitPrice × quantity`.** The latter is a float multiplication in JS (`19.99 × 5 → 99.94999999999999`) that would drift from the adjacent columns. The invoice's contract is that its columns sum to the charged amount to the cent.
- **`buildInvoiceMeta` is all-or-nothing.** A date without a number would misrepresent a pre-compliance order; both fields are gated together on `invoiceNumber` presence.
- **`createdAt` is a `Date`, not an ISO string.** It comes from a hydrated Mongoose document via `orderRepository.findByIdRaw`, bypassing `applyOrderTransform` / `.toJSON()`.
- **Date formatting uses `Intl.DateTimeFormat`** (node standard library), per the repo's "no date-formatting dependency" rule.
- **Invoice numbering does not wait on payment.** The same `frontendLink` order-page URL and on-demand invoice rendering apply to the `bank_transfer` path as to the paid path.
