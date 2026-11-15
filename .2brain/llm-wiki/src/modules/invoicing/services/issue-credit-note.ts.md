---
source: src/modules/invoicing/services/issue-credit-note.ts
sha256: 9dc37cbcd5a39f08791d9c90c970acadf5d7985ce4dbaa4a4e62e540a90a7fac
generated_at: 2026-11-14T20:13:35.795379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-credit-note.ts

## Purpose

Issues a credit note for each payment refund on an order. Full refunds mirror the original invoice's lines and totals; partial refunds derive only the refunded share (via credit-shares). One credit note per refund, so an order refunded in parts accumulates one per part. Serves as the handler for the `PAYMENT_REFUNDED` event in the invoicing module.

## Key elements

- **`RefundedInput`** (exported interface) — the payload shape: `orderId`, `refundId`, `amount` (decimal string), `full` (boolean), and optional `goods` for partial refunds.
- **`creditableOf`** (internal) — converts an `InvoiceDocument` into the domain's `CreditableInvoice` shape (ids as strings) so `creditShares` can read it.
- **`reversedFigures`** (internal) — computes the frozen figures (lines, net/tax totals, shipping, taxSummary, grandTotal). Full refunds copy the invoice; partial refunds re-derive via `creditShares` + `creditBreakdownOf` + `orderTotal`.
- **`appendIssuedRow`** (internal) — writes a `credit_note_issued` timeline row on the order within the same transaction.
- **`issueCreditNote`** (exported) — the main entry point. Looks up the invoice, allocates a number, inserts the credit note, and appends the timeline row — all in one `withTransaction`. Returns `undefined` (never throws) when no invoice exists. On a lost race (duplicate refund), `readWinner` aborts and returns the already-inserted note.
- **`findCreditNotesForOrder`** (exported) — lists all credit notes for an order, oldest first.
- **`findCreditNoteForOrderById`** (exported) — fetches a single credit note scoped to an order; returns `null` if not found or if it belongs to a different order.
- **`creditSettledRefunds`** (exported) — catch-up after a late/revived invoice event: iterates settled refund payloads sequentially (oldest first) and calls `issueCreditNote` for each. Idempotent via the unique `refundId`.

## Relationships

- **`src/modules/invoicing/module.ts`** — the `PAYMENT_REFUNDED` listener is the sole caller of `issueCreditNote`; this file is deliberately `@internal` and not exposed on `invoicingService`.
- **`src/modules/invoicing/services/issue-invoice.ts`** — provides `findInvoiceForOrder`, which `issueCreditNote` calls to locate the invoice to reverse.
- **`src/modules/invoicing/services/numbering.ts`** — provides `allocateCreditNoteNumber` (in-transaction allocation) and `readWinner` (recovers the existing note when a duplicate refund race aborts the transaction).
- **`src/modules/invoicing/services/credit-breakdown.ts`** — provides `creditBreakdownOf`, used to compute net/tax/shipping splits for partial-refund credit notes.
- **`src/modules/invoicing/domain/credit-shares.ts`** — provides `creditShares` and the `RefundedGoods`/`CreditableInvoice` types; performs the proportional line allocation for partial refunds.
- **`src/modules/invoicing/domain/tax-items.ts`** — provides `asTaxItems`, used in `reversedFigures` to compute the partial refund's grand total via `orderTotal`.
- **`src/modules/invoicing/domain/index.ts`** — barrel re-export consumed for `asTaxItems`, `creditShares`, and domain types.
- **`src/modules/invoicing/pii.ts`** — `decryptInvoiceParty` / `encryptInvoiceParty` re-encrypt the billing address from the invoice's PII context into the credit note's.
- **`src/modules/invoicing/repository.ts`** — `invoicingRepository` performs the `insertCreditNote`, `findCreditNotesByOrderId`, `findCreditNoteById`, and `findCreditNoteByRefundId` operations.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the number-allocation + insert + timeline-append into an atomic unit.
- **`src/infrastructure/i18n/index.ts`** — re-exports `translator`, which supplies the localized label for the partial-refund line.
- **`src/infrastructure/i18n/context.ts`** — provides the translation context consumed by `translator`.
- **`src/modules/invoicing/model.ts`** — defines `CreditNoteDocument` and `InvoiceDocument` used throughout.
- **`src/modules/invoicing/services/index.ts`** — barrel that re-exports this module's public functions.

## Notes

- **No-op, not an error, when no invoice exists.** A refund with no invoice (late payment on a canceled order, amount mismatch) produces no credit note. The docstring cites VAT Directive Art. 2(1)(a) / 65 as the rationale.
- **Race handling.** `allocateCreditNoteNumber` is called inside `withTransaction`; if two concurrent calls race on the same refund, the loser's transaction aborts and `readWinner` returns the winner's already-inserted note.
- **Retry safety.** `_id` and `issuedAt` are fixed *before* the transaction so a Mongoose retry reuses the same identity and date.
- **Sequential catch-up.** `creditSettledRefunds` awaits each `issueCreditNote` in order because credit-note numbers are allocated sequentially (oldest refund first).
- **PII re-encryption.** The billing address is decrypted under the invoice's PII key and re-encrypted under the credit note's own key — it is never stored in plaintext or under a foreign key.
- **Not on `invoicingService`.** Marked `@internal`; the module's event listener is the only sanctioned caller.
