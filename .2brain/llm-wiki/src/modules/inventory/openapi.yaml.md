---
source: src/modules/inventory/openapi.yaml
sha256: dcbbaf1ac844b73433b99e76095f2e8d4e3654dfc5bea01b270b0fa0cbbcae3b
generated_at: 2026-10-29T04:01:52.504290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose
OpenAPI 3.1.0 module contract for the inventory domain. Defines the admin-facing REST surface for stock levels, preorder allowances, and the stock-movement ledger, plus the custom error code the module can raise.

## Key elements
- **`tags`** — single `Inventory` tag; scopes all operations to stock counters and holds.
- **`x-error-codes`** — module-level custom extension declaring `INVENTORY_BELOW_RESERVED` (HTTP 409) for the below-reserved condition.
- **`GET /inventory/levels`** (`listInventoryLevels`) — paginated stock board; supports `lowOnly` boolean filter; ordered most-scarce-first.
- **`GET /inventory/preorders`** (`listPreorderLevels`) — paginated preorder board (cap, outstanding split by paid/unpaid); ordered most-outstanding-first.
- **`GET /inventory/levels/{productId}`** (`getInventoryLevel`) — single product level row.
- **`PATCH /inventory/levels/{productId}`** (`updateInventoryLevel`) — merge-patch (RFC 7396) to change only `backorderLimit`; idempotent; accepts `application/json` and `application/merge-patch+json`.
- **`GET /inventory/movements`** (`listStockMovements`) — paginated ledger, newest-first; filterable by `productId` and `reason`; `meta.totalItems` reports full match count.
- **`POST /inventory/levels/{productId}/receive`** (`receiveStock`) — supplier delivery; increments `onHand`; requires `Idempotency-Key` header.
- **Referenced schemas** (defined later in the file, beyond truncation): `InventoryLevel`, `InventoryLevelsResponse`, `PreorderLevelsResponse`, `UpdateInventoryLevelRequest`, `StockMovementsResponse`, `StockMovementReason`, `ReceiptRequest`.
- **Security** — every operation requires `bearerAuth` or `apiKeyAuth`.

## Relationships
- **`shared/contracts/openapi.root.yaml`** — the sole external dependency. Provides reusable components consumed via `$ref`: pagination parameters (`PageParam`, `PageSizeParam`), the `Id` schema, the `IdempotencyKeyHeader` parameter, and the standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `Conflict`).

## Notes
- **Merge-patch semantics on PATCH:** an empty body is a no-op that returns the current level; the operation is absolute and idempotent (safe to retry).
- **`backorderLimit` conventions:** `0` closes backordering for new orders (existing outstanding are unaffected); `null` removes the cap entirely.
- **Preorder data is admin-only** by design — exact counts are flagged as competitive-sensitive and never exposed publicly.
- **Idempotency on `receive`:** a retried request with the same `Idempotency-Key` replays the first response; a key still being processed by an in-flight request returns 409.
- **Movements ledger is paged, not capped:** the file explicitly notes this is the audit record, and a response that omits older rows would misreport history as complete.
- **File is truncated in this snapshot** — additional paths (e.g., `adjust`) and the full `components/schemas` block exist below the visible content.
