---
source: src/modules/invoicing/tests/integration/download.test.ts
sha256: 4c49262ec05524a0c2194dc00dcea360afc5623ba0d67fda741845ffd2be47a6
generated_at: 2026-10-14T16:10:46.042873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/download.test.ts

## Purpose

Integration tests for `GET /orders/{id}/invoice` and the credit-note endpoints, exercised over real HTTP against a live test database. Verifies status codes (404 / 200 / 503), ownership scoping, admin access, audit logging, PDF rendering behaviour (including the stored-copy optimisation), and the `actions.invoice` flag surfaced on the order resource.

## Key elements

- **`authenticateAnotherUser`** – creates a second customer with a distinct billing address (workaround for `authenticateAs('user')` always minding the same default address).
- **`jest.mock('@infrastructure/adapters/pdf')`** – stubs `renderHtmlToPdf` to return a fixed `Buffer`; no Chromium in the test environment.
- **`waitUntilInvoiced(orderId, bearer, timeoutMs?)`** – polls the invoice endpoint every 10 ms until it returns 200, waiting out the fire-and-forget `ORDER_STATUS_CHANGED` listener that generates the invoice.
- **`describe('GET /orders/{id}/invoice')`** – covers: 404 for never-paid order, 200 after `markPaid`, plaintext billing address in HTML vs. encrypted in the DB row, 404 (not 403) for a stranger, 200 for admin, `auditLogger` recording only admin downloads, 404 for a malformed ID.
- **`describe('…when the render queue is full')`** – sets `NODE_INVOICE_PDF_RETENTION_DAYS=0` (forces re-render on every request) and mocks `renderHtmlToPdf` to reject with `ServiceBusyError`; asserts 503 + `Retry-After`.
- **`describe('…the stored copy')`** – asserts the second download is served from the stored file without calling the renderer again.
- **`describe('GET /orders/{id} — the actions.invoice flag')`** – asserts the flag flips from `false` to `true` after `markPaid`.
- **`describe('GET /orders/{id}/credit-notes')`** – empty list for un-refunded orders; 404 for a stranger's order.
- **`describe('GET /orders/{id}/credit-notes/{id}')`** – 404 `ORDER_CREDIT_NOTE_NOT_ISSUED` for a non-existent credit note.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-process test database before all suites run.
- **`tests/support/environment.ts`** – `withEnvironment` temporarily overrides `NODE_INVOICE_PDF_RETENTION_DAYS` for the 503 case.
- **`tests/support/http.ts`** – `api()` (supertest) and `authenticateAs()` provide the HTTP client and standard auth tokens.
- **`src/modules/orders/index.ts`** – `markPaid` transitions an order to paid, triggering the invoice-generation listener.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build order fixtures.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies the line-item product.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD` for user fixtures and login.
- **`src/infrastructure/adapters/pdf.ts`** – `renderHtmlToPdf` is mocked; its call arguments are inspected to verify plaintext address rendering.
- **`src/infrastructure/adapters/logger.ts`** – `auditLogger.log` is spied on to assert the `admin.invoice.viewed` audit event.
- **`src/infrastructure/runtime/busy.ts`** – `ServiceBusyError` is the error type thrown when the render queue is saturated.
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository.findInvoiceByOrderId` is queried directly to confirm the billing address is stored encrypted.

## Notes

- Ownership scoping returns **404, not 403**, for another customer's invoice or credit note — consistent with the "absence, not refusal" convention used elsewhere in the order-read surface.
- The polling helper `waitUntilInvoiced` also *triggers* the first render (and thus the stored-copy write), so tests that assert "renderer was not called on second download" must `mockClear()` after the helper returns.
- The 503 test sets retention to `0` specifically so that a previously stored copy does not short-circuit the renderer and mask the `ServiceBusyError`.
- The comment referencing `tests/cross-cutting/contract-search-parity.test.ts` notes the PDF-mock pattern was adopted from that suite before the route moved into the invoicing module.
