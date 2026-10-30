---
source: src/modules/invoicing/tests/factories.ts
sha256: cbf1d8a22243548070ecc2ae2654dcca4a9ed5778f3e97baa4f062a6d813b2a7
generated_at: 2026-10-29T04:16:11.042935+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/factories.ts

## Purpose

Test-factory helpers for the invoicing module. It provides a single entry point that test files use to wait for a fire-and-forget `ORDER_STATUS_CHANGED` listener to finish freezing an invoice, and re-exports the `issueCreditNote` service so sibling tests can drive it directly without importing the service path themselves.

## Key elements

- **`waitForInvoice(orderId: string)`** — Polls `invoicingRepository.findInvoiceByOrderId` via `eventually` until a frozen invoice exists, then returns it. Throws `Error('the invoice was never frozen')` if the polling window expires.
- **`issueCreditNote` (re-export)** — Re-exports the same symbol from `../services/issue-credit-note` so tests can call it without an extra import path. The doc comment notes it is *not* exposed on `invoicingService`; only the module's own `payment.refunded` listener invokes it in production.

## Relationships

- **`src/modules/invoicing/repository.ts`** — Imports `invoicingRepository` and calls `findInvoiceByOrderId` inside `waitForInvoice`.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — Re-exports `issueCreditNote` verbatim.
- **`tests/support/eventually.ts`** — Supplies the `eventually` polling primitive used by `waitForInvoice`.
- **Integration tests** (`issue-invoice.test.ts`, `issue-credit-note.test.ts`, `credit-note-catch-up.test.ts`, `reencrypt.test.ts`, `retention.test.ts`, `stats.test.ts`, `ownership-shop.contract.test.ts`) — Consumers that import `waitForInvoice` and/or `issueCreditNote` from this module.

## Notes

- `waitForInvoice` performs two sequential repository reads: the first inside the `eventually` predicate (checked only for truthiness), the second to actually retrieve and return the invoice. This avoids a TOCTOU-style null return from the polling step but does mean a concurrent deletion between the two reads would still pass the guard and then return `undefined`—the explicit `if (!invoice)` check covers that.
- The module is named "factories" but exports a *waiter* rather than a builder; the name reflects its role as a shared test setup helper.
