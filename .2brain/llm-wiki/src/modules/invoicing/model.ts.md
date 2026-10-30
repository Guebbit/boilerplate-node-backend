---
source: src/modules/invoicing/model.ts
sha256: 0812448ac2580e536ab5e1f11702cea43748db4c3fd94a59d57622d3a45e8079
generated_at: 2026-10-29T04:12:13.496078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/model.ts

## Purpose

Defines the Mongoose schemas, embedded sub-schemas, and exported models for issued **invoices** and **credit notes**, plus the shared yearly numbering-counter model. Both document types are *frozen at issue*: every field is copied once from the source order (or invoice, for credit notes) and never updated or re-joined. Neither document is ever serialized to JSON—the only output path is a rendered PDF—so no serialization transforms are defined here.

## Key elements

- **`InvoiceLine`** – Embedded line item: `productId`, `title`, `quantity`, `unitPrice` (gross, VAT-inclusive), `taxRate` (decimal 0–1), and optional `rateType`. Per-line net/tax splits are *not* stored; the render pipeline re-derives them.
- **`InvoiceParty` / `partySchema`** – Frozen postal address (buyer billing address). `_id: false`.
- **`InvoiceSeller` / `sellerSchema`** – Seller legal identity (legal name, VAT number, address). All fields optional; `_id: false`.
- **`FrozenTaxDocument`** – Shared field set for both invoice and credit note: `orderId`, `number`, `issuedAt`, `timezone`, `currency`, `locale`, `orderNumber`, `billingAddress`, `buyerErasedAt`, `seller`, `lines`, shipping/tax/grand totals, `taxSummary`, `shippingByRate`.
- **`InvoiceDocument` / `invoiceModel`** – One invoice per order. Unique index on `orderId`. `timestamps: true` (only `createdAt` is operationally meaningful).
- **`CreditNoteDocument` / `creditNoteModel`** – Extends `FrozenTaxDocument` with `refundId`, `invoiceId`, `invoiceNumber`. Unique index on `refundId` (idempotency for at-most-once refund events). Composite index `{orderId, issuedAt}` for per-order listing.
- **`NumberCounterDocument` / `NumberCounterModel`** – One document per calendar year holding a running `seq`. Shared schema for both the invoice and credit-note numbering series.
- **`frozenTaxDocumentFields`** – Single object of Mongoose path definitions shared by both schemas to prevent drift.
- **Money fields** – All monetary paths use `moneyPath({ required: true })` from `money-field.ts`; both schemas apply `moneyPlugin` so Decimal128 is stored and lean reads return numbers.

## Relationships

- **`money-field.ts`** – Source of `moneyPath` (path definition helper) and `moneyPlugin` (Decimal128 → number lean-read transform). Every monetary field in both schemas routes through this module.
- **`repository.ts`** – Owns the CRUD wrappers; its duplicate-key guard (backed by the `unique` indexes declared here) is what makes redelivered events idempotent.
- **`services/issue-invoice.ts` / `services/issue-credit-note.ts`** – Write new `InvoiceDocument` / `CreditNoteDocument` instances; they populate every `FrozenTaxDocument` field before the first insert.
- **`services/render.ts`** – Reads the frozen fields and re-derives per-line tax breakdowns via the shared `orderTaxBreakdown` pure function; never writes back.
- **`presenter.ts`** – The PDF rendering pipeline that is the *only* consumer of these documents' data.
- **`emails.ts`** – Reads `InvoiceLine.rateType` alongside `taxRate` to emit the EN 16931 `Z` (zero-rated) vs `E` (exempt) VAT category code.
- **`pii.ts`** – Governs the `buyerErasedAt` lifecycle (reap job removes the buyer block after tax retention).
- **`services/reencrypt.ts`** – Re-encrypts PII fields on the frozen documents when key rotation occurs.
- **`index.ts`** – Module barrel; re-exports the models and types for external consumers.
- **Integration tests** (`issue-invoice`, `issue-credit-note`, `credit-note-catch-up`) – Exercise the full write path against a real MongoDB, verifying index-backed idempotency and frozen-field integrity.

## Notes

- **No JSON serialization exists.** Unlike every other model in the codebase, there is no `toJSON` transform or API-layer projection. The documents are write-once, read-only-by-render.
- **`taxRate` is stored as a decimal (e.g. `0.22`), not a percentage.** The schema enforces `min: 0, max: 1`.
- **`unitPrice` is gross (VAT-inclusive)**, matching how `OrderLineProduct.price` freezes it. Do not treat it as net.
- **`orderId` is never populated.** The document outlives the order's account link; there is no virtual ref to resolve.
- **`timestamps: true` is present but `updatedAt` is never set** (documents are never updated). It is harmless but do not rely on it.
- **`frozenTaxDocumentFields` is the single source of truth** for shared path definitions. Adding a field to only one schema without updating this object is the primary drift risk.
- **Numbering is per-series and gap-free** (see `services/numbering.ts`). The counter collection name differs between invoices and credit notes, but the schema is shared.
