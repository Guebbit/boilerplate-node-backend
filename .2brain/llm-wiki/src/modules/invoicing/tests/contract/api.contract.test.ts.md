---
source: src/modules/invoicing/tests/contract/api.contract.test.ts
sha256: fac3b0cfef7e5cd489db0fdfaa152ea0897c89955bfd60e6c8f27c76bd5b2481
generated_at: 2026-10-29T04:16:03.359678+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three invoicing routes under `/orders/{id}` (invoice PDF, credit-note list, and a single credit-note PDF). Each test exercises a declared HTTP branch and asserts the response shape against the API spec. Ownership-scoping, the 503 busy-queue path, and invoice number-series behaviour are explicitly out of scope — those belong in `tests/integration/`.

## Key elements

- **`customerWithOrder()`** — helper that authenticates a user, creates a product, and places a single unpaid order; returns the bearer token and order ID.
- **`describe('GET /orders/{id}/invoice')`** — verifies 404 `ORDER_INVOICE_NOT_ISSUED` before payment, 200 `application/pdf` after `orderService.markPaid` (polling with `eventually`), and 401 for unauthenticated callers.
- **`describe('GET /orders/{id}/credit-notes')`** — verifies 200 with `{ items: [] }` for an order that has never been refunded, and 401 unauthenticated.
- **`describe('GET /orders/{id}/credit-notes/{creditNoteId}')`** — verifies 404 for a non-existent credit note, and 401 unauthenticated.
- **`jest.mock('@infrastructure/adapters/pdf', …)`** — replaces `renderHtmlToPdf` with a stub returning `Buffer.from('pdf')`, so no real Chromium is needed.
- **`setupTestDb()`** — initialises the test database for the suite.
- **`afterEach(emptyFileSandbox)`** — sweeps any PDF artifacts the test wrote into the file sandbox.

## Relationships

- **`src/modules/orders/index.ts`** — imports `orderService` solely to call `markPaid`, which triggers the fire-and-forget invoice listener.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder` and `toOrderItem` to seed the unpaid order fixture.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to build the order line item.
- **`tests/support/contract.ts`** — side-effect import; likely configures global contract-test assertions or schema matchers.
- **`tests/support/http.ts`** — imports `api` (supertest-style client) and `authenticateAs` for authed requests.
- **`tests/support/eventually.ts`** — imports `eventually` to poll until the async invoice has been persisted.
- **`tests/support/file-sandbox.ts`** — imports `emptyFileSandbox` for post-test cleanup.
- **`tests/support/ids.ts`** — imports `MISSING_ID` as a sentinel non-existent identifier.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to reset/provision the test database.

## Notes

- Invoice generation is **fire-and-forget** (a listener writes the invoice after `markPaid` returns), so the "paid → 200" test must poll with `eventually`; a single immediate GET will often still return 404.
- The PDF adapter is fully mocked; assertions on response content only check the `Content-Type` header, never the actual bytes.
- These tests intentionally do **not** cover ownership checks (caller ≠ order owner), the 503 busy-queue response, or number-series allocation — those are reserved for integration tests to avoid duplicating infrastructure setup here.
