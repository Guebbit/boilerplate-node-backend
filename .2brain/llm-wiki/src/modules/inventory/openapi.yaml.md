---
source: src/modules/inventory/openapi.yaml
source_sha256: ef66ab9c7f18206bb5df179bed736112bdbf0b1caa98fb0454d36e03717036ac
context_sha256: 50ef088d491a23090decaee468780d11473e4c6bed343128b44313753981ad07
generated_at: 2026-11-22T05:20:15.664190+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the inventory module. It declares the module's `Inventory` tag (family `Catalogue`: stock counters and the holds placed against them), its module-specific error code, and the admin-facing endpoints for viewing stock, preorder allowances and the stock-movement ledger, and for changing stock.

## Key elements
- **Tag `Inventory`**: the tag all of this module's operations file themselves under.
- **`x-error-codes`**: declares `INVENTORY_BELOW_RESERVED` (409), raised when the requested on-hand count is below what open orders have already reserved.
- **`GET /inventory/levels`** (`listInventoryLevels`): the stock board. Every product with its three counters and derived availability, most scarce first. Takes `PageParam` and `PageSizeParam`, plus a `lowOnly` boolean filter (default false) for products at or under the low-availability threshold. Requires `read:StockLevel`.
- **`GET /inventory/preorders`** (`listPreorderLevels`): the preorder board. Each product's cap and what is outstanding against it, split into unpaid and paid orders, most outstanding first. `backordered` counts outstanding units; `ordered` is the lifetime count from the ledger. Requires `read:StockLevel`.
- **`GET /inventory/levels/{productId}`** (`getInventoryLevel`): one product's level. An unknown product, a product with no level row and a malformed id all return the same 404. Requires `read:StockLevel`.
- **`PATCH /inventory/levels/{productId}`** (`updateInventoryLevel`): RFC 7396 merge-patch, accepting `application/json` and `application/merge-patch+json`. Only `backorderLimit` is editable. `0` closes the allowance and `null` removes the cap. It is idempotent and leaves no ledger row, though it is audited. Requires `update:StockLevel`.
- **`GET /inventory/movements`** (`listStockMovements`): the paged ledger, newest first, filterable by `productId` and `reason` (`StockMovementReason`). `meta.totalItems` counts everything matching the filters. Requires `read:StockLevel`.
- **`POST /inventory/levels/{productId}/receive`** (`receiveStock`): records a supplier delivery. It raises `onHand` but not `reserved`. It requires an `Idempotency-Key` header (`RequiredIdempotencyKeyHeader`) and has per-operation `x-error-codes` for idempotency failures (400 `IDEMPOTENCY_KEY_REQUIRED`; 409 `IDEMPOTENCY_IN_FLIGHT` and `IDEMPOTENCY_OUTCOME_UNKNOWN`; 422 `IDEMPOTENCY_KEY_MISMATCH`). Requires `create:StockMovement` and a `ReceiptRequest` body.
- **Local schemas referenced**: `InventoryLevelsResponse`, `PreorderLevelsResponse`, `InventoryLevel`, `UpdateInventoryLevelRequest`, `StockMovementsResponse`, `StockMovementReason` and `ReceiptRequest`, all under `#/components/schemas`.

## Relationships
- **`src/modules/inventory/authorization.yaml`**: the neighbor in the dependency graph. The permission names used in `security` (`read:StockLevel`, `update:StockLevel`, `create:StockMovement`) are the scopes this file relies on. This page doesn't show how that file defines them.

## Notes
- Every operation is secured with either `bearerAuth` or `apiKeyAuth`, using the same scope.
- The list endpoints are queues or logs, so they take no `sort` parameter. The ordering is fixed.
- Shared parameters, responses and the `Id` schema (`PageParam`, `PageSizeParam`, `RequiredIdempotencyKeyHeader`, `Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`) are referenced from `shared/contracts/openapi.root.yaml`, not defined here.
- Customers never see raw counts (`onHand`, `reserved`). They get `availability` and `availabilityDate` from `GET /products/{id}/availability`, which is outside this file.
- The movements ledger is documented as having no gaps, because each row is written by the same call that moves the counter.
- Lowering `backorderLimit` below what is already outstanding is allowed. It affects only new orders.
