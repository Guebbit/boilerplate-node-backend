---
source: src/modules/invoicing/tests/contract/api.contract.test.ts
sha256: 66e320d21459871abd386165a7cdc086d570bc1e0b27145d5ab2303fe1e2c1b5
generated_at: 2026-11-14T20:14:10.996455+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three invoicing routes mounted under `/orders/{id}`: the invoice PDF, the credit-note list, and a single credit-note PDF. Each test drives one declared API branch over HTTP and asserts the response matches the documented spec (status code, error shape, content type). Ownership-scope, busy-queue (503), and number-series concerns are explicitly out of scope and belong to `tests/integration/`.

## Key elements

- **`customerWithOrder()`** – shared helper: authenticates a user, creates a product, and places a single-item order that is *not* yet paid. Returns the bearer token and the order ID as a string.
- **`describe('GET /orders/{id}/invoice')`** – two cases: 404 + `ORDER_INVOICE_NOT_ISSUED` error when unpaid; 200 + `application/pdf` content-type after the order is marked paid.
- **`describe('GET /orders/{id}/credit-notes')`** – one case: 200 with `{ items: [] }` for an order that was never refunded.
- **`describe('GET /orders/{id}/credit-notes/{creditNoteId}')`** – one case: 404 when the credit-note ID does not exist (uses `MISSING_ID`).
- **`jest.mock('@infrastructure/adapters/pdf')`** – replaces `renderHtmlToPdf` with a stub that resolves to a fixed `Buffer`, so no real browser is needed.
- **`setupTestDb()`** – initialises the test database before the suite.
- **`afterEach(emptyFileSandbox)`** – removes any PDF the render step wrote into the file sandbox.

## Relationships

- **`tests/support/contract.ts`** – side-effect import (`@tests/contract`) that wires up shared contract-test utilities/assertions.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb` to prepare a clean schema per run.
- **`tests/support/http.ts`** – provides `api()` (supertest-like client) and `authenticateAs` for bearer-token auth.
- **`src/modules/orders/friends/payments.ts`** – `markPaid` transitions an order to paid, triggering the invoice-freeze side effect the tests rely on.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies the line-item product.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the order fixture.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` cleans up rendered PDF artefacts between tests.
- **`tests/support/eventually.ts`** – `eventually` polls until the async invoice-freeze listener has completed (200 on the invoice endpoint).
- **`tests/support/ids.ts`** – `MISSING_ID` is a sentinel ID guaranteed to not exist, used for the 404 case.

## Notes

- The paid-invoice test uses `eventually` because the invoice is frozen by a **fire-and-forget event listener** after `markPaid`; the 200 response is not synchronous with the payment call.
- PDF rendering is fully mocked at the adapter level, so these tests verify HTTP contract (status, headers, error shape) but **not** the visual content of the PDF.
- The file deliberately does **not** cover 503 (busy queue), number-series allocation, or cross-tenant ownership checks—those live in `tests/integration/`.
