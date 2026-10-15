---
source: src/modules/delivery/tests/unit/return-address.test.ts
sha256: d47db1e21960095bbb1fd622c158d09fbf7d6ebb3e775f85f5b5559f17840c66
generated_at: 2026-10-15T10:29:24.857253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/return-address.test.ts

## Purpose

Unit tests for `cheapestStandardShipping`, verifying the flat-rate and free-threshold behavior of standard delivery costs. The file name is a historical leftover: the original return-address tests were moved to the `orders` module, leaving only these rate tests behind under the old name.

## Key elements

- **`describe('cheapestStandardShipping')`** – Test suite covering two scenarios:
  - *Flat standard rate on a small order:* `cheapestStandardShipping(50)` → `5`. Comment clarifies that pickup counts as collection, not delivery.
  - *Free standard shipping above threshold:* `cheapestStandardShipping(100)` and `(150)` → `0`.

## Relationships

- **`src/modules/delivery/domain/index.ts`** – The single import source (`../../domain`); `cheapestStandardShipping` is re-exported from here.
- **`src/modules/delivery/domain/rates.ts`** – The underlying implementation file where `cheapestStandardShipping` is defined (re-exported through the domain index).

## Notes

- **Misleading filename.** Despite `return-address` in the path, no return-address logic is tested here. The module docstring points to `orders/tests/unit/config.test.ts` for those tests. Rename or split only when touching this file.
- **Threshold is inclusive at 100.** The test asserts `cheapestStandardShipping(100) === 0`, so the free-shipping cutoff is "≥ 100," not "> 100."
