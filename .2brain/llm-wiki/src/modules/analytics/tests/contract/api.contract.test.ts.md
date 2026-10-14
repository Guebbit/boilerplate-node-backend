---
source: src/modules/analytics/tests/contract/api.contract.test.ts
sha256: 3a6e100dd041e2f8bcd28f68d29b1638514122517ebfc711e5bd8d974079740f
generated_at: 2026-10-14T14:55:49.225116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/tests/contract/api.contract.test.ts

## Purpose

Contract test for `POST /analytics/events` that pins the API's closed-set behavior: the two known event types (`product_viewed`, `products_searched`) must return `204 No Content`, and any event outside that set must be rejected with `422 Unprocessable Entity`.

## Key elements

- **`describe('POST /analytics/events')`** — top-level suite containing three cases.
- **Test 1: product view** — POSTs `{ event: 'product_viewed', productId: <hex id> }`, asserts `204`.
- **Test 2: search** — POSTs `{ event: 'products_searched', text, resultCount, page }`, asserts `204`.
- **Test 3: unknown event** — POSTs `{ event: 'order_created' }`, asserts `422`. This is the negative case that enforces the closed-set contract.
- **`setupTestDb()`** — called once at module scope to provision/tear down a per-file test database.

## Relationships

- **`tests/support/contract.ts`** — imported as a bare side-effect (`import '@tests/contract'`); likely registers global helpers or configures the contract-testing harness before the suite runs.
- **`tests/support/http.ts`** — provides the `api()` helper used to issue HTTP requests against the application server within tests.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb()`, which manages the temporary database lifecycle for this file's tests.

## Notes

- `setupTestDb()` is invoked at module top level (not inside a `beforeAll`), so it runs once when the file is loaded by the test runner.
- The side-effect import of `@tests/contract` means ordering matters: it must execute before any test that depends on whatever it registers.
- The "closed set" in the doc comment refers to the server-side allow-list of event types; the test does not enumerate every possible invalid value, only one representative.
