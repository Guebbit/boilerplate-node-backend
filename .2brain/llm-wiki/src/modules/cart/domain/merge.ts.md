---
source: src/modules/cart/domain/merge.ts
sha256: 32659dfc2d40c80d641e783feae859b75fe7ba01175be35e25f5ce68ffbfe696
generated_at: 2026-10-29T03:21:30.679037+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/merge.ts

## Purpose

Pure decision function that computes how many units a single guest cart line should add, given the current cart contents, the product's listed status, and the per-line cap. It exists to isolate the merge arithmetic from I/O so the cap and stock checks live in the service layer above.

## Key elements

- **`MergeLineFacts`** (interface) — input: `requested`, `held`, `listed` (visible vs. deleted/hidden), `lineMax`.
- **`MergePlan`** (interface) — output: `add` (units to append; `0` means write nothing) and an optional `reason`.
- **`planMergeLine(facts): MergePlan`** — the sole exported function. Returns `{ add: 0, reason: 'removed' }` when `listed` is false; otherwise caps at `lineMax` and reports `capped` if the shopper received less than requested, `summed` if the line was merged into an existing holding, or no reason when it lands exactly as asked.

## Relationships

- **`src/types/index.ts`** — provides the `MergeLineReason` union used in `MergePlan.reason`.
- **`src/modules/cart/domain/index.ts`** — barrel re-export of this module into the domain public surface.
- **`src/modules/cart/services/merge.ts`** — service-layer caller that supplies the cap and `fitsStock` flag, then applies the returned `add`/`reason` to the cart model.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — unit tests covering the reason-priority and boundary cases.

## Notes

- **Reason priority is fixed**: `removed` → `capped` → `summed`. Only one is ever reported.
- **Stock is deliberately absent.** A sold-out product is added the same way; the caller is responsible for `fitsStock` enforcement. Lowering the line to available stock here would let an attacker probe exact inventory by submitting `requested: 999` (see `docs/theory/defences/authorization.md`).
- **`listed` ≠ "in stock."** A product merely off sale is still listed and takes a line; a deleted/hidden product does not.
- The function is a pure constant arrow (`export const …`) with no side effects and no imports beyond the type.
