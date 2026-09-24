---
source: src/modules/orders/tests/integration/invoice-number.test.ts
sha256: a969bcccc82ae55b5da79fad746d8b9a3454ad25413b9901e568fd243299b5fb
generated_at: 2026-09-23T19:10:27.349777+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/invoice-number.test.ts

## Purpose

Integration tests (over real HTTP) that verify the "all-or-nothing" contract for an order's invoice number and date of supply: both fields appear together on the response, or neither does. Mirrors the same shape already proven for the VAT block in `invoice-vat.test.ts`.

## Key elements

- **`describe('GET /orders/{id} — the invoice number on the response')`** — two tests: confirms `invoiceNumber` is absent on legacy orders (no field set) and present (and unchanged) when set at creation time.
- **`describe('GET /orders/{id}/invoice — the number-and-date block')`** — two tests: confirms the rendered invoice HTML omits both the number and the date of supply when the order has no invoice number, and includes both when it does.
- **`renderHtmlToPdfMock`** — module-level Jest mock replacing `@infrastructure/adapters/pdf`; avoids requiring a real Chromium/PDF pipeline and lets assertions inspect the HTML string that *would* have been rendered.
- **`setupTestDb()`** — initialises the in-memory test database before the suite runs.

## Relationships

- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build order fixtures, optionally with an `invoiceNumber` override.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies a valid product to attach as an order line item.
- **`tests/support/http.ts`** — `api()` provides the supertest-style HTTP client; `authenticateAs('admin')` returns a bearer token and user record.
- **`tests/support/contract.ts`** — registers the `toSatisfyApiSpec` custom matcher used to validate response shape against the OpenAPI contract.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` boots the test database.

## Notes

- The PDF adapter mock is identical in shape to the one in `invoice-vat.test.ts`; any change to the adapter's exported signature must be reflected in both.
- The "date of supply" is derived from the order's `createdAt` timestamp — the test asserts the UTC year of that timestamp appears in the rendered HTML, not a separate field.
- `renderHtmlToPdfMock.mockClear()` runs in `beforeEach`, so assertions on `mock.calls` are always scoped to the single request under test.
