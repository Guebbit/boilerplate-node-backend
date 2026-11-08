---
source: src/modules/analytics/tests/contract/api.contract.test.ts
sha256: 3a6e100dd041e2f8bcd28f68d29b1638514122517ebfc711e5bd8d974079740f
generated_at: 2026-11-08T04:59:31.341194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `POST /analytics/events` endpoint. They lock in the closed set of accepted event types (`product_viewed`, `products_searched`) and assert that any event outside that set is rejected, ensuring the API's public contract remains stable.

## Key elements

- **`describe('POST /analytics/events')`** — top-level suite containing three contract assertions.
- **`it('accepts a product view with 204')`** — POSTs `{ event: 'product_viewed', productId }` and expects HTTP 204.
- **`it('accepts a search with 204')`** — POSTs `{ event: 'products_searched', text, resultCount, page }` and expects HTTP 204.
- **`it('refuses an event outside the closed set with 422')`** — POSTs `{ event: 'order_created' }` and expects HTTP 422.

## Relationships

- **`tests/support/contract.ts`** — imported for its side effects (contract-test conventions, matchers, or global setup that this suite relies on before any `it` block runs).
- **`tests/support/http.ts`** — provides the `api()` helper used to build and execute HTTP requests in every test case.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module scope to initialize a clean database before the suite executes.

## Notes

- The `@tests/contract` import has no binding; it is a side-effect import. Any global `beforeAll`/`afterAll` or matcher registration it performs is invisible in this file.
- The accepted events are described as a **closed set** in the module doc-comment. Adding a new event type to the API without adding a corresponding 204 test here would silently break the contract.
- `setupTestDb()` is called at module top level (not inside a hook), so it runs before `describe` registration; test isolation depends on that support module's own cleanup strategy.
