---
source: src/modules/invoicing/services/issue-credit-note.ts
sha256: e5bdf31f6948faa7bcab75eb09d48ff0f3c60f15a9ad79de195626110ab0c559
generated_at: 2026-10-29T04:14:32.700240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-credit-note.ts

## Purpose

Issues a numbered credit note for a settled refund against an existing invoice. Full refunds mirror the original invoice's lines and totals; partial refunds carry only the refunded share (split across VAT rates via `creditShares`). One credit note per refund event, so an order refunded in parts yields multiple notes. Called exclusively by the `PAYMENT_REFUNDED` listener in `module.ts`.

## Key elements

- **`RefundedInput`** (interface) — the payload shape the caller passes: `orderId`, `refundId`, `amount`, `full` (boolean), and optional `goods` (`RefundedGoods`) for partial refunds targeting specific items.
- **`creditableOf`** (private) — adapts an `InvoiceDocument` into the plain-data `CreditableInvoice` shape the domain's `creditShares` function expects (string ids, line arrays, tax metadata).
- **`reversedFigures`** (private) — returns the frozen monetary fields for the credit note. For a full refund it copies the invoice's figures directly; for a partial refund it calls `creditShares` + `creditBreakdownOf` to re-derive lines, totals, and tax summary.
- **`issueCreditNote`** (exported, `@internal`) — the main entry point. Looks up the invoice, allocates a credit-note number and inserts the note in a single transaction, appends an order timeline entry, and on race/insert failure resolves to the existing note via `readWinner`. Returns `undefined` (never throws) when no invoice exists.
- **`findCreditNotesForOrder`** (exported) — read helper: all credit notes for an order, oldest first.
- **`findCreditNoteForOrderById`** (exported) — read helper: one credit note scoped to an order, or `null`.
- **`creditSettledRefunds`** (exported) — catch-up after a late/revived invoice: sequentially issues a credit note for each previously settled refund that had no note yet.

## Relationships

- **`module.ts`** — the `PAYMENT_REFUNDED` event listener is the sole caller of `issueCreditNote`; `creditSettledRefunds` is invoked after a revived invoice event.
- **`issue-invoice.ts`** — `findInvoiceForOrder` is used to locate the invoice the credit note corrects.
- **`numbering.ts`** — `allocateCreditNoteNumber` assigns the sequential number inside the transaction; `readWinner` resolves duplicate-insert races.
- **`credit-breakdown.ts`** — `creditBreakdownOf` aggregates the partial-refund line array into net/tax/shipping totals and `taxSummary`.
- **`domain/credit-shares.ts`** — `creditShares` splits the refunded amount across line items and VAT rates; `CreditableInvoice` / `RefundedGoods` types shape the input.
- **`domain/tax-items.ts`** — `asTaxItems` converts credit-note lines into the shape `orderTotal` expects for the grand-total computation.
- **`pii.ts`** — `decryptInvoiceParty` / `encryptInvoiceParty` re-encrypt the billing address under the credit note's own `_id` and kind.
- **`repository.ts`** — `invoicingRepository` performs the `insertCreditNote`, `findCreditNotesByOrderId`, `findCreditNoteById`, and `findCreditNoteByRefundId` operations.
- **`model.ts`** — provides the `CreditNoteDocument` and `InvoiceDocument` types.
- **`infrastructure/runtime/database.ts`** — `withTransaction` wraps the number-allocation + insert + timeline append in a single Mongo transaction.
- **`infrastructure/i18n/index.ts` / `context.ts`** — `translator(invoice.locale)` produces the localized label for partial-refund lines.
- **`services/index.ts`** — re-exports this module's public functions for the `invoicingService` barrel.

## Notes

- `issueCreditNote` is deliberately **not** on the public `invoicingService` surface; only the module's own event listener may call it.
- The transaction is designed to be **retry-safe**: the `_id` and `issuedAt` are fixed *before* the transaction, and `allocateCreditNoteNumber` reuses the same id on re-run. A duplicate-insert (same `refundId`) causes the transaction to abort and `readWinner` returns the winner's note.
- When no invoice exists the function returns `undefined` silently — this covers late payments on cancelled orders and amount-mismatch cases (no supply → no document, per VAT Directive Art. 2(1)(a), 65).
- `creditSettledRefunds` iterates **sequentially** (not `Promise.all`) to preserve the allocation order of credit-note numbers (oldest refund first).
- The credit note inherits `timezone`, `currency`, `locale`, and `seller` from the invoice so it "reads like the invoice it corrects."
