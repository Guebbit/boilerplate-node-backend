---
source: src/modules/invoicing/tests/integration/retention.test.ts
generated_at: 2026-11-22T05:39:29.182662+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/retention.test.ts

## Purpose
End-to-end integration test for the `reap:invoices` job. It checks that an invoice or credit note loses its buyer block (`billingAddress`) at the end of its tax retention period, keeps all other data, loses its cached PDF, and that a second run is a no-op. It exercises `invoicingService.eraseDueBuyers(now)` against a real test DB and a temp document store.

## Key elements
- **`beforeEach` / `afterEach`**: register the users, products, inventory, orders and invoicing modules, create a temp dir, and point `NODE_DOCUMENT_STORE_PATH` at it. Teardown resets domain events and removes the dir.
- **`invoiceIssuedAt(issuedAt, timezone = 'Europe/Rome')`**: helper that creates a user, product (price `10.00`) and order with a GB billing address. It marks the order paid, waits for the invoice, then overwrites `issuedAt` and `timezone` directly on the model. Returns `{ orderId, invoiceId }`.
- **`invoiceBuyer` / `creditNoteBuyer`**: read the `billingAddress` still stored on an invoice or credit note.
- **Test cases** (`describe('reap:invoices')`):
  - Buyer is erased once local New Year of issue year + 11 arrives, and not a minute earlier. The report is `{ invoices: 1, creditNotes: 0 }` and `buyerErasedAt` is set to the run time.
  - An invoice issued 31 Dec 23:30 UTC counts into the next year (Rome time), so it is not erased yet.
  - All other fields and `sumInvoices` stats totals are unchanged after erasure. Only `billingAddress`, `buyerErasedAt` and `updatedAt` are ignored in the comparison.
  - A credit note is judged on its own `issuedAt`, not its invoice's. In the test, the 2015 invoice is erased and the 2020 note is kept.
  - The cached PDF `invoice-<id>.pdf` is deleted, and other files in the store are left alone.
  - A second run reports `{ invoices: 0, creditNotes: 0 }`.

## Relationships
- Calls `invoicingService` (`src/modules/invoicing/services/index.ts`) for `eraseDueBuyers`, and `invoicingRepository.sumInvoices` (`src/modules/invoicing/repository.ts`) for the totals check.
- Uses `invoiceModel` / `creditNoteModel` (`src/modules/invoicing/model.ts`) to read stored buyers and to backdate `issuedAt`.
- Uses `issueCreditNote` and `waitForInvoice` from `src/modules/invoicing/tests/factories.ts`. `issueCreditNote` fronts the credit-note service (`src/modules/invoicing/services/issue-credit-note.ts`).
- Uses `createOrder`/`toOrderItem` from `src/modules/orders/tests/factories.ts`, plus `createProduct` and `createUser` from the products and users test factories.
- Calls `markPaid` (`src/modules/orders/friends/payments.ts`) to trigger invoice creation. The `waitForInvoice` helper implies the invoice is created asynchronously, via domain events.
- `registerModules` (`src/kernel/registry.ts`) wires up the orders, products, inventory, users and invoicing modules (`src/modules/orders/module.ts`, `src/modules/products/module.ts`, `src/modules/inventory/module.ts`, `src/modules/invoicing/module.ts`). `resetDomainEvents` (`src/kernel/events.ts`) cleans up between tests.
- `writeDocument` (`src/infrastructure/adapters/document-store.ts`) seeds the PDF files that the erasure is expected to delete.

## Notes
- The retention rule asserted here is "local New Year of (issue year + 11)", evaluated in the invoice's stored timezone. The first test pins the boundary: `2025-12-31T22:59Z` is not due and `23:30Z` is.
- Tests backdate `issuedAt` via direct model updates, so invoice issuance still runs normally.
- The credit-note test expects the invoice to be erased but the credit note to stay, because the note's own issue date (2020) is still within retention.
