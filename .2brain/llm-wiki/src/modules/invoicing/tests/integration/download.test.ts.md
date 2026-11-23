---
source: src/modules/invoicing/tests/integration/download.test.ts
source_sha256: 9e7d05e3d0f2310b1a2f7d087969260f108e5809fe57b2d120e468910e6e21be
context_sha256: 2b152736fedf00ef5721797b9020789ee0a3d1063f96093f971519203926d2b6
generated_at: 2026-11-22T05:38:23.737741+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/download.test.ts

## Purpose
Integration test suite for the invoice download endpoint `GET /orders/{id}/invoice` (and, per the header, `/credit-notes`), exercised over real HTTP. It covers the 404 for an order not yet invoiced, the 200 PDF once paid, ownership scoping, admin access and auditing, render-queue overload, stored-copy caching, and the `actions.invoice` flag on `GET /orders/{id}`.

## Key elements
- `authenticateAnotherUser` — creates a second customer (`stranger@example.com`, verified) and logs in via `/account/login`. Needed because `authenticateAs('user')` always mints the same default address.
- `jest.mock('@infrastructure/adapters/pdf')` — stubs `renderHtmlToPdf` to resolve `Buffer.from('pdf')`, since there is no Chromium in the test environment. Tests inspect `mock.calls` to read the rendered HTML.
- `setupTestDb()` and `afterEach(emptyFileSandbox)` — DB setup, and cleanup of PDFs stored on first render.
- `waitUntilInvoiced(orderId, bearer)` — polls the invoice endpoint via `eventually` until it returns 200. This waits out the fire-and-forget `ORDER_STATUS_CHANGED` listener that freezes the invoice.
- `describe('GET /orders/{id}/invoice')` — cases:
  - 404 `ORDER_INVOICE_NOT_ISSUED` for a never-paid order.
  - 200 with `content-type: application/pdf` and `cache-control: private, no-store` once paid.
  - The buyer address renders in plaintext while the stored invoice row's `billingAddress.fullName` is not plaintext (it is stored encrypted).
  - The seller shown is the one the invoice was issued with ("Guebbit Demo Shop Srl"), not a later `NODE_LEGAL_NAME` change.
  - The HTML contains the order number and an inline base64 SVG logo, has no external `src`/`href` URLs, and has no credit-note banner (`class="notice"`).
  - A non-owner customer gets 404 (absence, not refusal).
  - An admin gets 200.
  - An admin download logs an `admin.invoice.viewed` audit entry, and the owner's own download does not.
- `describe('… when the render queue is full')` — with retention 0, `renderHtmlToPdf` rejects once with `ServiceBusyError`. Expects 503 `SERVICE_UNAVAILABLE` and a `Retry-After` header of at least 1.
- `describe('… the stored copy')` — after the invoice exists, two downloads return equal bodies and `renderHtmlToPdf` is not called again.
- `describe('GET /orders/{id} — the actions.invoice flag')` — expects false before payment and true once paid. This part is only partly visible.

## Relationships
- `@tests/*` helpers (`setup-test-db`, `environment`, `http`, `eventually`, `file-sandbox`) provide the DB lifecycle, env overrides (`setEnvironment`, `withEnvironmentOverrides`), the HTTP client and auth helpers (`api`, `authenticateAs`, `authenticateAsRole`), polling, and sandbox cleanup.
- Factories (`products`, `orders`, `users` tests) create products, orders (`createOrder`, `toOrderItem`) and users (`createUser`, `PLAIN_PASSWORD`).
- `orders/friends/payments` — `markPaid` triggers the status change that leads to invoicing.
- `invoicing/repository` — the stored invoice row is read directly to check the billing address is not stored in plaintext.
- `infrastructure/adapters/pdf` — mocked, and its calls are inspected.
- `infrastructure/adapters/logger` — the audit logger is spied on to verify admin-view auditing.
- `infrastructure/runtime/busy` — `ServiceBusyError` simulates a full render queue.
- `invoicing/services/issue-credit-note` — imported (`issueCreditNote`), but its use is not visible in the shown portion.
- `orders/services/status` — not referenced in the visible portion.

## Notes
- Tests that must hit the renderer on every download set `NODE_INVOICE_PDF_RETENTION_DAYS` to `'0'`, so a stored copy cannot answer instead.
- Invoicing is asynchronous, so tests must call `waitUntilInvoiced` after `markPaid`. Because polling downloads the invoice, it also renders and stores it. Tests that count renders call `mockClear()` afterwards.
- `authenticateAs('admin')` is used for the admin cases, and a separate second customer for the stranger case.
