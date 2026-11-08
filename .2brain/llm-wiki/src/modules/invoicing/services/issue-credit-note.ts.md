---
source: src/modules/invoicing/services/issue-credit-note.ts
sha256: 9e4e9d6bb027c3b6590de05f5e45816064491913ccc56df449e1676890af6028
generated_at: 2026-11-08T06:14:39.628567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-credit-note.ts

## Purpose

Handles the issuance of credit notes in response to settled payment refunds. For a full refund it mirrors the original invoice's lines and totals wholesale; for a partial refund it re-derives the refunded share across the applicable VAT rates. It is the entire job of the `PAYMENT_REFUNDED` listener wired up in `module.ts`.

## Key elements

- **`RefundedInput`** – Interface describing the refund payload (order, refund id, gross amount, full/partial flag, optional refunded goods).
- **`creditableOf`** – Maps an `InvoiceDocument` into the domain's `CreditableInvoice` shape (plain data, ids as strings) for the split logic.
- **`reversedFigures`** – Returns the lines and totals a credit note carries: direct copy for a full refund; `creditShares` + `creditBreakdownOf` re-derivation for a partial one.
- **`issueCreditNote`** *(exported, `@internal`)* – Allocates an `_id` and `issuedAt` **before** the transaction (retry-safe), then within one transaction: allocates a credit-note number, inserts the note via the repository, appends an order-timeline row. On a lost race the `readWinner` catch returns the existing note. Returns `undefined` (never throws) when no invoice exists for the order.
- **`findCreditNotesForOrder`** *(exported)* – Lists all credit notes for an order, oldest first.
- **`findCreditNoteForOrderById`** *(exported)* – Fetches a single credit note scoped to an order; `null` if it belongs to a different order.
- **`creditSettledRefunds`** *(exported)* – Catch-up path after a revived invoice event: iterates settled refund payloads **sequentially** (numbering must stay in order) and calls `issueCreditNote` for each.

## Relationships

- **`module.ts`** – Owns the `PAYMENT_REFUNDED` event listener that calls `issueCreditNote`; this file is deliberately `@internal` to that listener only.
- **`issue-invoice.ts`** – Provides `findInvoiceForOrder`, the lookup that gates whether a credit note can be issued at all.
- **`numbering.ts`** – `allocateCreditNoteNumber` (within the transaction) and `readWinner` (race-loser recovery).
- **`credit-breakdown.ts`** – `creditBreakdownOf` computes the net/tax/shipping split for partial-refund lines.
- **`../domain/credit-shares.ts`** – `creditShares` allocates the refunded amount across invoice lines and VAT rates; also exports `CreditableInvoice`, `RefundedGoods`.
- **`../domain/tax-items.ts`** – `asTaxItems` converts credit-note lines into the shape `orderTotal` expects.
- **`../domain/index.ts`** – Barrel re-export of the above domain pieces.
- **`../model.ts`** – `CreditNoteDocument` / `InvoiceDocument` Mongoose schemas used throughout.
- **`../repository.ts`** – `invoicingRepository.insertCreditNote`, `findCreditNotesByOrderId`, `findCreditNoteById`, `findCreditNoteByRefundId`.
- **`../pii.ts`** – `decryptInvoiceParty` / `encryptInvoiceParty`: billing address is decrypted under the invoice's key and re-encrypted under the new credit-note key.
- **`@infrastructure/runtime/database.ts`** – `withTransaction` wraps number allocation + insert + timeline append atomically.
- **`@infrastructure/i18n`** – `translator(locale)` resolves the partial-refund line label.

## Notes

- `_id` and `issuedAt` are created **before** `withTransaction` so a driver-level retry reuses the same identity and timestamp instead of allocating a second number.
- The billing address is decrypted with the *invoice's* key and re-encrypted with the *credit note's* key (`'credit-note'`, `_id`); the two documents therefore carry independently encrypted PII.
- `issueCreditNote` returns `undefined` (not `null`, not a throw) when no invoice exists. The JSDoc cites VAT Directive Art. 2(1)(a) / 65 as the legal rationale: no supply, no document.
- `creditSettledRefunds` is intentionally sequential (`for…await`), not parallel, because credit-note numbers must be allocated in refund-age order.
- The `readWinner` catch does **not** re-throw; it looks up the already-inserted note by `refundId` and returns it, so the caller always gets a valid document (or `undefined`).
