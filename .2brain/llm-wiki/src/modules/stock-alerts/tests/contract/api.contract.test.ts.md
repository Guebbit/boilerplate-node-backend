---
source: src/modules/stock-alerts/tests/contract/api.contract.test.ts
sha256: dfbdbda1939def04bda1429457c6fda6325e4d96843cb373e254371da5fdbcac
generated_at: 2026-11-14T22:04:54.676247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/contract/api.contract.test.ts

## Purpose

HTTP contract tests for the `/stock-alerts` endpoints. Each declared status branch (200, 404, 405, 409, 422) is exercised over real HTTP and the response envelope is checked for shape and error codes. The file deliberately does **not** verify inventory-signal behavior (stock levels, signal emission); that is covered by the integration test suite.

## Key elements

- **`soldOut()`** — local helper; creates a product with `onHand: 0` via `createProduct` and returns its `_id` as a string. The only product state a valid POST request can reference.
- **`describe('GET /stock-alerts')`** — two cases: empty list (no alerts) and a list containing one previously-created alert. Asserts `items` array shape.
- **`describe('POST /stock-alerts')`** — five cases:
  - Idempotent duplicate POST (both 200, list stays length 1).
  - 409 `STOCK_ALERT_PRODUCT_BUYABLE` when the product still has stock (`onHand: 5`).
  - 404 when the `productId` does not exist.
  - 422 for a malformed ObjectId string *and* for a missing `productId` field.
  - 405 on the legacy URL `POST /stock-alerts/{id}`; asserts the `allow` header lists `DELETE, OPTIONS`.
- **`describe('DELETE /stock-alerts/{productId}')`** — two cases: successful cancellation (returns empty `items` array) and 404 when the caller holds no such alert.

## Relationships

| Neighbor | Role in this file |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` runs once at module level to provision/tear down the test database. |
| `tests/support/http.ts` | `api()` builds the supertest-style client; `authenticateAsRole('customer')` returns a `{ bearer }` token used on every request. |
| `tests/support/contract.ts` | Imported as a side-effect (`import '@tests/contract'`); configures global contract-test expectations. |
| `src/modules/products/tests/factories.ts` | `createProduct({ onHand })` creates fixture products (sold-out or buyable) for the test data. |
| `tests/support/ids.ts` | `MISSING_ID` — a guaranteed-nonexistent ObjectId used in 404 and 405 tests. |

## Notes

- The `@tests/contract` import is side-effect only; no symbols are destructured. Removing it silently disables envelope validation.
- All tests authenticate as `customer`; no `401` (unauthenticated) case is present in this file despite the module doc-comment listing it. The 401 branch is presumably covered elsewhere or intentionally omitted.
- The 422 test asserts both the malformed-ID and missing-field cases in a single `it` block, comparing two sequential requests.
- The 405 test targets the *old* single-resource URL pattern (`/stock-alerts/{id}`), confirming that only `DELETE` and `OPTIONS` are allowed there while `POST` is reserved for the collection route.
