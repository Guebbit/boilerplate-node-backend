---
source: src/modules/invoicing/model.ts
sha256: eb24be9729a3a9e48d42535f48df5404d0d2fa31c2194cf5f9abefdc9405c2a5
generated_at: 2026-10-14T16:06:41.545040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/model.ts

## Purpose

Defines the Mongoose schemas, TypeScript interfaces, and models for the two frozen legal documents in the invoicing domain—**Invoice** and **CreditNote**—plus their independent per-year numbering counters. Every field is copied from the source order (or invoice) at the moment of issue and never re-read or re-joined afterwards. Neither document is ever serialized to JSON; the only consumer-facing representation is a rendered PDF.

## Key elements

- **`InvoiceLine`** – A frozen line: `productId`, `title`, `quantity`, `unitPrice` (VAT-inclusive), `taxRate` (decimal), and optional `rateType`. No derived per-line net/tax/gross split is stored; the render pipeline re-derives those via `orderTaxBreakdown`.
- **`InvoiceParty`** – A billing/seller postal address (5 required string fields), embedded with `_id: false`.
- **`InvoiceSeller`** – The shop's legal identity (legal name, VAT number, address fields), all optional, derived as `Partial<Omit<ShopIdentity, 'email' | 'phone'>>`.
- **`FrozenTaxDocument`** – The shared contract both documents implement: `orderId`, `number`, `issuedAt`, `currency`, `locale`, `orderNumber`, `billingAddress?`, `seller`, `lines[]`, shipping figures, `netTotal`, `taxTotal`, `taxSummary[]`, `shippingByRate[]`, `grandTotal`. Satisfies Art. 226 and EN 16931 BR-CO-17.
- **`InvoiceDocument` / `invoiceModel`** – One issued invoice. Unique index on `orderId`; range index on `issuedAt`.
- **`CreditNoteDocument` / `creditNoteModel`** – One issued credit note (reversal of a single refund). Adds `refundId`, `invoiceId`, `invoiceNumber`. Unique index on `refundId` (idempotency); compound index on `{ orderId, issuedAt }`.
- **`NumberCounterDocument` / `invoiceNumberCounterModel` / `creditNoteNumberCounterModel`** – Shared `{ _id: year, seq }` counter schema; two independent collections so the invoice and credit-note sequences can never collide.
- **`frozenTaxDocumentFields`** – Single source of truth for the Mongoose field definitions shared by both schemas, preventing drift.
- **`moneyPath` / `moneyPlugin`** – All monetary fields use Decimal128 storage; the plugin converts lean reads back to numbers.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** – Provides `moneyPath` (field definition helper) and `moneyPlugin` (Decimal128 ↔ number conversion). Every monetary field in both schemas is declared via `moneyPath`.
- **`src/modules/invoicing/repository.ts`** – Owns all read/write access to `invoiceModel` and `creditNoteModel`; its duplicate-key guard relies on the unique indexes defined here to make redelivered events idempotent.
- **`src/modules/invoicing/services/issue-invoice.ts`** – Populates a new `InvoiceDocument` from an order and inserts via the repository.
- **`src/modules/invoicing/services/issue-credit-note.ts`** – Populates a new `CreditNoteDocument` (mirroring the invoice it reverses) and inserts via the repository.
- **`src/modules/invoicing/services/render.ts`** – Consumes the frozen fields to produce the PDF; re-derives per-line tax splits from `unitPrice`/`taxRate`/`quantity`.
- **`src/modules/invoicing/emails.ts`** – Reads `rateType` + `taxRate` from lines to emit EN 16931 VAT category codes (`Z` vs `E`).
- **`src/modules/invoicing/presenter.ts`** – Transforms document fields into the presentation layer's shape.
- **`src/modules/invoicing/index.ts`** – Barrel re-export for the invoicing module.
- **`src/modules/invoicing/tests/integration/*.test.ts`** – Integration tests for issue-invoice, issue-credit-note, and reencrypt flows that exercise these models end-to-end.
- **`src/modules/invoicing/tests/unit/render.test.ts`** – Unit tests for the render pipeline against frozen document fixtures.

## Notes

- **No JSON serialization path exists.** Unlike other models in the codebase, there is no `toJSON`/`toObject` transform. If a consumer needs a plain-object shape, they must go through the renderer or presenter.
- **`timestamps: true` is set but `updatedAt` is never meaningful.** Documents are frozen at issue; only `createdAt` (an operational fact) is expected to be written. `issuedAt` is the legal timestamp.
- **`productId` is absent on credit-note lines.** It is only present on invoice lines, where it allows a credit note for returned goods to look up the original sale rate.
- **Numbering counters are per-series.** An invoice counter and a credit-note counter are separate collections (`InvoiceNumberCounter`, `CreditNoteNumberCounter`); a credit note will never "borrow" a number from the invoice sequence.
- **Unique indexes are the idempotency guarantee.** The event bus does not de-duplicate; the database constraint (`invoices_orderId`, `creditNotes_refundId`) is what prevents double-issuance.
- **`shippingCost` is optional** and its absence mirrors the order's own field—do not assume it is always present when computing totals.
