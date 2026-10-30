---
source: src/modules/invoicing/tests/integration/download.test.ts
sha256: 95d3dc52a0523f9435fe400e28d91cbd4a7c7b197b025b993d6cf46445ab1801
generated_at: 2026-10-29T04:16:47.728812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/download.test.ts

## Purpose

Integration tests that exercise the invoice and credit-note download endpoints (`GET /orders/{id}/invoice`, `GET /orders/{id}/credit-notes`) over real HTTP. They verify status codes, response headers, ownership scoping (customer vs. admin), PDF rendering behavior (fresh render vs. cached copy), audit logging for admin views, and graceful handling of a full render queue.

## Key elements

- **`authenticateAnotherUser`** – Creates a second customer with a unique email/address and returns a bearer token; works around `authenticateAs('user')` always minting the same default billing address.
- **`jest.mock('@infrastructure/adapters/pdf')`** – Stubs `renderHtmlToPdf` to resolve with a dummy Buffer; no real browser/Chromium in the test environment.
- **`waitUntilInvoiced(orderId, bearer)`** – Polls the invoice endpoint via `eventually` until it returns 200, waiting out the fire-and-forget `ORDER_STATUS_CHANGED` listener that triggers the first render.
- **`afterEach(emptyFileSandbox)`** – Sweeps any PDF files the test case left in the file-sandbox directory.
- **`describe('GET /orders/{id}/invoice')`** – Main suite: 404 for unpaid orders, 200 + correct headers after payment, plaintext buyer address in rendered HTML (while DB row stays encrypted), historical seller name retained even after shop rename, customer-scoped 404 for strangers, admin 200 for cross-customer access, audit log `admin.invoice.viewed` only for admin downloads, 404 (not 422) for malformed IDs.
- **`describe('…render queue is full')`** – Asserts 503 + `SERVICE_UNAVAILABLE` + `Retry-After` when `renderHtmlToPdf` rejects with `ServiceBusyError`.
- **`describe('…the stored copy')`** – Verifies the second download is served from the stored file without re-rendering.
- **`describe('…actions.invoice flag')`** – Confirms `actions.invoice` on `GET /orders/{id}` flips from `false` to `true` after payment.
- **`describe('GET /orders/{id}/credit-notes')`** – Credit-note listing tests (truncated in source).

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** – `renderHtmlToPdf` is mocked; individual tests clear/reject it to inspect rendered HTML or simulate queue-full.
- **`src/infrastructure/adapters/logger.ts`** – `auditLogger.log` is spied on to assert the `admin.invoice.viewed` action fires only for admin downloads.
- **`src/infrastructure/runtime/busy.ts`** – `ServiceBusyError` is thrown (via the PDF mock) to trigger the 503 path.
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository.findInvoiceByOrderId` is used to inspect the persisted invoice row (e.g., confirming the billing address is stored encrypted).
- **`src/modules/invoicing/services/issue-credit-note.ts`** – Imported for the credit-note describe block.
- **`src/modules/orders/index.ts`** – `orderService.markPaid` is the trigger that makes an invoice available.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build test orders.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds test products.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD` build test users.
- **`tests/support/environment.ts`** – `setEnvironment` / `withEnvironmentOverrides` toggle `NODE_INVOICE_PDF_RETENTION_DAYS` and `NODE_SHOP_LEGAL_NAME` per test.
- **`tests/support/eventually.ts`** – `eventually` powers the `waitUntilInvoiced` poll.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` cleans stored PDFs between tests.
- **`tests/support/http.ts`** – `api`, `authenticateAs`, `authenticateAsRole` provide the Supertest-based HTTP client and auth helpers.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the test database once.

## Notes

- **No real PDF rendering.** `renderHtmlToPdf` is a jest mock returning a fixed Buffer; tests that need to inspect rendered content read the captured HTML arguments rather than parsing a PDF.
- **Retention-0 trick.** Setting `NODE_INVOICE_PDF_RETENTION_DAYS` to `'0'` forces every download to re-render, bypassing the stored-file shortcut. This is essential for the seller-rename test and the queue-full test; forgetting it would let a cached copy short-circuit the assertion.
- **Polling has a side effect.** `waitUntilInvoiced` issues real HTTP GETs that themselves trigger render-and-store. The "stored copy" test relies on this: the first real download happens *during* polling, so `mockClear()` after polling means the subsequent two downloads are both served from the stored file.
- **Ownership scoping returns 404, not 403.** A stranger requesting another customer's invoice gets the same 404 as a non-existent invoice—deliberately indistinguishable.
- **Seller name is historical.** The invoice always renders the shop name captured at issue time; changing `NODE_SHOP_LEGAL_NAME` afterwards does not alter the PDF content.
