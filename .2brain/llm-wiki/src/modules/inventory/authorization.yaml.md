---
source: src/modules/inventory/authorization.yaml
sha256: 813d548852064fdec92f2d4306feec3b2c5db62bf58aea5b7f1880d1f51e9b4e
generated_at: 2026-11-08T05:56:56.700473+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/authorization.yaml

## Purpose

Declarative authorization policy for the inventory module. Defines which subjects a tenant-scoped role may act upon (read, create, update, sweep) and groups those rules into named **sets** that the runtime permission check consults when a request hits an inventory route.

## Key elements

- **`rules`** — Four fine-grained permission entries, each specifying `action`, `subject`, `module`, `scope: tenant`, and a human-readable `description`.
  - `read:StockLevel` — view current levels and the movements behind them.
  - `create:StockMovement` — record a receipt or adjustment; the only mechanism that mutates counters.
  - `update:StockLevel` — edit a product's preorder limit; explicitly *not* a stock-move operation.
  - `sweep:StockLevel` — guard for the scheduled route that clears expired reservation holds. Not a CRUD verb; granted only to `admin` by name (no preset role includes it).
- **`sets`** — Named bundles that group rules for role assignment:
  - `InventoryDisplay` → `read:StockLevel`
  - `InventoryManagement` → `create:StockMovement`, `update:StockLevel`
  - `InventorySweep` → `sweep:StockLevel`

## Relationships

- **`src/modules/inventory/module.ts`** — The module bootstrap that loads this YAML and wires the rules/sets into the authorization middleware applied to inventory routes.
- **`src/modules/inventory/openapi.yaml`** — Declares the inventory HTTP endpoints; each endpoint maps to one of the rules above (e.g. the sweep route referenced in the `sweep` comment in `inventory/routes.ts`).

## Notes

- `update:StockLevel` is a **preorder-limit setter**, not a stock mutation. All actual counter changes go through `create:StockMovement`.
- `sweep` is a **non-CRUD action** guarding a scheduled (cron-like) route, not a user-facing CRUD operation. It is intentionally excluded from preset role sets and must be granted to `admin` by name.
- Every rule is `scope: tenant`-scoped; there is no global or per-tenant override in this file.
