---
source: src/modules/inventory/tests/unit/presenter.test.ts
sha256: 47f330d3f9d9531624a3d7e4c23cbfe03f6e62e2eb71ee7b3f27d65876d4f969
generated_at: 2026-10-29T04:08:58.600819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/presenter.test.ts

## Purpose

Unit tests for the inventory presenter functions that shape raw stock counters into their wire form. The file verifies the "absent key, never `null`" convention: when a cap is absent, the key must be omitted from the output object entirely.

## Key elements

- **`row(backorderLimit)`** – Local fixture helper. Returns a preorder row with fixed counts (`backordered: 4`, `ordered: 4`, `held: 1`, `paid: 3`) and a `productId` of `'p1'`, varying only the `backorderLimit` argument.
- **`describe('presentInventoryLevel')`** – Two assertions:
  - A cap of `0` is included (falsy but present).
  - A cap of `null` is omitted (no `backorderLimit` key).
- **`describe('presentPreorderLevel')`** – Three assertions:
  - Cap present + `sellsAgainstCap: true` → both `backorderLimit` and computed `left` appear.
  - Cap absent (`null`) → neither `backorderLimit` nor `left` appears.
  - Cap present + `sellsAgainstCap: false` → `backorderLimit` appears but `left` is omitted.

## Relationships

- **`src/modules/inventory/presenter.ts`** – The module under test. Imports `presentInventoryLevel` and `presentPreorderLevel` and exercises their output shape.

## Notes

- Tests assert *absence* via `.not.toHaveProperty('key')` rather than checking for a `null` value. This enforces the wire-form contract stated in the module doc comment: a stored `null` cap maps to an absent key, never a `null` value in the output.
- The `sellsAgainstCap` flag decouples cap presence from `left` computation: the cap can be reported while `left` is suppressed.
- The `row` helper omits `available` and `onHand` fields; it only supplies the counters relevant to the preorder path.
