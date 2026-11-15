---
source: src/modules/inventory/openapi.yaml
sha256: ca31d3b84d24af3f639e386a49b03a88a0eccbb415d2960658dedd0b73e2acb9
generated_at: 2026-11-14T20:04:46.035158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the inventory module. It defines the REST surface for stock levels, preorder allowances, the stock-movement ledger, and counter-changing operations (receive, adjust), including auth scopes, idempotency requirements, and shared error codes.

## Key elements

- **Tag `Inventory`** (`x-family: Catalogue`) — single tag covering all operations; describes scope as "stock counters and the holds placed against them."
- **`x-error-codes`** — module-level custom error `INVENTORY_BELOW_RESERVED` (409): requested on-hand count falls below already-reserved units.
- **`GET /inventory/levels`** (`listInventoryLevels`) — paged stock board, most-scarce-first; supports `lowOnly` filter. Scope `read:StockLevel`.
- **`GET /inventory/preorders`** (`listPreorderLevels`) — paged preorder allowances (cap, outstanding split by paid/unpaid). Admin-only; never public.
- **`GET /inventory/levels/{productId}`** (`getInventoryLevel`) — single product's counters and availability.
- **`PATCH /inventory/levels/{productId}`** (`updateInventoryLevel`) — RFC 7396 merge-patch; only `backorderLimit` is editable. Idempotent. Scope `update:StockLevel`.
- **`GET /inventory/movements`** (`listStockMovements`) — paged, newest-first ledger of every counter delta; filterable by `productId` and `reason`.
- **`POST /inventory/levels/{productId}/receive`** (`receiveStock`) — the only unit-creating transition. Requires `Idempotency-Key` header; specific idempotency error codes (400/409/422). Scope `create:StockMovement`.
- **Schemas** (referenced, defined later in the truncated file): `InventoryLevelsResponse`, `PreorderLevelsResponse`, `InventoryLevel`, `UpdateInventoryLevelRequest`, `StockMovementsResponse`, `ReceiptRequest`, `StockMovementReason`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All common parameters (`PageParam`, `PageSizeParam`, `RequiredIdempotencyKeyHeader`), the `Id` schema, and standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`) are pulled in via `$ref`.
- **`src/modules/inventory/module.ts`** — The runtime module that implements the endpoints described here; this YAML is its declarative contract.
- **`src/modules/inventory/module.yaml`** — Module metadata/configuration that the runtime loader reads alongside this spec.
- **`src/modules/inventory/authorization.yaml`** — Defines the `bearerAuth` / `apiKeyAuth` schemes and scope semantics (`read:StockLevel`, `update:StockLevel`, `create:StockMovement`) referenced in every operation's `security` block.
- **`src/modules/delivery/module.yaml`** — The `receive` endpoint is the inventory-side counterpart of a supplier delivery; the two modules are paired conceptually (delivery triggers a stock receipt).

## Notes

- **Ordering is implicit:** list endpoints that represent a queue (levels, preorders) or a log (movements) do **not** accept a `sort` parameter — the order is fixed by the contract description.
- **PATCH ≠ stock movement:** `updateInventoryLevel` changes only the preorder limit and explicitly leaves no ledger row; actual counter changes go through `receive` / `adjust` (the latter is in the truncated portion).
- **Idempotency on `receive` is mandatory:** a missing key yields 400; a key whose first attempt is still in-flight or has an unknown outcome yields 409, and no counter change occurs. Callers must read the level back before retrying with a new key.
- **File is truncated** in the provided content; additional paths (e.g. `adjust`, possibly `cancel`) and all `components/schemas` definitions exist below the cut point.
- **`x-family: Catalogue`** on the tag is a cross-cutting grouping hint consumed by tooling; it does not affect the OpenAPI spec validation.
