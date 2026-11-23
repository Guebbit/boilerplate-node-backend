---
source: src/modules/invoicing/tests/factories.ts
generated_at: 2026-11-22T05:37:26.820796+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/factories.ts

## Purpose
Test helpers for the invoicing module. Invoices are frozen by a fire-and-forget `ORDER_STATUS_CHANGED` listener, so tests can't read them synchronously. This file provides a way to wait for that invoice and re-exports the credit-note issuing function for tests that need one.

## Key elements
- `waitForInvoice(orderId)`: polls with `eventually` until the invoice lookup for `orderId` returns a truthy value. It then fetches the invoice again and returns it. It throws `Error('the invoice was never frozen')` if none is found.
- `issueCreditNote` (re-export from `../services/issue-credit-note`): freezes a credit note from the amounts given. It is meant for a sibling module's test of whatever reads a credit note.

## Relationships
- `src/modules/invoicing/repository.ts`: `waitForInvoice` reads through `invoicingRepository.findInvoiceByOrderId`, imported from it.
- `src/modules/invoicing/services/issue-credit-note.ts`: the source of the re-exported `issueCreditNote`.
- `tests/support/eventually.ts`: provides the `eventually` polling helper, imported via the `@tests/eventually` alias.
- The invoicing integration tests (`correct-invoice`, `credit-note-catch-up`, `issue-credit-note`, `issue-invoice`, `reencrypt`, `retention`), `src/modules/stats/tests/integration/stats.test.ts` and `tests/contract/ownership-shop.contract.test.ts` are its neighbors in the dependency graph, so they are its consumers.

## Notes
- `issueCreditNote` is deliberately not on `invoicingService`. In production only this module's own `payment.refunded` listener runs it, so tests reach it through this file.
- `waitForInvoice` waits on the repository directly rather than on an event, so the "polling window" is whatever `eventually` defines.
