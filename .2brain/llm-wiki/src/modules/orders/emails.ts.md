---
source: src/modules/orders/emails.ts
sha256: 019757c04d134f07e761097565f20ce376197289071c57265e80ea5431f390fb
generated_at: 2026-09-27T15:10:25.260220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/emails.ts

## Purpose

Centralises the copy builders for every order-lifecycle email (confirmation, payment success, bank-transfer instructions, expiration, product-unavailability cancellation) and the invoice metadata/VAT blocks. The design rule is: the caller passes a locale, the function returns **finished strings** via `i18next` — the downstream EJS/Puppeteer template only interpolates and never resolves a key.

## Key elements

- **`OrderLines`** – Minimal structural shape (`items[]` with `quantity`, `product.title`, `product.price`, optional `shippingCost`). Intentionally narrower than the full order so tests can supply a two-line fixture.
- **`orderConfirmEmail(locale, name, order, orderId)`** – "Order received, awaiting payment" email. Uses `orderTotal` for the total; links to the order page via `orderFrontendLink`.
- **`paymentSucceededEmail(locale, name, order, orderId)`** – "Payment received" confirmation. Same shape as confirm, different copy keys.
- **`bankTransferInstructionsEmail(locale, name, order, instructions, payBy, orderId)`** – Sent *instead* of confirm for `bank_transfer` orders. Includes IBAN, optional BIC, reference, and an `Intl.DateTimeFormat`-formatted deadline.
- **`bankTransferExpiredEmail(locale, order)`** – Deadline-passed sweep notice. No recipient `name` parameter.
- **`cardHoldExpiredEmail(locale, order)`** – Thirty-minute card-hold lapse notice. Same shape as bank-transfer expired, different template/copy.
- **`productUnavailableCancelledEmail(locale, unavailable)`** – Cancellation explanation when a line's product was hard-deleted or deactivated. Takes only the unavailable line titles, not the full order.
- **`InvoiceOrder`** – Extends `OrderLines` with `id`, per-line `taxRate`, optional `orderNumber`, `createdAt`, and `currency`. Consumed by `services/invoice.ts`.
- **`InvoiceMeta`** – `{ numberLabel, dateLabel }` pair printed together or not at all.
- **`buildInvoiceMeta`** (truncated in source) – Produces the `InvoiceMeta` block; gated as a unit on `orderNumber` presence.
- **`buildVatBlock`** (referenced) – Recomputes VAT figures from frozen `taxRate` values rather than trusting pre-formatted strings.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/mailer.ts` | All builders return `EmailContent`; this is the contract the mailer adapter consumes. |
| `src/infrastructure/i18n/index.ts` | Imports `translator` to obtain a locale-bound `TFunction` inside every builder. |
| `src/infrastructure/i18n/context.ts` | Provides the `TFunction` type imported at the top of the file. |
| `src/modules/orders/config.ts` | Imports `orderFrontendLink` (link URL), `shopCurrency`, `shopCountry`, `shopLegalName`, `shopVatNumber` (invoice copy). |
| `src/modules/orders/domain/index.ts` | Re-exports `orderTotal` and `orderTaxBreakdown` used for totals and VAT figures. |
| `src/modules/orders/domain/totals.ts` | Source of `orderTotal`; the email total is this arithmetic, never a fresh sum. |
| `src/modules/orders/domain/tax.ts` | Source of `orderTaxBreakdown` / `TaxRateSummary` consumed by `buildVatBlock`. |
| `src/modules/orders/services/notify.ts` | Primary caller of the confirm, payment, and transfer-instruction builders at order-creation time. |
| `src/modules/orders/services/cancel.ts` | Caller of `bankTransferExpiredEmail`, `cardHoldExpiredEmail`, and `productUnavailableCancelledEmail`. |
| `src/modules/orders/services/invoice.ts` | Sole build site for `InvoiceOrder`; calls `buildInvoiceMeta` and `buildVatBlock`. |
| `src/modules/orders/services/availability.ts` | Produces the `unavailableLines` array passed to `productUnavailableCancelledEmail`. |
| `src/modules/payments/services/settlement.ts` | `settlePayment` is the sole caller of `paymentSucceededEmail`. |
| `src/types/index.ts` | Source of the `OrderTransferInstructions` type used in the bank-transfer builder. |
| `src/modules/orders/tests/unit/emails.test.ts` | Unit tests exercising each builder. |

## Notes

- **`product.title` is pre-resolved.** It arrives frozen in the order's own locale (via `resolveSnapshotProducts`). These builders *never* re-translate product titles; they only interpolate.
- **`bic` is deliberately left as a plain `undefined` key** rather than conditionally spread. This keeps the object a static literal (readable by `mail-copy.test.ts`) and lets the EJS template's `typeof bic !== "undefined"` guard work correctly.
- **Date formatting uses `Intl.DateTimeFormat`** (Node stdlib) — no date library. Same convention noted in the module header.
- **`bankTransferExpiredEmail` and `cardHoldExpiredEmail` omit the `name` parameter**; their greetings are non-personal, unlike the confirm/payment/transfer-instruction emails.
- **Invoice `createdAt` is a real `Date`**, not an ISO string, because it comes off `findByIdRaw` (hydrated Mongoose doc) without `.toJSON()` or `applyOrderTransform`.
- **`orderTotal` is the single source of truth for the displayed total** across every email and the invoice — never a locally computed sum.
