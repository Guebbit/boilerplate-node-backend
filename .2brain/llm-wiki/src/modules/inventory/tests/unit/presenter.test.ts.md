---
source: src/modules/inventory/tests/unit/presenter.test.ts
sha256: 47f330d3f9d9531624a3d7e4c23cbfe03f6e62e2eb71ee7b3f27d65876d4f969
generated_at: 2026-11-08T06:08:23.262918+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/presenter.test.ts

## Purpose

Unit tests for the two public presenter functions in the inventory module (`presentInventoryLevel`, `presentPreorderLevel`). The tests pin down the wire-form contract: a stored `null` cap must serialise as an **absent key**, never as an explicit `null` value.

## Key elements

- **`row(backorderLimit)`** – local helper that builds a fixed preorder counter object (`backordered: 4, ordered: 4, held: 1, paid: 3`) with a parameterised `backorderLimit`, used to drive `presentPreorderLevel` cases.
- **`describe('presentInventoryLevel')`** – two cases asserting that `backorderLimit` is present (including the value `0`) when the cap is non-null, and the key is entirely omitted when the cap is `null`.
- **`describe('presentPreorderLevel')`** – three cases covering:
  - cap present + `sellsAgainstCap: true` → both `backorderLimit` and `left` appear (`left` = cap − held − paid).
  - cap is `null` → neither `backorderLimit` nor `left` appears.
  - cap present + `sellsAgainstCap: false` → `backorderLimit` appears but `left` is omitted.

## Relationships

- **`src/modules/inventory/presenter.ts`** – the sole import target; supplies `presentInventoryLevel` and `presentPreorderLevel`, the two functions under test.

## Notes

- The `left` property is a derived "room remaining" figure; its presence is gated on **both** a non-null cap **and** `sellsAgainstCap: true`. The `sellsAgainstCap: false` case (cap present, `left` absent) is the non-obvious edge the suite guards against.
- `0` is a valid cap value and must still appear in the output — the "absent when null" rule does not extend to falsy values.
