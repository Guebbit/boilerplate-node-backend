---
source: src/modules/invoicing/services/issue-credit-note.ts
source_sha256: d3b202b10bd0bb48f3f1f2682cce9437c46e1c9a6ff9070040688126cf8db236
context_sha256: fc0fb70830a6b45c4b97539944dacf7bc79fab4725304cbd60dd8d8307abe328
generated_at: 2026-11-22T05:35:32.570820+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/issue-credit-note.ts

## Purpose
Freezes and numbers a credit note for a refund. It is the work behind this module's `PAYMENT_REFUNDED` listener in `module.ts`. One credit note is issued per refund. A full refund mirrors the original invoice's lines and totals. A partial refund carries only the refunded share, so an order refunded in parts gets one note per part.

## Key elements
- `RefundedInput` — the refund payload this module needs: `orderId`, `refundId`, `amount` (gross decimal string), `full` flag, and optional `goods` (`RefundedGoods`).
- `issueCreditNote(input)` — main entry point, marked `@internal` and not on `invoicingService`.
  - Resolves to `undefined` (no throw) when the order has no invoice.
  - Otherwise it mints the note's `_id` and `issuedAt` before the transaction so a retry reuses them.
  - Inside `withTransaction` it allocates the number, inserts the credit note, and appends the order timeline row.
  - If a concurrent issuer already created the note for this refund, `readWinner` falls back to `findCreditNoteByRefundId`.
- `findCreditNotesForOrder(orderId)` — all credit notes for an order, oldest first. Backs `GET /orders/{id}/credit-notes`.
- `findCreditNoteForOrderById(orderId, creditNoteId)` — one note scoped to its order, or `null`. Backs `GET /orders/{id}/credit-notes/{creditNoteId}`.
- `creditSettledRefunds(orderId)` — catch-up after a revived invoice event. It loads settled refund payloads and calls `issueCreditNote` for each, sequentially.
- Private helpers:
  - `creditableOf` converts an invoice to the plain `CreditableInvoice` shape, with ids as strings.
  - `reversedFigures` returns `mirrorOf(invoice)` for a full refund. For a partial refund it calls `creditShares(...)` and then `figuresOfLines`.
  - `appendIssuedRow` records a `credit_note_issued` timeline event on the order in the same session.
  - `allocateWhileLive` re-reads the order's invoice in the transaction and allocates the number only if it is still the live invoice.

## Relationships
- `./issue-invoice` — `findInvoiceForOrder` supplies the invoice to reverse.
- `./numbering` — `allocateCreditNoteNumber` allocates the number, and `readWinner` resolves a lost race.
- `./figures` — `mirrorOf` and `figuresOfLines` build the frozen `DocumentFigures`.
- `../domain` (`credit-shares.ts`) — `creditShares` splits a partial refund across VAT rates. The `CreditableInvoice` and `RefundedGoods` types come from here too.
- `../repository` — `invoicingRepository` provides `findInvoiceByOrderId`, `insertCreditNote`, `findCreditNoteByRefundId`, `findCreditNotesByOrderId` and `findCreditNoteById`.
- `../pii` — the billing address is decrypted under the invoice's id and re-encrypted under the note's id.
- `../model` — supplies the `InvoiceDocument` and `CreditNoteDocument` types.
- `@infrastructure/runtime/database` — `withTransaction`.
- `@infrastructure/i18n` — `translator` localizes the partial-refund line label.
- `module.ts` calls `issueCreditNote`.

## Notes
- Skipping when no invoice exists is deliberate. A refund with no sale behind it (a late payment on a canceled order, an amount mismatch) has no supply and needs no document. Alternatively, the invoice event died. In that case reviving it issues the invoice, and `creditSettledRefunds` then catches up.
- `allocateWhileLive` guards against a buyer-correction race. A correction cancels the invoice and issues a new one in a transaction that writes the same counter, so the two conflict. A refund that finds its invoice cancelled throws, and the outbox retries it against the new live invoice.
- Idempotency relies on `refundId` being unique. A repeated refund returns the existing note, and a lost race aborts the transaction, which releases the allocated number.
- `creditSettledRefunds` runs sequentially on purpose, so credit-note numbers are allocated oldest refund first.
- The note copies the invoice's `timezone`, `currency`, `locale`, `orderNumber` and `seller`, so it reads like the invoice it corrects.
