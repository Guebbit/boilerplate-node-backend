---
source: src/modules/invoicing/tests/integration/download.test.ts
sha256: e19b8b3709dc7879ca3ae191e6f47a5ec93f9bf6550529ec66968d9d07b6911a
generated_at: 2026-11-14T20:15:03.477061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/download.test.ts

## Purpose

Integration tests for `GET /orders/{id}/invoice` and `GET /orders/{id}/credit-notes` over real HTTP. Verifies status-code contracts (404 unissued, 200 issued, 503 busy), ownership scoping (stranger gets 404, admin gets 200), PDF rendering details (plaintext address, stored seller name), the stored-copy cache, the `actions.invoice` flag on the order, and audit logging for admin downloads.

## Key elements

- **`authenticateAnotherUser`** — Creates a second customer with a distinct address (the default `authenticateAs('user')` mints the same address every time, which collides). Returns `{ user, bearer }`.
- **`waitUntilInvoiced(orderId, bearer)`** — Polls the invoice endpoint via `eventually` until it returns 200. Exists because the invoicing pipeline is triggered by a fire-and-forget `ORDER_STATUS_CHANGED` listener.
- **`jest.mock('@infrastructure/adapters/pdf')`** — Stubs `renderHtmlToPdf` (no Chromium in CI). Tests inspect captured HTML args or just assert status/headers.
- **`afterEach(emptyFileSandbox)`** — Sweeps the file sandbox so a stored PDF from one test doesn't leak into the next.
- **`describe` blocks** — Cover: basic 404/200, billing-address encryption, seller-name retention, cross-user scoping, admin audit logging, 503 + `Retry-After`, stored-copy (render-once) behavior, `actions.invoice` flag, and credit-notes listing/scoping.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB before all tests.
- **`tests/support/environment.ts`** — `setEnvironment` / `withEnvironmentOverrides` toggle `NODE_INVOICE_PDF_RETENTION_DAYS` and `NODE_LEGAL_NAME` per-test.
- **`tests/support/http.ts`** — `api`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and auth helpers.
- **`tests/support/eventually.ts`** — `eventually` backs the `waitUntilInvoiced` polling loop.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` cleans stored PDFs between tests.
- **`src/modules/orders/friends/payments.ts`** — `markPaid` is called to trigger the invoicing pipeline.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` seed order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the line-item product.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD` for auth setup.
- **`src/infrastructure/adapters/pdf.ts`** — `renderHtmlToPdf` is mocked; tests assert on its captured HTML or injected rejections.
- **`src/infrastructure/adapters/logger.ts`** — `auditLogger` is spied on to verify that admin cross-user downloads produce an audit entry while the owner's own download does not.
- **`src/infrastructure/runtime/busy.ts`** — `ServiceBusyError` is thrown by the mocked renderer to exercise the 503 path.
- **`src/modules/invoicing/repository.ts`** — Used to read back the stored invoice row and assert the billing address is encrypted at rest.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — `issueCreditNote` is used in the credit-notes test block to seed a refund.

## Notes

- The "stored copy" test depends on the **default** retention (> 0) so the first render persists a file; the "busy" and "seller changed" tests explicitly set `NODE_INVOICE_PDF_RETENTION_DAYS=0` to force re-render on every download and bypass the cache.
- `waitUntilInvoiced` itself performs a download, which (at default retention) also **stores** the PDF. The stored-copy test calls `mockClear()` after the poll, so the "first" and "second" downloads it asserts on are post-storage.
- The audit test asserts the **owner's** own download produces **no** audit entry—only admin cross-user downloads are logged.
- The "seller changed" test verifies the invoice captures the seller name **at issue time**, not a live read of the current shop config.
