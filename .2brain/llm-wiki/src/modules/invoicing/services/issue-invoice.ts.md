---
source: src/modules/invoicing/services/issue-invoice.ts
source_sha256: 0a167fc6669a96b112e7432626e2aa6825801fe08003cb72f60380bc05ecedf7
context_sha256: 97fc283ce93a22304370286ea8dafc6f46fe27ecad6c9246e59a755ef8d1fa40
generated_at: 2026-11-22T05:35:48.986860+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/issue-invoice.ts

## Purpose
Freezes a paid order into its invoice. It is the single write the invoicing module makes in response to `ORDER_STATUS_CHANGED` (`to: 'paid'`), called from `module.ts`'s listener. It is idempotent: if an event is redelivered or two settlements race on the same order, only one invoice is created and the other caller gets the existing one.

## Key elements
- **`issueInvoice(order)`**: Builds and persists the invoice for an order.
  - Returns `undefined` if the order has no items.
  - Computes the tax breakdown with `orderTaxBreakdown`.
  - Mints the `_id` and `issuedAt` before the transaction, so a driver retry reuses them.
  - Inside `withTransaction`, allocates the number, inserts the invoice, and appends an `invoice_issued` timeline entry to the order.
  - On failure, the `.catch(readWinner(...))` handler reads the winning invoice instead.
- **`frozenSeller()`**: Snapshots the operator identity (`legalName`, optional `vatNumber`, address) fresh at each issue. Only the VAT number can be absent.
- **`buyerOf(address)`**: Maps the order's billing address to an `InvoiceParty`: name, postal fields, and VAT number if present. It deliberately omits the phone number (data minimisation).
- **`frozenLines(order)`** (not exported): Maps order items to `InvoiceLine`s (product id, title, quantity, unit price, tax rate, and `rateType` when present). Net/tax/gross per line is not stored.
- **`findInvoiceForOrder(orderId)`**: Returns the live invoice for an order or `null`. It is the service's door onto the repository read.

## Relationships
- **`../repository`**: Its `invoicingRepository` inserts the invoice and backs `findInvoiceForOrder` through `findInvoiceByOrderId`.
- **`./numbering`**: `allocateInvoiceNumber` assigns the number inside the transaction. `readWinner` handles the lost-race recovery.
- **`../pii`**: `encryptInvoiceParty` re-encrypts the buyer block under the invoice's own id.
- **`../model`**: Supplies the `InvoiceDocument`, `InvoiceLine`, `InvoiceParty` and `InvoiceSeller` types.
- **`@infrastructure/runtime/database`**: `withTransaction` provides the session.
- **`@modules/orders`**: Supplies `orderService` (`billingAddressOf`, `appendTimeline`), `orderTaxBreakdown`, `orderTotal` and the `OrderDocument` type.
- **`@modules/account`**: `operatorIdentity` provides the seller data.
- **`./issue-credit-note`** (`src/modules/invoicing/services/issue-credit-note.ts`): Uses `findInvoiceForOrder` to read the invoice a credit note corrects.

## Notes
- The transaction covers the number allocation, the invoice insert and the timeline append. If a racing writer hits a duplicate-key error, the transaction aborts, the number is returned, and the loser reads the winner's row.
- The buyer address is the order's own frozen `billingAddress`, not the ship-to address, because digital-only orders have no ship-to. If the order has no billing address, the invoice omits the field.
- The invoice locale is `order.items[0].locale`.
- `grandTotal` comes from `orderTotal(order)`, the same function the order model and the placed-order email use. It is not a hand-composed sum, so it cannot drift from what the order charged.
- The tax breakdown is not stored per line. `emails.ts#buildVatBlock` re-derives it via `orderTaxBreakdown`.
