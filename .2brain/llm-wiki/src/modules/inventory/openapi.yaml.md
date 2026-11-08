---
source: src/modules/inventory/openapi.yaml
sha256: b722df4cf111ed882c70bc6d7725da02a247d7f9341d3aa0a965b7ef7513115c
generated_at: 2026-11-08T06:00:35.431791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose

The OpenAPI 3.1.0 contract for the **inventory** module. It defines the HTTP surface for stock counters, holds/preorder allowances, and the movement ledger — the single source of truth for what operations the inventory module exposes, their auth requirements, request/response shapes, and error semantics. It exists so that consumers (clients, other modules, codegen tools) agree on the wire format without reading implementation code.

## Key elements

- **`tags`** — Single tag `Inventory` (family `Catalogue`); all operations file under it.
- **`x-error-codes`** — Module-level custom error `INVENTORY_BELOW_RESERVED` (409): requested on-hand count is below already-reserved units.
- **`GET /inventory/levels`** (`listInventoryLevels`) — Paged stock board, most-scarce-first. Supports `lowOnly` filter. Admin-only (`read:StockLevel`).
- **`GET /inventory/preorders`** (`listPreorderLevels`) — Paged preorder allowances (cap, outstanding split by paid/unpaid, lifetime `ordered`). Admin-only; never public.
- **`GET /inventory/levels/{productId}`** (`getInventoryLevel`) — Single product's counters and availability.
- **`PATCH /inventory/levels/{productId}`** (`updateInventoryLevel`) — RFC 7396 merge-patch; only `backorderLimit` is editable. Absolute/idempotent; no ledger row written. Requires `update:StockLevel`.
- **`GET /inventory/movements`** (`listStockMovements`) — Paged audit ledger, newest-first. Filterable by `productId` and `reason`.
- **`POST /inventory/levels/{productId}/receive`** (`receiveStock`) — Supplier delivery; raises `onHand`. Requires `Idempotency-Key` header. Emits `IDEMPOTENCY_IN_FLIGHT` / `IDEMPOTENCY_KEY_MISMATCH` errors.
- *(file is truncated; additional paths such as `adjust` and further movements are expected below the cutoff.)*
- All operations use `bearerAuth` or `apiKeyAuth` (defined in the shared components).
- Shared parameters (`PageParam`, `PageSizeParam`, `IdempotencyKeyHeader`) and responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`) are `$ref`-ed from the root contract.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This spec `$ref`s its shared components (pagination params, `Id` schema, standard error responses, idempotency header). The root file is the canonical owner of those definitions; this file never re-declares them.
- **`src/modules/inventory/module.yaml`** — Module manifest that points the registry at this OpenAPI file and binds it to the inventory service identity.
- **`src/modules/inventory/module.ts`** — TypeScript implementation that must satisfy the operations and schemas declared here; this file is the contract it is tested against.
- **`src/modules/inventory/authorization.yaml`** — Declares the scoped permissions (`read:StockLevel`, `update:StockLevel`) that appear in the operation descriptions and govern the 403 paths in this spec.
- **`src/modules/delivery/module.yaml`** — The delivery module's contract is the upstream trigger for `receiveStock`; deliveries that complete produce the POST this module consumes.

## Notes

- **Ordering is semantic, not user-selectable.** `levels` and `preorders` are sorted most-scarce / most-outstanding-first, and `movements` is newest-first. The spec deliberately omits a `sort` parameter — these are queues/logs, not browsable tables.
- **`backorderLimit` semantics:** `0` closes the cap; `null` removes it (unlimited backorders). Lowering below existing outstanding orders is legal; only *new* orders are refused.
- **PATCH is not a stock movement.** It changes the preorder allowance only; it writes no ledger row and does not touch `onHand` or `reserved`.
- **Idempotency is mandatory on `receive`.** A retried POST with the same key must replay the first response. The 409 `IDEMPOTENCY_IN_FLIGHT` and 422 `IDEMPOTENCY_KEY_MISMATCH` codes are defined per-operation, not globally.
- **Preorder data is explicitly admin-only.** The description calls out that exact counts are competitive-sensitive; there is no public variant of this endpoint.
- The file uses OpenAPI **3.1.0** (JSON Schema 2020-12 semantics), not 3.0.x — relevant if a toolchain pins to 3.0.
