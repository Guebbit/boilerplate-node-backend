---
source: src/modules/cart/domain/merge.ts
sha256: 32659dfc2d40c80d641e783feae859b75fe7ba01175be35e25f5ce68ffbfe696
generated_at: 2026-11-08T05:13:18.653116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/merge.ts

## Purpose

Pure domain rule that decides what a single guest cart line adds to the cart, given the current held quantity, whether the product is publicly listed, and the per-line cap. It contains no I/O, no catalogue lookups, and no model access — the caller supplies every input. It exists to isolate the "how many units land" decision so it can be tested and reasoned about in isolation from the service layer that invokes it.

## Key elements

- **`MergeLineFacts`** (interface) — the input record: `requested` (guest line quantity), `held` (what the cart already holds), `listed` (product publicly visible vs. deleted/hidden), `lineMax` (per-line ceiling).
- **`MergePlan`** (interface) — the output record: `add` (units to write, `0` means nothing is added) and an optional `reason` (`MergeLineReason`) explaining why the result differs from a naïve sum.
- **`planMergeLine`** (exported const) — the single pure function. Returns `{ add }` when the line lands exactly as asked; otherwise includes the first applicable reason in priority order: `removed` → `capped` → `summed`.

## Relationships

- **`src/types/index.ts`** — provides the `MergeLineReason` union type used in `MergePlan.reason`.
- **`src/modules/cart/domain/index.ts`** — barrel file; re-exports this module's public API for consumers within the cart domain.
- **`src/modules/cart/services/merge.ts`** — service-layer caller that invokes `planMergeLine` and handles the I/O (catalogue listing check, stock validation via `fitsStock`) before and after the pure call.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — unit tests that exercise `planMergeLine` against `MergeLineFacts` fixtures.

## Notes

- **Stock is deliberately excluded.** A sold-out or short product is added normally here; the service layer flags it via a separate `fitsStock` check. Lowering the line to available stock would let a caller probe exact inventory by requesting 999 (see `docs/theory/defences/authorization.md`, "Reading the shelf").
- **`listed` is not "in stock."** It distinguishes deleted/hidden products (no line at all, `removed`) from merely off-sale products (treated as listed, takes a line).
- **Reason priority is fixed.** When multiple conditions hold, only the first in `removed` → `capped` → `summed` is reported. `capped` signals the shopper received fewer units than requested; `summed` is informational context.
- **`add: 0` with no reason** means the line lands exactly as asked (e.g., a re-request of the same quantity that is already held — the function still computes, but the arithmetic yields `add = 0` with `held > 0`, so it would actually return `summed`). The "no reason" path is the case where `held = 0` and `requested ≤ lineMax`.
