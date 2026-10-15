---
source: src/modules/inventory/openapi.yaml
sha256: 787fe979d9412d64d733fa892d8574f45643b83808f229d35e021e1c66c5d865
generated_at: 2026-10-15T10:35:06.850789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the inventory module. It defines the HTTP surface for stock counters (on-hand / reserved), preorder allowances, the stock-movement ledger, and the mutation endpoints (receipt, adjustment) that change those counters. Serves as the single source of truth for client and server teams building against this module.

## Key elements
- **`x-error-codes`** — custom extension declaring `INVENTORY_BELOW_RESERVED` (409), used when an adjustment would push `onHand` below `reserved`.
- **`GET /inventory/levels`** (`listInventoryLevels`) — paginated stock board; supports a `lowOnly` filter to surface products at or under the low-availability threshold.
- **`GET /inventory/preorders`** (`listPreorderLevels`) — admin preorder board showing cap, outstanding (split unpaid/paid), and lifetime ordered count per product.
- **`PUT /inventory/levels/{productId}/preorder-limit`** (`setPreorderLimit`) — absolute, idempotent set of a product's preorder allowance; lowering below outstanding is allowed (existing orders untouched).
- **`GET /inventory/movements`** (`listStockMovements`) — paginated ledger, newest first; filterable by `productId` and `reason`.
- **`POST /inventory/receipts`** (`receiveStock`) — adds units to `onHand`; requires an `Idempotency-Key` header to make retries safe.
- **`POST /inventory/adjustments`** (`adjustStock`) — signed stocktake correction; refuses to drop `onHand` below `reserved`; also requires `Idempotency-Key`.
- **Local schemas** (defined under `components`, truncated in source): `InventoryLevelsResponseEnvelope`, `PreorderLevelsResponseEnvelope`, `PreorderLimitRequest`, `InventoryLevelEnvelope`, `StockMovementsResponseEnvelope`, `StockMovementReason`, `ReceiptRequest`, `AdjustmentRequest`.

## Relationships
- **`shared/contracts/openapi.root.yaml`** — the root contract referenced (relative path `../../../shared/contracts/…`) for:
  - Shared parameters: `PageParam`, `PageSizeParam`, `IdempotencyKeyHeader`.
  - Standard error responses: `Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `NotFound`, `Conflict`.
  - Shared schema: `Id` (used for the `productId` path parameter and `productId` query filter).

## Notes
- Every operation requires `bearerAuth` or `apiKeyAuth`; there are no unauthenticated endpoints in this module.
- Mutating endpoints (`receipts`, `adjustments`) are idempotent via an `Idempotency-Key` header; a retry with the same key replays the original response rather than applying the delta twice.
- `setPreorderLimit` is absolute (PUT semantics) and idempotent by design — safe to retry without an explicit idempotency key.
- The `x-error-codes` block is a module-level extension, not a standard OpenAPI construct; tooling that ignores vendor extensions will not surface `INVENTORY_BELOW_RESERVED` automatically.
- The file is truncated in the source snapshot; the full `components/schemas` section (envelopes, request bodies, enums) lives below the visible portion.
