---
source: src/modules/invoicing/tests/contract/api.contract.test.ts
source_sha256: 66e320d21459871abd386165a7cdc086d570bc1e0b27145d5ab2303fe1e2c1b5
context_sha256: bae014c27e7125cf75b028df79c33545a53a7628aaf9d9ae120c052101b170c5
generated_at: 2026-11-22T05:37:17.578009+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the invoicing routes under `/orders/{id}`: the invoice PDF, the credit-note list, and a single credit note's PDF. Each declared branch is made reachable over HTTP and checked against the API spec. Ownership scoping, the busy queue (503) and the number series are covered elsewhere, in `tests/integration/`.

## Key elements
- `jest.mock('@infrastructure/adapters/pdf', ...)`: replaces `renderHtmlToPdf` with a stub resolving to `Buffer.from('pdf')`, because there is no real Chromium in the test environment.
- `setupTestDb()`: sets up the test database for the suite.
- `afterEach(emptyFileSandbox)`: clears the file sandbox after each case, since a downloaded invoice is stored on first render.
- `customerWithOrder()`: helper that signs in as a `'user'`, creates a product and an unpaid order for that user, and returns `{ bearer, orderId }`.
- `GET /orders/{id}/invoice` cases:
  - An unpaid order returns 404 with error code `ORDER_INVOICE_NOT_ISSUED`.
  - After `markPaid`, polls with `eventually` until the invoice is available, then expects 200 with a `application/pdf` content type.
- `GET /orders/{id}/credit-notes`: for an order that was never refunded, expects 200 and `{ items: [] }`.
- `GET /orders/{id}/credit-notes/{creditNoteId}`: a nonexistent credit note (`MISSING_ID`) returns 404.

## Relationships
- `tests/support/contract.ts`: imported for its side effect (`import '@tests/contract'`). It is presumably what checks responses against the spec, but the file doesn't show how.
- `tests/support/setup-test-db.ts`, `http.ts`, `file-sandbox.ts`, `eventually.ts` and `ids.ts`: provide the DB setup, the `api()` and `authenticateAs()` helpers, `emptyFileSandbox`, `eventually`, and `MISSING_ID`.
- `src/modules/orders/friends/payments.ts`: `markPaid(orderId)` marks the order paid, which leads to the invoice being frozen.
- `src/modules/orders/tests/factories.ts`: `createOrder` and `toOrderItem` build the order.
- `src/modules/products/tests/factories.ts`: `createProduct` supplies the product.
- `src/modules/orders/services/status.ts`: no direct use is visible in this file.

## Notes
- The invoice is frozen by a fire-and-forget listener after payment, so the test waits with `eventually` before asserting. Asserting immediately would be racy.
- The success path for a single credit note's PDF isn't covered here. Only the 404 case is tested.
