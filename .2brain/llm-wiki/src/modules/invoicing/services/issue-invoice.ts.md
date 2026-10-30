---
source: src/modules/invoicing/services/issue-invoice.ts
sha256: 9602ba163c8dfb416be13f58a70926443350d10ec85bfad579dfc2fb228c87be
generated_at: 2026-10-29T04:14:52.149449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-invoice.ts

## Purpose

Freezes a paid order into a numbered, PII-encrypted invoice document. This is the single write path the invoicing module performs in response to an `ORDER_STATUS_CHANGED → paid` event, and it is idempotent by construction: a redelivered event or a racing settlement on the same order both attempt the same insert, and the duplicate-key failure aborts the loser's transaction (including the number allocation) while it falls back to reading the winner's row.

## Key elements

- **`issueInvoice(order)`** — The main export. Validates the order has lines, derives the VAT breakdown via `orderTaxBreakdown`, allocates a fixed `_id` and `issuedAt` *before* the transaction (so retries are stable), then inside one `withTransaction`: allocates an invoice number, inserts the invoice (encrypting the billing address under the invoice's own id), and appends an `invoice_issued` timeline entry to the order. On duplicate-key, calls `readWinner` to return the existing invoice.
- **`findInvoiceForOrder(orderId)`** — Exposed read used by the `GET /orders/{id}/invoice` endpoint and by `issue-credit-note.ts` to look up what a credit note corrects. Thin pass-through to the repository.
- **`frozenSeller()`** *(internal)* — Snapshots the shop's legal identity at issue time into the `InvoiceSeller` shape; `vatNumber` is the only optional field.
- **`frozenLines(order)`** *(internal)* — Maps order items to `InvoiceLine` entries (title, qty, unit price, tax rate, optional `rateType`). Deliberately does **not** store per-line net/tax/gross; those are re-derived at render time.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/runtime/database.ts` | Imports `withTransaction` for the atomic number-allocate + insert + timeline sequence. |
| `modules/orders/index.ts` (barrel) | Imports `orderService` (billing address, timeline append), `orderTaxBreakdown`, `orderTotal`, and the `OrderDocument` type. |
| `modules/orders/domain/totals.ts` | Source of `orderTaxBreakdown` and `orderTotal`; the invoice's `grandTotal` reuses `orderTotal` so it can never drift from the order's own figure. |
| `modules/orders/model.ts` | Referenced in a comment: `applyOrderTotals` is the same function that produced the order's stored totals; the invoice mirrors it rather than recomputing. |
| `modules/invoicing/model.ts` | Imports the `InvoiceDocument`, `InvoiceLine`, `InvoiceSeller` types used throughout. |
| `modules/invoicing/pii.ts` | Imports `encryptInvoiceParty` to encrypt the billing address under the invoice's `_id`. |
| `modules/invoicing/repository.ts` | Imports `invoicingRepository` for `insertInvoice` and `findInvoiceByOrderId`. |
| `modules/invoicing/services/numbering.ts` | Imports `allocateInvoiceNumber` and `readWinner` (the duplicate-key recovery path). |
| `modules/invoicing/services/issue-credit-note.ts` | Calls `findInvoiceForOrder` to locate the invoice a credit note corrects. |
| `modules/shop/index.ts` (barrel) | Imports `shopIdentity` and `shopTimezone` for the frozen seller block and the stored timezone. |

## Notes

- **Idempotency is structural, not advisory.** The `_id` and `issuedAt` are allocated *before* the transaction so a driver re-run or a competing writer both produce the same key; the unique constraint on the invoice number then guarantees exactly one row survives. There is no `SELECT … FOR UPDATE` or application-level lock.
- **Billing vs. ship-to.** The buyer address is read from the order's own frozen `billingAddress` (set at checkout). A digital-only order may have no ship-to; the code must never substitute one for the other.
- **Locale is frozen at `items[0].locale`** — the language in which product titles were resolved at checkout — not the current shop locale.
- **No per-line tax split is stored.** `buildVatBlock` (in the email layer) re-derives net/tax/gross from the same fields via `orderTaxBreakdown`. Storing both would create a second source of truth.
- **The timeline row is inside the same transaction.** If the insert wins the race, the timeline commit succeeds; if it loses, the entire transaction (number allocation + insert + timeline) rolls back together.
