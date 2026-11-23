---
source: src/modules/invoicing/model.ts
source_sha256: 01b923d6a9409e4d938872d736598605be7fbf2f9ad12ef5818f1e358423619b
context_sha256: 6c5771246c6b5e3c58e3310d44ae7f01cf8aa63f5fe48f2798c82f24d38b508f
generated_at: 2026-11-22T05:32:09.960884+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/model.ts

## Purpose
Defines the Mongoose schemas and TypeScript types for issued invoices and credit notes, plus (per the module header) their own yearly numbering counters in the `{ _id: year, seq }` convention, one counter per series. Both documents are frozen at issue: every field is copied from the order (or invoice, for a credit note) when written and never re-read or re-joined. They are never exposed as JSON, only as a rendered PDF, so there is no serialization transform.

## Key elements
- `InvoiceLine`: a frozen line (`productId?`, `title`, `quantity`, gross `unitPrice`, `taxRate`, optional `rateType`). Per-line net/tax/gross is deliberately not stored. It is re-derived via `orderTaxBreakdown`.
- `InvoiceParty`: a frozen billing postal address with an optional `vatNumber`.
- `InvoiceSeller`: `Pick<Operator, 'legalName' | 'vatNumber' | 'street' | 'city' | 'zip' | 'country'>`.
- `FrozenTaxDocument`: the fields shared by both documents:
  - identity: `orderId`, `number`, `issuedAt`, `timezone`, `currency`, `locale`, `orderNumber`;
  - parties: `billingAddress?`, `buyerErasedAt?`, `seller`;
  - amounts: `lines`, `shippingCost?`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingTaxAmount`, `grandTotal`;
  - VAT breakdown: `taxSummary` and `shippingByRate`, both `OrderTaxSummaryRow[]`.
- `InvoiceStatus` (`'issued' | 'corrected'`) and `InvoiceDocument` (adds `status`), with `InvoiceModel`.
- `CreditNoteReason` (`'refund' | 'correction'`) and `CreditNoteDocument`, with `CreditNoteModel`. Credit-note fields:
  - `reason`;
  - `refundId?`: the payments refund record, which makes issuing idempotent;
  - `correctionKey?`: the `order.billing_corrected` outbox event;
  - `invoiceId` and `invoiceNumber`: the invoice it reverses.
- Embedded sub-schemas (all `_id: false`): `partySchema`, `sellerSchema`, `lineSchema`, `taxSummaryRowSchema`.
- `frozenTaxDocumentFields`: the single shared field map spread into both schemas so they cannot drift.
- `invoiceSchema`:
  - `timestamps: true`, with a `status` enum defaulting to `'issued'`;
  - uses `moneyPlugin`;
  - unique partial index `invoices_orderId` on `{ orderId: 1 }`, filtered on `status: 'issued'`;
  - index `invoices_issuedAt`.
- `invoiceModel`: the exported `Invoice` model.
- `creditNoteSchema`: the shared fields plus `invoiceId` and `invoiceNumber`. The rest of the file, including the credit-note model export and any counters, is not visible here.

## Relationships
- `src/infrastructure/persistence/money-field.ts`: supplies `moneyPath` for the money fields (stored as Decimal128, read back as decimal text) and `moneyPlugin`, which is applied to `invoiceSchema`.
- `@types`: supplies `RateType`, `Operator` and `OrderTaxSummaryRow`.
- Comments reference the following neighbors, but their code is not visible in this excerpt:
  - `emails.ts#taxCategoryCode` reads `rateType` with `taxRate` to print the EN 16931 `Z` vs `E` category code;
  - `repository.ts` has the duplicate-key guard that the unique index backs.
- The other graph neighbors (`correct-invoice`, `issue-invoice`, `issue-credit-note`, `render`, `presenter`, `pii`, `reencrypt` and so on) sit in the same module. Their use of this file is not shown here.

## Notes
- The PDF date prints in the frozen `timezone`, never the current `NODE_SHOP_TIMEZONE`. `currency` and `locale` are likewise frozen from the order.
- The partial index filter uses a positive equality (`status: 'issued'`) because partial indexes reject `$ne` and `$exists: false`. A `corrected` invoice stays beside its replacement.
- `buyerErasedAt` is set when `reap:invoices` removes the buyer block after tax retention. Absent means no buyer block was ever frozen.
- `updatedAt` from `timestamps: true` is unused, since nothing is updated after issue. The one exception is `status` moving to `corrected` per the type docs, though the update code is not visible here.
- `correctionKey` is present exactly on `correction` credit notes, and `refundId` is absent on them.
