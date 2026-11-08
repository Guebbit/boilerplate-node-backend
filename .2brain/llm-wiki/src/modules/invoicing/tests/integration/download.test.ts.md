---
source: src/modules/invoicing/tests/integration/download.test.ts
sha256: 9a6b40fce087e739e7d0ed1a2ce31090445e13677f3170fa933c6c9caffb1813
generated_at: 2026-11-08T06:17:05.742912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/download.test.ts

## Purpose

Integration tests that exercise the `GET /orders/{id}/invoice` and `GET /orders/{id}/credit-notes` endpoints over real HTTP against a real test database. They verify status codes (404 / 200 / 503), ownership scoping, PDF rendering and caching behaviour, audit logging for admin access, and the `actions.invoice` flag surfaced on the order resource.

## Key elements

- **`authenticateAnotherUser`** – Creates a second, distinctly-addressed customer (email `stranger@example.com`) and returns a Bearer token. Needed because `authenticateAs('user')` always mints the same default billing address, which collides when a test needs two customers.
- **`waitUntilInvoiced(orderId, bearer)`** – Polls the invoice endpoint until it returns 200. Waits out the fire-and-forget `ORDER_STATUS_CHANGED` listener that triggers invoice creation after `markPaid`.
- **`jest.mock('@infrastructure/adapters/pdf', …)`** – Replaces `renderHtmlToPdf` with a stub resolving `Buffer.from('pdf')`. No real Chromium in the test environment; tests assert on status, headers, and captured HTML arguments.
- **`setupTestDb()`** – Provisions a real test database for the suite.
- **`afterEach(emptyFileSandbox)`** – Sweeps any PDF rendered into the file sandbox during a test.
- **`describe('GET /orders/{id}/invoice', …)`** – Core suite: 404 before payment, 200 + correct `content-type`/`cache-control` after payment, plaintext buyer address in HTML vs. encrypted in the DB row, seller name frozen at issue time, 404 for another customer, 200 for admin, audit-log entry only for admin, 404 (not 422) for a malformed id.
- **`describe('… when the render queue is full', …)`** – Forces `renderHtmlToPdf` to reject with `ServiceBusyError`; asserts 503 + `Retry-After ≥ 1`.
- **`describe('… the stored copy', …)`** – Verifies the second download is served from the stored file (mock not re-invoked).
- **`describe('GET /orders/{id} — the actions.invoice flag', …)`** – Asserts the flag flips from `false` to `true` on payment.
- **`describe('GET /orders/{id}/credit-notes', …)`** – Credit-note listing (truncated in provided content).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/index.ts` | Imports `orderService` to call `markPaid` and drive the invoice lifecycle. |
| `src/modules/invoicing/repository.ts` | Imports `invoicingRepository.findInvoiceByOrderId` to inspect the stored (encrypted) billing-address row. |
| `src/modules/invoicing/services/issue-credit-note.ts` | Imported for the credit-notes describe block. |
| `src/infrastructure/adapters/pdf.ts` | Mocked at module level; `renderHtmlToPdf` call args are inspected to assert HTML content. |
| `src/infrastructure/adapters/logger.ts` | `auditLogger.log` is spied on to assert `admin.invoice.viewed` is recorded only for admin downloads. |
| `src/infrastructure/runtime/busy.ts` | Imports `ServiceBusyError` to simulate a saturated render queue. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` for order fixtures. |
| `src/modules/products/tests/factories.ts` | `createProduct` for the product line item. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD` for customer/admin fixtures. |
| `tests/support/environment.ts` | `setEnvironment` / `withEnvironmentOverrides` to toggle `NODE_INVOICE_PDF_RETENTION_DAYS` and `NODE_LEGAL_NAME`. |
| `tests/support/eventually.ts` | `eventually` powers the `waitUntilInvoiced` polling loop. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` clears rendered PDFs between tests. |
| `tests/support/http.ts` | `api`, `authenticateAs`, `authenticateAsRole` for HTTP calls and token minting. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the shared test database. |

## Notes

- **Retention-days override:** Setting `NODE_INVOICE_PDF_RETENTION_DAYS=0` disables the stored-PDF cache so every download hits the renderer. Used deliberately in tests that must observe a *live* render (seller-name change, 503 queue-full, stored-copy verification).
- **`waitUntilInvoiced` has a side effect:** Because it downloads the invoice, it triggers the first render-and-store. The "stored copy" test clears the mock *after* this call, then asserts the next two downloads produce identical bodies with zero new render calls.
- **404, not 403, for cross-customer access:** The route intentionally returns "absence, not refusal" so a stranger cannot enumerate valid order ids.
- **`setEnvironment` vs `withEnvironmentOverrides`:** The seller-name test uses `setEnvironment` (global, no auto-restore) because it changes the value *between* two calls within the same test; the 503 test uses `withEnvironmentOverrides` for scoped, auto-restored overrides.
