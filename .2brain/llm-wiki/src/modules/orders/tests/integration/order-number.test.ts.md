---
source: src/modules/orders/tests/integration/order-number.test.ts
sha256: 08b1666a0e3bf361b91a368a200649e7cb6b834f4be9ef86c2a291f2392f17e0
generated_at: 2026-09-27T15:18:09.589913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number.test.ts

## Purpose

Integration test (real HTTP, real database) verifying the "all-or-nothing" invariant for `orderNumber`: an order either exposes both the number **and** its date, or neither. Covers the `GET /orders/{id}` JSON response and the `GET /orders/{id}/invoice` HTML rendering. Mirrors the pattern established in `invoice-vat.test.ts` for the VAT block.

## Key elements

- **`renderHtmlToPdfMock`** — `jest.fn()` stub for `@infrastructure/adapters/pdf`; returns a fixed `Buffer('pdf')` so no real Chromium/PDF pipeline runs. Cleared in `beforeEach`.
- **`describe('GET /orders/{id} — the order number on the response')`**
  - *omits orderNumber on an order that predates this field* — creates an order without `orderNumber`, asserts the property is absent from `response.body.data`.
  - *publishes the order number frozen at creation* — creates an order with `orderNumber: '2026-000041'`, asserts it round-trips unchanged.
- **`describe('GET /orders/{id}/invoice — the number-and-date block')`**
  - *renders no number or date for an order with no order number* — inspects the HTML passed to the PDF mock; asserts the number string is absent.
  - *renders the number and its date for an order that carries one* — asserts both the number **and** the `createdAt` year appear in the invoice HTML.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/tests/factories.ts` | Supplies `createOrder` and `toOrderItem` used to seed order fixtures. |
| `src/modules/products/tests/factories.ts` | Supplies `createProduct` to build a valid order line item. |
| `tests/support/contract.ts` | Side-effect import that registers the `toSatisfyApiSpec()` matcher used in every response assertion. |
| `tests/support/http.ts` | Provides `api` (HTTP client) and `authenticateAs` (bearer-token helper). |
| `tests/support/setup-test-db.ts` | Called once at module top level to spin up the test database before any test runs. |

## Notes

- The PDF adapter is **always** mocked in this file (no real rendering). If a future refactor changes the adapter's export shape, this `jest.mock` factory must be updated in lockstep — the same coupling exists in `invoice-vat.test.ts`.
- The "date" printed on the invoice is the order's `createdAt` timestamp; the test only checks the UTC year component of that timestamp in the HTML, not a specific format.
- The order-number format `'2026-000041'` is hard-coded in the tests purely as a sentinel string; no business-rule validation of the format is exercised here.
