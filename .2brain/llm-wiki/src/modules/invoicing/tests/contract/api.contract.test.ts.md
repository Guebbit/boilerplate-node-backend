---
source: src/modules/invoicing/tests/contract/api.contract.test.ts
sha256: fac3b0cfef7e5cd489db0fdfaa152ea0897c89955bfd60e6c8f27c76bd5b2481
generated_at: 2026-11-08T06:16:21.984364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three invoicing endpoints under `/orders/{id}` (invoice PDF, credit-note list, credit-note PDF). They verify that each declared response branch — status code, error-code body, content-type — matches the spec over HTTP. Ownership scoping, the busy-queue (503), and number-series logic are explicitly delegated to `tests/integration/`.

## Key elements

- **`jest.mock('@infrastructure/adapters/pdf')`** — stubs `renderHtmlToPdf` to resolve a fixed `Buffer` so no real Chromium is needed.
- **`setupTestDb()`** — initialises the in-memory / test database for the whole suite.
- **`afterEach(emptyFileSandbox)`** — sweeps any PDF the case wrote into the sandbox so tests don't leak files.
- **`customerWithOrder()`** — local helper that creates an authenticated user, a product, and a single unpaid order; returns `{ bearer, orderId }` for reuse across tests.
- **`describe('GET /orders/{id}/invoice')`** — three cases: 404 with `ORDER_INVOICE_NOT_ISSUED` when not yet invoiced; 200 + `application/pdf` after `orderService.markPaid` (polled via `eventually` because the invoice is frozen by a fire-and-forget listener); 401 for unauthenticated callers.
- **`describe('GET /orders/{id}/credit-notes')`** — 200 with `{ items: [] }` when no refund exists; 401 for unauthenticated.
- **`describe('GET /orders/{id}/credit-notes/{creditNoteId}')`** — 404 for a non-existent credit-note id; 401 for unauthenticated.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) that wires up the contract-test harness (expectation matchers, spec loading).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper) and `authenticateAs()` for bearer-token fixtures.
- **`tests/support/file-sandbox.ts`** — provides `emptyFileSandbox` used in `afterEach`.
- **`tests/support/eventually.ts`** — polling helper awaited after `markPaid` because the invoice freeze is asynchronous.
- **`tests/support/ids.ts`** — provides the `MISSING_ID` sentinel for "non-existent id" cases.
- **`src/modules/orders/index.ts`** — source of `orderService` (called to transition an order to *paid* before the 200-invoice test).
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder` and `toOrderItem` for seeding a realistic order.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` used to build the order line.

## Notes

- The invoice is frozen by a **fire-and-forget** listener after `markPaid`; the test must poll with `eventually` before asserting 200. A plain `await orderService.markPaid(...)` is not sufficient.
- `afterEach(emptyFileSandbox)` is mandatory: without it, a PDF written by one test case will be served (cached) to the next, masking a 404 as a 200.
- The file does **not** test the 503 busy-queue path, ownership (403) scope, or invoice number-series sequencing — those are covered in `tests/integration/` per the module doc-comment.
