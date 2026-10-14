---
source: src/modules/invoicing/services/issue-invoice.ts
sha256: 0460400c8cb6743ce5b1531cf16b6e2cae8a8db3460ae1489f37a6d01fd998bf
generated_at: 2026-10-14T16:09:27.136435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-invoice.ts

## Purpose

Freezes a paid order into an immutable invoice. This is the single write path the invoicing module performs in response to `ORDER_STATUS_CHANGED` (`to: 'paid'`), delegated by `module.ts`'s listener. The operation is idempotent: a redelivered event or a racing settlement that loses the duplicate-key race reads back the winner's row instead of inserting a second invoice.

## Key elements

- **`issueInvoice(order)`** (exported) — Allocates the invoice number and inserts the invoice (plus the order's timeline entry) inside a single MongoDB transaction. On duplicate-key failure, delegates to `readWinner` to return the already-written invoice. Returns `undefined` for an order with zero lines.
- **`findInvoiceForOrder(orderId)`** (exported) — Thin read wrapper over `invoicingRepository.findInvoiceByOrderId`; the canonical lookup used by `GET /orders/{id}/invoice` and by `issue-credit-note.ts`.
- **`frozenSeller()`** (module-private) — Builds the `InvoiceSeller` block from `shopIdentity()`; only `vatNumber` is optional.
- **`frozenLines(order)`** (module-private) — Maps order items to `InvoiceLine[]` (id, title, qty, unit price, tax rate, optional rate type). Deliberately omits per-line net/tax/gross figures.
- **`readWinner(orderId)`** (module-private) — `catch` handler that rethrows non-duplicate errors; on duplicate-key, resolves to the existing invoice or rethrows if `findOne` inexplicably returns nothing.

## Relationships

- **`@modules/orders`** (`orders/index.ts`) — Imports `orderService` (timeline append), `orderTaxBreakdown`, `orderTotal` (grand total), `shopIdentity`, `billingAddressOf`, and the `OrderDocument` type. `grandTotal` is computed with the *same* `orderTotal` function that `orders/model.ts#applyOrderTotals` uses, guaranteeing consistency.
- **`../repository`** — All invoice reads/writes go through `invoicingRepository`; no direct Mongoose model access here.
- **`../pii`** — `encryptInvoiceParty` re-encrypts the billing address under the invoice's own `_id` (the order stored it under its own).
- **`./numbering`** — `allocateInvoiceNumber` allocates the sequential number within the transaction session.
- **`../model`** — Type definitions: `InvoiceDocument`, `InvoiceLine`, `InvoiceSeller`.
- **`../module.ts`** — Owns the `ORDER_STATUS_CHANGED` listener that calls `issueInvoice`.
- **`./issue-credit-note.ts`** — Calls `findInvoiceForOrder` to read the invoice a credit note corrects.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the number-allocation → insert → timeline sequence.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` powers the idempotency fallback.
- **`./services/index.ts`** — Re-exports `issueInvoice` and `findInvoiceForOrder` to consumers.
- **`tests/integration/issue-invoice.test.ts`** — Integration test for the race / idempotency path.
- **`src/modules/cart/services/checkout.ts`** — Upstream trigger: checkout finalises the order, which eventually emits the status event this module listens on (indirect; no direct import).

## Notes

- **Retry safety:** `_id` (an `ObjectId`) and `issuedAt` (a `Date`) are allocated *before* `withTransaction` so that a driver-level retry reuses the same values rather than generating new ones.
- **Per-line tax is not stored.** Only `unitPrice`, `taxRate`, and `rateType` are frozen per line. Any consumer needing net/tax/gross must call `orderTaxBreakdown` on those fields (as `emails.ts#buildVatBlock` does), avoiding a second source of truth.
- **Billing address ≠ ship-to.** The buyer address is always the order's own frozen `billingAddress` (Art. 226 requirement). A digital-only order may have no ship-to at all.
- **Locale** is taken from `order.items[0].locale` — the language product titles were resolved into at checkout.
- **Empty orders** (zero items) short-circuit to `undefined` without touching the repository.
- The `invoice_issued` timeline entry commits in the *same* transaction as the invoice insert; the losing side of a race aborts both atomically.
