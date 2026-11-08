---
source: src/modules/stock-alerts/tests/contract/api.contract.test.ts
sha256: 5fa7d5281ef2ad549e2c6709b9c6fd98fba3d23c20c71c4375dedf31b42c496a
generated_at: 2026-11-08T08:30:13.136024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/stock-alerts` API surface. Because every route returns the same `StockAlertsResponseEnvelope`, this file's sole job is to prove that each declared status-code branch (200, 401, 404, 409, 422, 405) is reachable over HTTP and matches the spec. It explicitly does **not** verify the inventory-signal wiring — that is the integration test's responsibility.

## Key elements

- **`soldOut()`** – local helper that creates a product with `onHand: 0` via `createProduct` and returns its `_id` as a string; the only product shape a valid stock-alert request can reference.
- **`describe('GET /stock-alerts')`** – asserts 200 (empty list, list with one item) and 401 (no auth header).
- **`describe('POST /stock-alerts')`** – asserts idempotent 200 (same product posted twice), 409 with `STOCK_ALERT_PRODUCT_BUYABLE` code, 404 for a nonexistent product, 422 for malformed/missing `productId`, 401, and 405 with `Allow: DELETE` on the legacy `/stock-alerts/{id}` path.
- **`describe('DELETE /stock-alerts/{productId}')`** – asserts 200 (cancelling own alert), 404 (alert not held by caller), 401.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as `@tests/contract`; provides the contract-matching setup that validates responses against the spec envelope. |
| `tests/support/setup-test-db.ts` | Imported as `@tests/setup-test-db`; `setupTestDb()` is called at module level to prepare a clean test database. |
| `tests/support/http.ts` | Imported as `@tests/http`; supplies `api()` (the HTTP client used for every request) and `authenticateAsRole()` (issues a Bearer token for the given role). |
| `tests/support/ids.ts` | Imported as `@tests/ids`; `MISSING_ID` is a known-absent identifier used to trigger 404 / 405 branches. |
| `src/modules/products/tests/factories.ts` | Imported as `@modules/products/tests/factories`; `createProduct()` seeds product documents with configurable `onHand` values. |

## Notes

- The file's header comment explicitly draws the boundary: business-logic / signal wiring is tested in `tests/integration/stock-alerts.test.ts`, not here.
- The 405 test targets the **old** URL shape (`/stock-alerts/:id`) and asserts the `Allow` header is exactly `DELETE`, confirming the route is method-restricted rather than removed.
- Idempotency of POST is verified by firing the same request twice and expecting `items` length of 1 (not 2), rather than a 409 on the second call.
