---
source: src/modules/stock-alerts/tests/contract/api.contract.test.ts
source_sha256: dfbdbda1939def04bda1429457c6fda6325e4d96843cb373e254371da5fdbcac
context_sha256: 9fdd99d01ce9b058b6a03a6896390ff789d0e0555b2321afa70a99080e5bf49c
generated_at: 2026-11-22T07:55:54.302783+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/stock-alerts` HTTP API. Every route returns the same `StockAlertsResponseEnvelope`, and these tests make sure each declared response branch (200, 401, 404, 409, plus 405/422 cases) is actually hit over HTTP and checked against the spec. How stock alerts are wired to the inventory signal is covered elsewhere, in `src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`.

## Key elements
- `soldOut()`: local helper that creates a product with `onHand: 0` through `createProduct` and returns its `_id` as a string. A sold-out product is the only kind a request can be made for.
- `describe('GET /stock-alerts')`: expects 200 with `items: []` for a caller with no open request, and 200 with `items` containing the caller's `productId` after one POST.
- `describe('POST /stock-alerts')`:
  - Two identical POSTs for a sold-out product both return 200, and the second response still has exactly one item, so the call is idempotent.
  - A product with `onHand: 5` returns 409 with error code `STOCK_ALERT_PRODUCT_BUYABLE`.
  - A nonexistent product (`MISSING_ID`) returns 404.
  - A malformed or missing `productId` returns 422.
  - `POST /stock-alerts/{id}` (the old product URL) returns 405 with `Allow: DELETE, OPTIONS`.
- `describe('DELETE /stock-alerts/{productId}')`: cancelling the caller's own request returns 200 with `items: []`. A request the caller does not hold (`MISSING_ID`) returns 404.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`): imported for its side effects only, which is presumably what validates responses against the spec.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb()` is called at module level to provide the test database.
- `@tests/http` (`tests/support/http.ts`): provides `api()`, the HTTP client, and `authenticateAsRole('customer')`, which returns the `bearer` token used in each request.
- `@tests/ids` (`tests/support/ids.ts`): provides `MISSING_ID`, an ID that matches no record, used for the 404 and 405 cases.
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`): `createProduct` builds the products with the stock levels these tests need.

## Notes
- All tests authenticate as a `customer`. There is no test for the 401 branch, even though the header comment lists it, and there are no tests for other roles.
- Each test authenticates a fresh caller. Alert state is read back from the response `items`.
