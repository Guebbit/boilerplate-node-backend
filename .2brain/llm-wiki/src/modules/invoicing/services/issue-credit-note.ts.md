---
source: src/modules/invoicing/services/issue-credit-note.ts
sha256: 23196094db0e413892ab4e48b5dfc212d9ca68de9f028318d8bfe7a5b9d9eded
generated_at: 2026-10-14T16:08:57.820829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-credit-note.ts

## Purpose

Issues a credit note in response to a settled payment refund (`PAYMENT_REFUNDED` event). A full refund mirrors the original invoice's lines and totals verbatim; a partial refund re-derives the refunded share via the domain's `creditShares` logic. One credit note is created per refund, so an order refunded in parts accumulates one note per part.

## Key elements

- **`RefundedInput`** (exported interface) — the minimal refund payload the service consumes: `orderId`, `refundId`, `amount`, `full`, and optional `goods` (the specific items the refund pays back).
- **`issueCreditNote(input)`** (exported) — the main entry point. Looks up the invoice for the order, computes the reversed figures, then allocates a credit-note number and inserts the note **inside a single transaction** (with the order-timeline append). Returns `undefined` (never throws) when no invoice exists.
- **`findCreditNotesForOrder(orderId)`** (exported) — reads all credit notes for an order, oldest first; backs `GET /orders/{id}/credit-notes`.
- **`findCreditNoteForOrderById(orderId, creditNoteId)`** (exported) — reads one credit note scoped to an order (returns `null` if it belongs to a different order); backs `GET /orders/{id}/credit-notes/{id}`.
- **`creditableOf`** (internal) — flattens an `InvoiceDocument` into the plain-data `CreditableInvoice` shape the domain split expects.
- **`reversedFigures`** (internal) — returns the frozen figures (lines, totals, tax summary, shipping) for either a full or partial refund.
- **`readWinner`** (internal) — a `catch` handler that, on a duplicate-key error, re-reads the credit note the winning race wrote and returns it instead of throwing.

## Relationships

- **`issue-invoice.ts`** — imports `findInvoiceForOrder` to locate the invoice being reversed.
- **`numbering.ts`** — imports `allocateCreditNoteNumber` to assign the sequential document number within the transaction.
- **`credit-breakdown.ts`** — imports `creditBreakdownOf` to recompute totals (net, tax, shipping) for a partial refund's line set.
- **`domain/credit-shares.ts`** (via `../domain`) — imports `creditShares` and the `CreditableInvoice` / `RefundedGoods` types for the partial-refund split.
- **`pii.ts`** — imports `decryptInvoiceParty` / `encryptInvoiceParty` to re-encrypt the billing address under the credit note's own `_id`.
- **`repository.ts`** — imports `invoicingRepository` for `insertCreditNote`, `findCreditNoteByRefundId`, `findCreditNotesByOrderId`, `findCreditNoteById`.
- **`model.ts`** — imports `CreditNoteDocument` / `InvoiceDocument` types.
- **`@infrastructure/runtime/database`** — uses `withTransaction` to make number-allocation + insert + timeline append atomic.
- **`@infrastructure/persistence/mongo-errors`** — uses `isDuplicateKey` in the race-resolution path.
- **`@infrastructure/i18n`** — uses `translator` to localise the partial-refund line label.
- **`@modules/orders`** (external) — uses `orderService.appendTimeline` to record the `credit_note_issued` event and `orderTotal` to compute the partial-refund grand total.

## Notes

- **No-op on missing invoice is intentional.** A `undefined` return (not an exception) signals "nothing to correct." This covers the narrow race where a refund lands before the invoice is frozen, or legacy data predating the module.
- **Race safety is two-layered.** The `_id` and `issuedAt` are generated *before* the transaction so a MongoDB retry reuses them. If the same refund is credited concurrently, the duplicate-key on `refundId` aborts the transaction (rolling back the number and timeline), and `readWinner` surfaces the winning note to the caller.
- **PII re-encryption.** The billing address is decrypted under the *invoice's* context and re-encrypted under the *credit note's* context (`'credit-note'`, new `_id`). Never pass the raw ciphertext between documents.
- **`grandTotal` for partial refunds** is recomputed via `orderTotal` from the credit-share lines rather than copied from the invoice; the full-refund path simply mirrors the invoice's stored total.
