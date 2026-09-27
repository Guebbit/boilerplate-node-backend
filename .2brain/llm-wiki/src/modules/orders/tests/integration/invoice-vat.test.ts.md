---
source: src/modules/orders/tests/integration/invoice-vat.test.ts
sha256: 9b2b4899d1a1869ddf59fe3b2283d3c116f26dcf3e7ee18ff8217fca57aacafe
generated_at: 2026-09-27T15:17:42.236944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/invoice-vat.test.ts

## Purpose

Integration test (over real HTTP) that verifies every order line and the order-level totals carry a correct VAT breakdown — both in the HTML rendered to the invoice PDF and in the JSON published by `GET /orders/{id}`. Complements `api.contract.test.ts`, which covers the invoice route's authorization scope; this file covers what the route actually *renders* and what the order endpoint actually *publishes*.

## Key elements

- **`renderHtmlToPdfMock`** – Jest mock replacing `@infrastructure/adapters/pdf`'s `renderHtmlToPdf`. Captures the HTML string it receives so tests can assert on rendered invoice markup without needing a real Chromium/PDF pipeline.
- **`taxedLine(productId, price, taxRate)`** – Helper that builds a single frozen order line (shape matching `freezeOrderLines` output at checkout) with a concrete VAT rate.
- **`describe('GET /orders/{id}/invoice — the VAT table')`** – Asserts the invoice HTML contains a `<table>` and the expected tax figure (7.18 for 19.90 × 2 @ 22% tax-inclusive).
- **`describe('GET /orders/{id} — the VAT fields on the response')`** – Asserts the JSON body exposes `taxRate`, `taxAmount`, `netAmount` on each line plus `netTotal`/`taxTotal` at the order level, and that the payload satisfies the OpenAPI contract via `toSatisfyApiSpec`.

## Relationships

- **`src/modules/orders/tests/factories.ts`** – `createOrder` builds the order fixture with the `taxedLine` line items.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the product referenced by each order line.
- **`tests/support/contract.ts`** – Registers the `toSatisfyApiSpec` matcher used to validate the order response against the OpenAPI spec.
- **`tests/support/http.ts`** – Provides `api()` (HTTP client) and `authenticateAs('admin')` (bearer token).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises a fresh database before the suite runs.

## Notes

- The PDF adapter is mocked because no real browser/PDF engine is available in the test environment; the mock is the same pattern used in `api.contract.test.ts`.
- Tax is computed **tax-inclusive**: `tax = round(gross × rate / (1 + rate))`. The expected 7.18 figure encodes this formula — changing to tax-exclusive would break the assertion.
- `renderHtmlToPdfMock.mockClear()` runs in `beforeEach`, so each test sees only its own invocation; assertions rely on `mock.calls[0][0]`.
- The file is a `@module` (no exports); it is purely an integration test entry point.
