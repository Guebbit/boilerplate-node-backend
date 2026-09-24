---
source: src/modules/orders/tests/integration/invoice-vat.test.ts
sha256: 5fdc394f93a3b78a95eaae7153f7e61a0b6992b34630ba29f073eaf818b0092a
generated_at: 2026-09-23T19:10:44.593384+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/invoice-vat.test.ts

## Purpose

Integration test that verifies VAT figures are correctly computed and exposed in two places: the HTML rendered for the invoice PDF (`GET /orders/{id}/invoice`) and the JSON body of `GET /orders/{id}`. It complements `api.contract.test.ts`, which covers the invoice route's authorization scope, by asserting on the actual rendered content and published fields.

## Key elements

- **`renderHtmlToPdfMock`** — A `jest.fn` that replaces `@infrastructure/adapters/pdf`'s `renderHtmlToPdf`. It captures the HTML string the app attempts to print, letting tests assert on the invoice markup without launching Chromium.
- **`taxedLine(productId, price, taxRate)`** — Helper that builds a frozen order line (product + quantity 2) with an explicit `taxRate`, simulating what `freezeOrderLines` produces at real checkout.
- **`describe('GET /orders/{id}/invoice — the VAT table')`** — Asserts the invoice HTML contains a `<table>` and the expected tax amount (7.18) for a 19.90 × 2 line at 22 % VAT.
- **`describe('GET /orders/{id} — the VAT fields on the response')`** — Asserts the JSON response includes `taxRate`, `taxAmount`, `netAmount` per line and `netTotal` / `taxTotal` at the order level, and validates the body against the API spec via `toSatisfyApiSpec`.

## Relationships

- **`tests/support/contract.ts`** — Side-effect import (`import '@tests/contract'`) that installs the `toSatisfyApiSpec` matcher used to validate the order response against the OpenAPI/contract definition.
- **`tests/support/http.ts`** — Provides `api()` (supertest instance) and `authenticateAs()` (Bearer-token setup) used by every test case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to point the app at a disposable test database before any request is made.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` mints a product with a real `_id` so the order line references a valid product document.
- **`src/modules/orders/tests/factories.ts`** — `createOrder(user, lines)` persists an order with the given frozen line items under the authenticated user.

## Notes

- The PDF adapter is fully mocked via `jest.mock('@infrastructure/adapters/pdf', …)`; no real PDF generation or headless browser occurs. The mock is cleared in `beforeEach` to avoid cross-test leakage.
- Tax math uses integer cents internally (`round(3980 × 0.22 / 1.22) = 718`) before being rendered as a decimal; tests assert on the displayed value (`7.18`), not the internal integer.
- Tests authenticate as `'admin'`—the VAT figures themselves are not role-gated, but the order endpoints require auth.
