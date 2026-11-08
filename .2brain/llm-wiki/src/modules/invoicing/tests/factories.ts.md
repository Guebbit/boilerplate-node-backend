---
source: src/modules/invoicing/tests/factories.ts
sha256: cbf1d8a22243548070ecc2ae2654dcca4a9ed5778f3e97baa4f062a6d813b2a7
generated_at: 2026-11-08T06:16:31.297920+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/factories.ts

## Purpose

Test helpers for the invoicing module. Provides a polling wrapper around the asynchronous "freeze invoice" side-effect (triggered by a fire-and-forget `ORDER_STATUS_CHANGED` listener) and re-exports the internal `issueCreditNote` service so sibling tests can exercise it without going through the public service surface.

## Key elements

- **`waitForInvoice(orderId: string)`** – Polls `invoicingRepository.findInvoiceByOrderId` via the `eventually` helper until an invoice appears or the window expires, then returns it. Throws if the invoice was never frozen.
- **Re-export of `issueCreditNote`** – Re-exported from `../services/issue-credit-note`. The doc comment notes this function is *not* on the public `invoicingService`; it is invoked only by the module's own `payment.refunded` listener in production, so tests import it directly from here.

## Relationships

- **`src/modules/invoicing/repository.ts`** – Imports `invoicingRepository` and calls `findInvoiceByOrderId` to poll for the frozen invoice.
- **`src/modules/invoicing/services/issue-credit-note.ts`** – Source of the re-exported `issueCreditNote` function.
- **`tests/support/eventually.ts`** – Provides the `eventually` polling utility used by `waitForInvoice`.
- **Integration tests** (`credit-note-catch-up.test.ts`, `issue-credit-note.test.ts`, `issue-invoice.test.ts`, `reencrypt.test.ts`, `retention.test.ts`), **`src/modules/stats/tests/integration/stats.test.ts`**, and **`tests/contract/ownership-shop.contract.test.ts`** – All consume this module's exports to await async invoicing effects or to call `issueCreditNote` in isolation.

## Notes

- The "freezing" of an invoice is fire-and-forget (event-driven listener), not a synchronous return from the order-payment path. Any test that needs the resulting invoice must go through `waitForInvoice` rather than expecting it from the call that triggered it.
- `issueCreditNote` is intentionally absent from the public service API; importing it from the service would be a sign of a test-architecture mistake. This module is the sanctioned test-facing entry point.
