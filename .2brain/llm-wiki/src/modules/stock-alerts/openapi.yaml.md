---
source: src/modules/stock-alerts/openapi.yaml
sha256: 9ddb7cee99347182836d9403918ef1f4c4a6fe5106b08597f9d1068accddb972
generated_at: 2026-11-14T22:04:03.686426+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the stock-alerts module. It defines the REST surface for letting an authenticated user create, list, and cancel "notify me when this product is back in stock" requests, and declares the module's contribution to the account data export (`x-personal-data`). It also registers module-specific error codes that the bundler surfaces to clients.

## Key elements

- **`tags: StockAlerts`** — single tag, tagged with `x-family: Catalogue`, under which all three operations are grouped.
- **`x-error-codes`** — two module-level 409 codes:
  - `STOCK_ALERT_LIMIT_REACHED` — account already holds `NODE_STOCK_ALERTS_MAX` (default 100) requests for *other* products.
  - `STOCK_ALERT_PRODUCT_BUYABLE` — the target product is currently orderable, so a request is refused.
- **`x-personal-data.stockAlerts`** — schema fragment the bundler merges into `POST /account/export`; an array of `StockAlert` objects.
- **`GET /stock-alerts`** (`listStockAlerts`) — returns the caller's open requests, newest first. No pagination (capped by the 100-request limit). Empty list ≠ 404.
- **`POST /stock-alerts`** (`createStockAlert`) — idempotent create; body is `{ productId }`. Always returns the full open-request list. 409 for the two error codes above; 404 for hidden/deleted product; 422 for missing/malformed `productId`.
- **`DELETE /stock-alerts/{productId}`** (`deleteStockAlert`) — cancels one request. 404 if the caller does not hold it (stale client).
- **`components.schemas`**:
  - `CreateStockAlertRequest` — `{ productId: Id }`, no extra properties.
  - `StockAlert` — `{ productId, createdAt }`; the caller identity is implicit (auth header), not stored in the record.
  - `StockAlertsResponse` — `{ items: StockAlert[] }`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every cross-module `$ref` (shared `Id` schema, `ProductIdPathParam`, and the standard 401/404/409/422 response objects) resolves into this file. The relative path `../../../shared/contracts/openapi.root.yaml` is used throughout.
- **`src/modules/stock-alerts/module.yaml`** — the module manifest; the bundler reads `x-personal-data` and `x-error-codes` from this OpenAPI file and merges them into the root spec and account-export schema respectively.
- **`src/modules/stock-alerts/module.ts`** — the TypeScript implementation that satisfies these endpoints; the operation IDs (`listStockAlerts`, `createStockAlert`, `deleteStockAlert`) are the contract binding between the two.

## Notes

- The list is the parent resource: a single `StockAlert` has no dedicated GET or URL. All read paths return `StockAlertsResponse`.
- A request is **single-use**: it is deleted server-side when fulfilled (stock becomes available). It never transitions to an "answered" state visible to the client.
- `POST` is idempotent by product: re-asking for the same `productId` returns 200 with the unchanged list, not a duplicate entry.
- The 100-request cap (`NODE_STOCK_ALERTS_MAX`) is environment-configurable; the OpenAPI description states the default but the runtime value can differ.
- The `productId` parameter on `DELETE` uses the shared `ProductIdPathParam`, so its name and format are governed by `openapi.root.yaml`, not this file.
