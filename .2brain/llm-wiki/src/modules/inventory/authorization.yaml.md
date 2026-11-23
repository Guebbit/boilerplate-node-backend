---
source: src/modules/inventory/authorization.yaml
generated_at: 2026-11-22T05:16:11.488610+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `inventory` module. Each rule is a permission key (action + subject) scoped to a tenant, and the sets bundle those rules into named groups that can be assigned to roles.

## Key elements
- **`rules`**: four permission entries, all with `module: inventory` and `scope: tenant`:
  - `read:StockLevel`: read stock levels and the movements behind them.
  - `create:StockMovement`: record a receipt or an adjustment. The description says stock never moves without one.
  - `update:StockLevel`: edit a product's stock level (set its preorder limit). The counters move only through stock movements.
  - `sweep:StockLevel`: clear expired reservation holds on a schedule. This is not a CRUD verb.
- **`sets`**: named bundles of rules:
  - `InventoryDisplay`: `read:StockLevel`
  - `InventoryManagement`: `create:StockMovement`, `update:StockLevel`
  - `InventorySweep`: `sweep:StockLevel`

## Relationships
- `src/modules/inventory/openapi.yaml` is the neighboring API spec for the same module. The rule keys here are the permissions that guard the module's routes. The content of this file does not show how the two are linked, so check that file to see which operations use which rule.

## Notes
- `sweep` is a custom action, not a CRUD verb. A comment refers to an `actions:` section "above", but this file contains no such section, so it is declared elsewhere.
- Per the comments, `sweep` is granted to no preset role except `admin`, which holds it by name like every other key. `InventorySweep` exists as a separate set so the permission can be assigned on its own.
- A comment says `sweep` guards the one route that clears expired reservation holds on a schedule (see `inventory/routes.ts`).
- Rule references in sets use the `action:Subject` format.
- Reading movements falls under `read:StockLevel`. There is no separate movement-read rule.
- Stock counters cannot be edited directly. Only the preorder limit can be changed through `update:StockLevel`.
