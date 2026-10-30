---
source: src/modules/stock-alerts/tests/contract/api.contract.test.ts
sha256: 5fa7d5281ef2ad549e2c6709b9c6fd98fba3d23c20c71c4375dedf31b42c496a
generated_at: 2026-10-29T05:59:48.720671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/stock-alerts` endpoints (GET, POST, DELETE). Because every route returns the same `StockAlertsResponseEnvelope`, these tests exist solely to confirm each declared HTTP branch (200, 401, 404, 409, 422, 405) is reachable over real HTTP and that the response body matches the spec shape. Business-logic and inventory-signal wiring is explicitly left to the integration suite.

## Key elements

- **`soldOut()`** (local helper) — creates a product with `onHand: 0` via `createProduct` and returns its `_id` as a string; the only product state a valid stock-alert request can target.
- **`describe('GET /stock-alerts')`** — asserts 200 with empty `items`, 200 with one item after a prior POST, and 401 without auth.
- **`describe('POST /stock-alerts')`** — asserts idempotent 200 (two identical POSTs → still one item), 409 with error code `STOCK_ALERT_PRODUCT_BUYABLE` when the product is in stock, 404 for a nonexistent product, 422 for malformed or missing `productId`, 401 without auth, and 405 on the legacy `/stock-alerts/{id}` URL (verifying the `Allow` header is `DELETE`).
- **`describe('DELETE /stock-alerts/{productId}')`** — asserts 200 with emptied `items` on successful cancel, 404 for a request the caller doesn't hold, and 401 without auth.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`); registers contract-assertion helpers before any test runs.
- **`tests/support/http.ts`** — provides `api` (a pre-configured HTTP client) and `authenticateAsRole` (mints a bearer token for a given role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to reset/prepare the test database before any describe block executes.
- **`tests/support/ids.ts`** — supplies the `MISSING_ID` constant used to exercise 404 / malformed-ID branches.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the product fixtures (sold-out or in-stock) needed by the alert tests.

## Notes

- `setupTestDb()` runs at import time (not inside `beforeAll`), so it executes exactly once when the file is loaded by the test runner.
- The idempotency POST test asserts `second.body.items` has length **1**, not 2 — duplicate requests must not create duplicate entries.
- The 405 test targets the old per-product URL (`/stock-alerts/{id}`) and checks both status **and** the `Allow` response header, confirming the route still only accepts `DELETE`.
- The file intentionally does **not** test inventory-signal side-effects; that responsibility belongs to `tests/integration/stock-alerts.test.ts`.
