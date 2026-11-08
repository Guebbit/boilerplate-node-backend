---
source: src/modules/invoicing/model.ts
sha256: 25d1ed45ac1945bbdaae39226c8041632fcdcc87e8941f40e3f855622976366b
generated_at: 2026-11-08T06:11:38.648682+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/model.ts

## Purpose

Defines the Mongoose schemas, TypeScript interfaces, and model exports for issued invoices, credit notes, and their shared yearly numbering counters. Every field is frozen at issue time and never re-read from the source order or operator config; the documents are never serialized to JSON — the rendered PDF is the sole output.

## Key elements

- **`FrozenTaxDocument`** — Shared interface for all fields both an invoice and a credit note carry (party, lines, tax totals, taxSummary, shipping figures, currency, locale, timezone, number, `issuedAt`, `buyerErasedAt`, etc.).
- **`InvoiceDocument` / `InvoiceModel` / `invoiceModel`** — Schema + model for an issued invoice. Unique index on `orderId`; non-unique index on `issuedAt`.
- **`CreditNoteDocument` / `CreditNoteModel` / `creditNoteModel`** — Extends `FrozenTaxDocument` with `refundId`, `invoiceId`, `invoiceNumber`. Unique index on `refundId` (idempotency); compound index on `{ orderId, issuedAt }`.
- **`InvoiceLine`** — One frozen product line: `productId?`, `title`, `quantity`, `unitPrice` (Decimal128 via `moneyPath`), `taxRate`, `rateType?`. No per-line net/tax/gross; the render pipeline re-derives those.
- **`InvoiceParty` / `InvoiceSeller`** — Embedded address / legal-identity schemas (`_id: false`).
- **`NumberCounterDocument` / `NumberCounterModel`** — One document per calendar year holding `{ _id: year, seq }` for each series (invoice, credit-note) so the two sequences never overlap.
- **`frozenTaxDocumentFields`** — Single source of truth for the shared schema fields; spread into both the invoice and credit-note schemas to prevent drift.
- **`moneyPlugin`** — Applied to both document schemas; stores money as Decimal128 and yields decimal text on lean reads.

## Relationships

- **`@infrastructure/persistence/money-field`** — Supplies `moneyPath` (used in every monetary field definition) and `moneyPlugin` (registered on both schemas).
- **`repository.ts`** — The sole writer/reader of `invoiceModel` and `creditNoteModel`; its duplicate-key guard relies on the unique indexes declared here.
- **`services/issue-invoice.ts` / `services/issue-credit-note.ts`** — Populate `frozenTaxDocumentFields` at issue time; read `numberCounterModel` for the next sequence.
- **`services/render.ts`** — Reads the frozen documents and produces the PDF; re-derives per-line tax via `orderTaxBreakdown`.
- **`emails.ts`** — Reads `rateType` + `taxRate` from `InvoiceLine` to emit the correct EN 16931 VAT category code.
- **`pii.ts`** — Writes `buyerErasedAt` when `reap:invoices` removes the buyer block after tax retention.
- **`tests/integration/issue-invoice.test.ts` / `issue-credit-note.test.ts` / `credit-note-catch-up.test.ts`** — Integration tests exercising creation, idempotency (unique-index behavior), and numbering.

## Notes

- Neither schema defines a `toJSON` / `toObject` transform — by design, the documents are never exposed as JSON. Any code path that tries to serialize one will get raw Mongoose internals.
- `timestamps: true` is set on both schemas, but documents are write-once; `updatedAt` is unused. `issuedAt` is the legal timestamp, `createdAt` is operational.
- `taxSummary` and `shippingByRate` must sum exactly to `netTotal`/`taxTotal` (BR-CO-17); the render pipeline enforces this, but the schema does not.
- The numbering counter is one collection per series (invoice vs. credit-note), not one shared counter — a credit note can never consume an invoice's next number.
- `unitPrice` is a **gross** (VAT-inclusive) price; `taxRate` is a decimal fraction (0.22 = 22 %). Do not confuse with a percentage integer.
